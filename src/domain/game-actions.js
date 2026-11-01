'use strict';

const { randomUUID } = require('node:crypto');
const { fail } = require('./errors');
const { createBoard, boardValid, createCells, coverNumber, clearCovers, coveredLines, winningLineGoal } = require('./board');
const { createHand } = require('./hand');
const { requireHost, advanceTurn } = require('./room');
const { REVERSIBLE_ACTIONS, captureGameState, undoGame } = require('./game-history');
const { participants } = require('./participants');
const { useCard, cancelCard, answerCard, judgeCard, finishCard, drawForNumber } = require('./card-actions');
const { createLinePrizes, ensureLinePrizes, awardLinePrizes } = require('./line-prizes');

function scan(room, player, data, presence) {
  requireHost(room, player, '只有房主可以重新掃描玩家。');
  if (room.phase !== 'lobby') fail('請在準備階段重新掃描玩家；遊戲中可略過離線玩家。');
  const online = room.players.filter(candidate => candidate.id === player.id || presence.isOnline(candidate.id));
  const removed = room.players.filter(candidate => !online.includes(candidate));
  // Explicit host scan is the deletion boundary. A disconnect alone never removes data.
  delete room.archivedPlayers;
  room.players = online;
  room.participantIds = online.map(candidate => candidate.id);
  room.lastScanRemovedCount = removed.length;
  room.history = [];
  room.roundStart = null;
  room.lastScanAt = Date.now();
  ensureLinePrizes(room);
}

function settings(room, player, data) {
  requireHost(room, player, '只有房主可以設定盤面尺寸。');
  if (room.phase !== 'lobby') fail('請先重新開局，再修改盤面尺寸。');
  if (!Number.isInteger(data.size) || data.size < 3 || data.size > 9) fail('盤面尺寸請選擇 3～9。');
  if (data.size === (room.size || 5)) return;
  room.size = data.size;
  room.boardVersion = (room.boardVersion || 0) + 1;
  room.players.forEach(candidate => {
    candidate.board = createBoard(data.size);
    candidate.cells = createCells(candidate.board);
    candidate.hand = createHand();
    candidate.ready = false;
  });
  clearRound(room);
}

function board(room, player, data) {
  const size = room.size || 5;
  if (room.phase !== 'lobby') fail('遊戲開始後無法修改盤面。');
  if ((data.boardVersion || 0) !== (room.boardVersion || 0)) fail('盤面尺寸已更新，請重新排列並準備。', 409);
  if (!boardValid(data.board, size)) fail(`請填入 1～${size ** 2}，每個數字只能出現一次。`);
  player.board = data.board;
  player.cells = createCells(data.board);
  player.ready = Boolean(data.ready);
}

function rerollPrizes(room, player) {
  requireHost(room, player, '只有房主可以重新隨機獎品。');
  if (room.phase !== 'lobby') fail('只能在遊戲開始前重新隨機獎品。');
  room.linePrizes = createLinePrizes(room.size || 5);
}

function start(room, player) {
  requireHost(room, player, '只有房主可以開始遊戲。');
  if (room.phase !== 'lobby') fail('遊戲已經開始。');
  const roster = participants(room);
  if (roster.length < 2 || !roster.every(candidate => candidate.ready)) {
    fail('本局至少需要 2 位參與玩家，且參與玩家都必須準備完成。');
  }
  room.phase = 'playing';
  room.history = [];
  room.turn = roster[0].id;
  ensureLinePrizes(room);
  awardLinePrizes(room);
  room.roundStart = captureGameState(room).playerStates;
}

function call(room, player, data) {
  const count = (room.size || 5) ** 2;
  if (room.phase !== 'playing') fail('目前不是選號階段。');
  if (room.pending) fail('請先等待房主處理目前的選號。');
  if (room.turn !== player.id) fail('請等待輪到你選號。');
  if (!Number.isInteger(data.number) || data.number < 1 || data.number > count) fail(`號碼必須為 1～${count}。`);
  if (room.called.includes(data.number)) fail('這個號碼已經選過。');
  room.pending = { id: randomUUID(), playerId: player.id, number: data.number };
}

function decide(room, player, data) {
  requireHost(room, player, '只有房主可以確認或拒絕選號。');
  if (room.phase !== 'playing' || !room.pending) fail('目前沒有待確認的號碼。');
  if (data.pendingId !== room.pending.id) fail('此選號已處理，請以最新畫面為準。', 409);
  room.lastDecision = { ...room.pending, approved: data.kind === 'approve' };
  if (data.kind === 'approve') {
    room.called.push(room.pending.number);
    participants(room).forEach(candidate => coverNumber(candidate.cells, room.pending.number));
    awardLinePrizes(room);
    const caller = room.players.find(candidate => candidate.id === room.pending.playerId);
    room.lastDecision.drawnCardId = drawForNumber(caller).id;
  }
  room.pending = null;
  const size = room.size || 5;
  room.winners = participants(room).filter(candidate => coveredLines(candidate.cells) >= winningLineGoal(size)).map(candidate => candidate.id);
  if (room.winners.length || room.called.length === size ** 2) {
    room.phase = 'finished';
    room.turn = null;
  } else advanceTurn(room);
}

function skip(room, player, data, presence) {
  if (room.host !== player.id || room.phase !== 'playing') fail('只有房主可以略過離線玩家。', 403);
  if (room.pending) fail('請先確認或拒絕待處理的號碼。');
  if (presence.isOnline(room.turn)) fail('目前選號玩家仍在線上。');
  advanceTurn(room);
}

function undo(room, player, data) {
  requireHost(room, player, '只有房主可以回到上一步。');
  undoGame(room, data.revision);
}

function clearRound(room) {
  room.linePrizes = createLinePrizes(room.size || 5);
  room.activeCard = null;
  room.players.forEach(player => { player.usedDemoCards = []; });
  room.called = [];
  room.turn = null;
  room.winners = [];
  room.pending = null;
  room.lastDecision = null;
  room.history = [];
  room.roundStart = null;
}

function reset(room, player) {
  requireHost(room, player, '只有房主可以開新局。');
  room.phase = 'lobby';
  room.participantIds = null;
  room.lastScanAt = null;
  clearRound(room);
  room.players.forEach(candidate => {
    candidate.ready = false;
    clearCovers(candidate.cells);
    candidate.hand = createHand();
  });
}

const handlers = new Map(Object.entries({ settings, board, start, call, approve: decide, reject: decide, skip, undo, reset, scan, rerollPrizes,
  cardUse: useCard, cardCancel: cancelCard, cardAnswer: answerCard, cardJudge: judgeCard, cardFinish: finishCard }));

function applyGameAction(room, player, data, presence) {
  const handler = handlers.get(data.kind);
  if (!handler) fail('不支援的操作。');
  if (room.activeCard && !['cardCancel', 'cardAnswer', 'cardJudge', 'cardFinish'].includes(data.kind)) {
    fail('卡牌作答期間暫停遊戲，請先完成作答，或由房主結束作答。', 409);
  }
  const previous = REVERSIBLE_ACTIONS.has(data.kind) && (data.kind !== 'cardUse' || room.phase === 'playing') ? captureGameState(room) : null;
  handler(room, player, data, presence);
  if (previous) { room.history ||= []; room.history.push(previous); }
}

module.exports = { applyGameAction };
