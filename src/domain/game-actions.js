'use strict';

const { randomUUID } = require('node:crypto');
const { fail } = require('./errors');
const { createBoard, boardValid, lines } = require('./board');
const { requireHost, advanceTurn } = require('./room');
const { REVERSIBLE_ACTIONS, captureGameState, undoGame } = require('./game-history');

function settings(room, player, data) {
  requireHost(room, player, '只有房主可以設定盤面尺寸。');
  if (room.phase !== 'lobby') fail('請先重新開局，再修改盤面尺寸。');
  if (!Number.isInteger(data.size) || data.size < 3 || data.size > 9) fail('盤面尺寸請選擇 3～9。');
  if (data.size === (room.size || 5)) return;
  room.size = data.size;
  room.boardVersion = (room.boardVersion || 0) + 1;
  room.players.forEach(candidate => { candidate.board = createBoard(data.size); candidate.ready = false; });
  clearRound(room);
}

function board(room, player, data) {
  const size = room.size || 5;
  if (room.phase !== 'lobby') fail('遊戲開始後無法修改盤面。');
  if ((data.boardVersion || 0) !== (room.boardVersion || 0)) fail('盤面尺寸已更新，請重新排列並準備。', 409);
  if (!boardValid(data.board, size)) fail(`請填入 1～${size ** 2}，每個數字只能出現一次。`);
  player.board = data.board;
  player.ready = Boolean(data.ready);
}

function start(room, player) {
  requireHost(room, player, '只有房主可以開始遊戲。');
  if (room.phase !== 'lobby') fail('遊戲已經開始。');
  if (room.players.length < 2 || !room.players.every(candidate => candidate.ready)) {
    fail('至少需要 2 位玩家，且所有玩家都必須準備完成。');
  }
  room.phase = 'playing';
  room.turn = room.players[0].id;
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
  if (data.kind === 'approve') room.called.push(room.pending.number);
  room.pending = null;
  const size = room.size || 5;
  room.winners = room.players.filter(candidate => lines(candidate.board, room.called) >= size).map(candidate => candidate.id);
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
  room.called = [];
  room.turn = null;
  room.winners = [];
  room.pending = null;
  room.lastDecision = null;
  room.history = [];
}

function reset(room, player) {
  requireHost(room, player, '只有房主可以開新局。');
  room.phase = 'lobby';
  clearRound(room);
  room.players.forEach(candidate => { candidate.ready = false; });
}

const handlers = new Map(Object.entries({ settings, board, start, call, approve: decide, reject: decide, skip, undo, reset }));

function applyGameAction(room, player, data, presence) {
  const handler = handlers.get(data.kind);
  if (!handler) fail('不支援的操作。');
  const previous = REVERSIBLE_ACTIONS.has(data.kind) ? captureGameState(room) : null;
  handler(room, player, data, presence);
  if (previous) { room.history ||= []; room.history.push(previous); }
}

module.exports = { applyGameAction };
