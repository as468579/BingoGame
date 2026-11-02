'use strict';
const { randomUUID } = require('node:crypto');
const { fail } = require('../../domain/errors');
const { requireHost } = require('../../domain/room-access');
const { createBoard, boardValid, createCells, winningLineGoal } = require('./board');
const { teams, assignPlayer } = require('./teams');
const { advanceTurn } = require('./turns');
const { captureGameState, undoGame, REVERSIBLE_ACTIONS } = require('./history');
const { createLinePrizes, awardLinePrizes, teamLines } = require('./prizes');
const { useCard, cancelCard, answerCard, judgeCard, finishCard, drawForNumber } = require('./card-actions');
function settings(room, player, data) {
  requireHost(room, player, '只有房主可以修改遊戲設定。');
  if (room.phase !== 'lobby') fail('請先重新開局，再修改設定。');
  const { size = room.size, teamCount = room.teamCount, playersPerTeam = room.playersPerTeam } = data;
  if (![size, teamCount, playersPerTeam].every(Number.isInteger) || size < 3 || size > 9 || teamCount < 2 ||
      playersPerTeam < 1 || teamCount * playersPerTeam > 16 || room.players.length > teamCount * playersPerTeam) fail('請設定至少 2 隊、共最多 16 人，以及 3～9 的盤面。');
  Object.assign(room, { size, teamCount, playersPerTeam, board: createBoard(size), boardVersion: room.boardVersion + 1 });
  resetProgress(room);
  room.players.forEach(p => { p.teamId = null; p.ready = false; p.hand = []; });
  room.players.forEach(p => assignPlayer(room, p));
}
function team(room, player, data) {
  if (room.phase !== 'lobby') fail('開始後不能更換隊伍。');
  const member = room.players.find(p => p.id === (data.playerId || player.id));
  if (!member || (member.id !== player.id && room.host !== player.id)) fail('只能變更自己或由房主分配隊伍。', 403);
  if (data.teamId !== null && !teams(room).some(t => t.id === data.teamId)) fail('無效的隊伍。');
  if (data.teamId && room.players.filter(p => p.id !== member.id && p.teamId === data.teamId).length >= room.playersPerTeam) fail('該隊已滿，請先移出一位玩家。');
  member.teamId = data.teamId; member.ready = false;
}
function ready(room, player, data) {
  if (room.phase !== 'lobby' || !player.teamId) fail('請在準備階段加入隊伍。');
  if (typeof data.ready !== 'boolean') fail('無效的準備狀態。');
  player.ready = data.ready;
}
function board(room, player, data) {
  requireHost(room, player, '只有房主可以編輯共用盤面。');
  if (room.phase !== 'lobby') fail('開始後不能修改盤面。');
  if (data.boardVersion !== room.boardVersion) fail('盤面已更新，請重新確認。', 409);
  if (!boardValid(data.board, room.size)) fail(`請填入 1～${room.size ** 2}，每個數字只能出現一次。`);
  const changed = data.board.some((n, i) => n !== room.board[i]);
  room.board = [...data.board]; room.cells = createCells(room.board);
  if (changed) { room.boardVersion++; room.players.forEach(p => { p.ready = false; }); }
  if (typeof data.ready === 'boolean') player.ready = data.ready;
}
function start(room, player) {
  requireHost(room, player, '只有房主可以開始遊戲。');
  if (room.phase !== 'lobby') fail('遊戲已開始。');
  if (room.players.some(p => !p.ready || !p.teamId) ||
      teams(room).some(t => !room.players.some(p => p.teamId === t.id))) fail('每隊至少需要 1 位玩家，且所有玩家都必須完成分隊與準備。');
  room.phase = 'playing'; room.turn = room.players[0].id; room.history = [];
  room.roundStart = captureGameState(room).playerStates;
}
function call(room, player, data) {
  if (room.phase !== 'playing') fail('目前不是選號階段。');
  if (room.turn !== player.id) fail('請等待輪到你選號。', 403);
  if (!Number.isInteger(data.number) || data.number < 1 || data.number > room.size ** 2) fail('無效的號碼。');
  const cell = room.cells.find(c => c.number === data.number);
  if (cell.isCovered) fail('這個格子已被佔領，不能重複選取。');
  Object.assign(cell, { isCovered: true, teamId: player.teamId, playerId: player.id });
  room.called.push(data.number);
  room.lastDecision = { id: randomUUID(), playerId: player.id, number: data.number, approved: true, drawnCardId: drawForNumber(player).id };
  awardLinePrizes(room);
  room.winners = teams(room).filter(t => teamLines(room, t.id) >= winningLineGoal(room.size)).map(t => t.id);
  if (room.winners.length || room.called.length === room.size ** 2) {
    if (!room.winners.length) {
      const best = Math.max(...teams(room).map(t => teamLines(room, t.id)));
      room.winners = teams(room).filter(t => teamLines(room, t.id) === best).map(t => t.id);
    }
    room.phase = 'finished'; room.turn = null;
  } else advanceTurn(room);
}
function scan(room, player, data, presence) {
  requireHost(room, player, '只有房主可以重新掃描玩家。');
  if (room.phase !== 'lobby') fail('請在準備階段重新掃描。');
  const retained = room.players.filter(p => p.id === room.host || presence.isOnline(p.id));
  room.lastScanRemovedCount = room.players.length - retained.length; room.lastScanAt = Date.now(); room.players = retained;
}
function skip(room, player, data, presence) {
  requireHost(room, player, '只有房主可以略過離線玩家。');
  if (room.phase !== 'playing' || presence.isOnline(room.turn)) fail('只能略過目前離線的選號玩家。');
  advanceTurn(room);
}
function resetProgress(room) {
  Object.assign(room, { cells: createCells(room.board), called: [], turn: null, winners: [], pending: null, lastDecision: null,
    activeCard: null, history: [], roundStart: null, linePrizes: createLinePrizes(room.size) });
  room.players.forEach(p => { p.usedDemoCards = []; });
}
function reset(room, player) {
  requireHost(room, player, '只有房主可以重新開局。');
  room.phase = 'lobby'; room.boardVersion++; resetProgress(room);
  room.players.forEach(p => { p.ready = false; p.hand = []; });
}
function undo(room, player, data) { requireHost(room, player, '只有房主可以回到上一步。'); undoGame(room, data.revision); }
function rerollPrizes(room, player) {
  requireHost(room, player, '只有房主可以重新隨機獎品。');
  if (room.phase !== 'lobby') fail('只能在遊戲開始前重新隨機獎品。');
  room.linePrizes = createLinePrizes(room.size);
}
const handlers = { settings, board, team, ready, start, call, scan, skip, reset, undo, rerollPrizes,
  cardUse: useCard, cardCancel: cancelCard, cardAnswer: answerCard, cardJudge: judgeCard, cardFinish: finishCard };
function applyGameAction(room, player, data, presence) {
  if (!Object.hasOwn(handlers, data.kind)) fail('不支援的 BingoNext 操作。');
  if (room.activeCard && !['cardCancel', 'cardAnswer', 'cardJudge', 'cardFinish'].includes(data.kind)) fail('卡牌作答期間暫停遊戲。', 409);
  const before = REVERSIBLE_ACTIONS.has(data.kind) && room.phase === 'playing' ? captureGameState(room) : null;
  handlers[data.kind](room, player, data, presence);
  if (before) room.history.push(before);
}
module.exports = { applyGameAction };
