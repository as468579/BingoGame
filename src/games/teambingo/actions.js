'use strict';
const { randomUUID } = require('node:crypto');
const { fail } = require('../../domain/errors');
const { requireHost } = require('../../domain/room-access');
const { createBoard, boardValid, createCells, createSpecialCells } = require('./board');
const { teams, assignPlayer } = require('./teams');
const { teamHand } = require('./team-hands');
const { advanceTurn } = require('./turns');
const { captureGameState, undoGame, REVERSIBLE_ACTIONS } = require('./history');
const { createLinePrizes, awardLinePrizes } = require('./prizes');
const { settleVictory } = require('./victory');
const { DEFAULT_TEAM_MINUTES, validateTeamMinutes, initializeTeamClock, syncTeamClock } = require('./team-clock');
const { useCard, cancelCard, answerCard, judgeCard, nextQuestion, finishCard, drawForNumber } = require('./card-actions');
const { drawRoomCard } = require('./card-deck');
const { beginHiddenGoals, chooseHiddenGoal, guessHiddenGoal, judgeHiddenGoalGuess } = require('./hidden-goals');
const { participants, isCaptain } = require('./participants');
const { startHint, endHint } = require('./captain-hint');
const { updateIntroduction } = require('./introduction');
const { selectWinnerReward } = require('./winner-rewards');
const { validateGoalCount } = require('./hidden-goal-offers');
function settings(room, player, data) {
  requireHost(room, player, '只有房主可以修改遊戲設定。');
  if (room.phase !== 'lobby') fail('請先重新開局，再修改設定。');
  const { size = room.size, teamCount = room.teamCount, playersPerTeam = room.playersPerTeam, teamTimeMinutes = room.teamTimeMinutes ?? DEFAULT_TEAM_MINUTES, hiddenGoalCount = room.hiddenGoalCount ?? 2 } = data;
  validateTeamMinutes(teamTimeMinutes);
  if (![size, teamCount, playersPerTeam].every(Number.isInteger) || size < 3 || size > 9 || teamCount < 2 ||
      playersPerTeam < 1 || teamCount * playersPerTeam > 16 || room.players.filter(p => p.id !== room.host).length > teamCount * playersPerTeam) fail('請設定至少 2 隊、共最多 16 人，以及 3～9 的盤面。');
  validateGoalCount(hiddenGoalCount, size);
  Object.assign(room, { size, teamCount, playersPerTeam, teamTimeMinutes, hiddenGoalCount, board: createBoard(size), boardVersion: room.boardVersion + 1 });
  resetProgress(room);
  room.players.forEach(p => { p.teamId = null; p.ready = false; p.hand = []; });
  room.players.forEach(p => assignPlayer(room, p));
  room.captains = {};
}
function team(room, player, data) {
  if (room.phase !== 'lobby') fail('開始後不能更換隊伍。');
  const member = room.players.find(p => p.id === (data.playerId || player.id));
  if (member?.id === room.host) fail('房主為觀戰模式，不加入隊伍。', 403);
  if (!member || (member.id !== player.id && room.host !== player.id)) fail('只能變更自己或由房主分配隊伍。', 403);
  if (data.teamId !== null && !teams(room).some(t => t.id === data.teamId)) fail('無效的隊伍。');
  if (data.teamId && room.players.filter(p => p.id !== member.id && p.teamId === data.teamId).length >= room.playersPerTeam) fail('該隊已滿，請先移出一位玩家。');
  if (member.teamId !== data.teamId && room.captains?.[member.teamId] === member.id) delete room.captains[member.teamId];
  member.teamId = data.teamId; member.ready = false;
}
function captain(room, player, data) {
  requireHost(room, player, '只有房主可以指定隊長。');
  if (room.phase !== 'lobby') fail('請在準備階段指定隊長。');
  if (!teams(room).some(t => t.id === data.teamId)) fail('無效的隊伍。');
  if (data.playerId !== null && !room.players.some(p => p.id !== room.host && p.id === data.playerId && p.teamId === data.teamId)) fail('隊長必須是該隊成員。');
  room.captains ||= {};
  if (data.playerId === null) delete room.captains[data.teamId];
  else room.captains[data.teamId] = data.playerId;
}
function ready(room, player, data) {
  if (player.id === room.host) fail('房主為觀戰模式，不需要準備。', 403);
  if (room.phase !== 'lobby' || !player.teamId) fail('請在準備階段加入隊伍。');
  if (typeof data.ready !== 'boolean') fail('無效的準備狀態。');
  player.ready = data.ready;
}
function board(room, player, data) {
  requireHost(room, player, '只有房主可以編輯共用盤面。');
  if (room.phase !== 'lobby') fail('開始後不能修改盤面。');
  if (data.boardVersion !== room.boardVersion) fail('盤面已更新，請重新確認。', 409);
  if (!boardValid(data.board, room.size)) fail(`請填入 1～${room.size ** 2}，每個數字只能出現一次。`);
  const changed = data.rerollSpecial === true || data.board.some((n, i) => n !== room.board[i]);
  const previous = room.cells;
  room.board = [...data.board];
  room.cells = data.rerollSpecial === true ? createSpecialCells(room.board)
    : createCells(room.board).map((cell, index) => ({ ...cell, isSpecial: Boolean(previous[index]?.isSpecial) }));
  if (changed) {
    room.boardVersion++;
    if (data.rerollSpecial !== true) room.players.forEach(p => { p.ready = false; });
  }
  if (typeof data.ready === 'boolean' && player.id !== room.host) player.ready = data.ready;
}
function start(room, player) {
  requireHost(room, player, '只有房主可以開始遊戲。');
  if (room.phase !== 'lobby') fail('遊戲已開始。');
  if (room.players.some(p => p.id !== room.host && (!p.teamId || !p.ready)) ||
      teams(room).some(t => !room.players.some(p => p.teamId === t.id))) fail('每隊至少需要 1 位玩家，且所有玩家都必須完成分隊與準備。');
  if (teams(room).some(team => !participants(room).some(member => member.teamId === team.id))) fail('每隊除了隊長，至少需要 1 位隊員參與遊戲。');
  beginHiddenGoals(room); room.history = [];
  room.hintUsesRemaining = {};
  room.hintBonuses = {};
  room.teamBonusRewards = {};
  room.cardDrawCounts = {};
  room.teamCorrectAnswers = {};
  room.teamWrongAnswers = {};
  room.roundStart = captureGameState(room).playerStates;
}
function call(room, player, data, presence, now = Date.now()) {
  if (player.id === room.host) fail('房主為觀戰模式，不能圈選數字。', 403);
  if (isCaptain(room, player.id)) fail('隊長為觀戰模式，不能圈選數字。', 403);
  if (room.phase !== 'playing') fail('目前不是選號階段。');
  if (room.turn !== player.id) fail('請等待輪到你選號。', 403);
  if (!Number.isInteger(data.number) || data.number < 1 || data.number > room.size ** 2) fail('無效的號碼。');
  const cell = room.cells.find(c => c.number === data.number);
  if (cell.isCovered) fail('這個格子已被佔領，不能重複選取。');
  const drawnDefinition = cell.isSpecial ? drawRoomCard(room) : null;
  Object.assign(cell, { isCovered: true, teamId: player.teamId, playerId: player.id, claimedRound: room.roundNumber || 1 });
  room.called.push(data.number);
  room.lastDecision = { id: randomUUID(), playerId: player.id, teamId: player.teamId, number: data.number, approved: true, drawnCardId: drawnDefinition ? drawForNumber({ hand: teamHand(room, player.teamId) }, drawnDefinition).id : null };
  awardLinePrizes(room);
  if (!settleVictory(room, undefined, now)) advanceTurn(room);
}
function scan(room, player, data, presence) {
  requireHost(room, player, '只有房主可以重新掃描玩家。');
  if (room.phase !== 'lobby') fail('請在準備階段重新掃描。');
  const retained = room.players.filter(p => p.id === room.host || presence.isOnline(p.id));
  room.lastScanRemovedCount = room.players.length - retained.length; room.lastScanAt = Date.now(); room.players = retained;
  for (const [id, captainId] of Object.entries(room.captains || {})) {
    if (!retained.some(p => p.id === captainId && p.teamId === id)) delete room.captains[id];
  }
}
function skip(room, player, data, presence) {
  requireHost(room, player, '只有房主可以略過離線玩家。');
  if (room.phase !== 'playing' || presence.isOnline(room.turn)) fail('只能略過目前離線的選號玩家。');
  advanceTurn(room);
}
function resetProgress(room) {
  Object.assign(room, { cells: createSpecialCells(room.board), called: [], turn: null, winners: [], pending: null, lastDecision: null,
    activeCard: null, lastRoundEnd: null, winnerRewards: {}, winnerRewardSessionId: null, introduction: null, hint: null, hintUsesRemaining: {}, hintBonuses: {}, teamCorrectAnswers: {}, teamWrongAnswers: {}, teamBonusRewards: {}, cardDrawCounts: {}, history: [], roundStart: null, turnCursors: {}, hiddenGoals: null, hiddenGoalGuess: null, roundNumber: 1, roundActedIds: [], roundActionCounts: {}, usedQuestionIds: [], teamHands: {}, teamClock: null, endReason: null, linePrizes: createLinePrizes(room.size) });
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
const handlers = { winnerReward: selectWinnerReward, settings, board, team, captain, ready, start, hiddenGoal: chooseHiddenGoal, hiddenGoalGuess: guessHiddenGoal, hiddenGoalJudge: judgeHiddenGoalGuess, captainHint: startHint, endHint, call, scan, skip, reset, undo, rerollPrizes,
  cardUse: useCard, cardCancel: cancelCard, cardAnswer: answerCard, cardJudge: judgeCard, cardNextQuestion: nextQuestion, cardFinish: finishCard };
function applyGameAction(room, player, data, presence, now = Date.now()) {
  if (data.kind === 'introduction') {
    updateIntroduction(room, player, data, presence, now); syncTeamClock(room, now); return;
  }
  if (room.introduction?.open && data.kind !== 'reset') fail('房主正在介紹遊戲，請等待介紹結束。', 409);
  if (!Object.hasOwn(handlers, data.kind)) fail('不支援的團隊賓果操作。');
  if (room.hiddenGoalGuess && !['hiddenGoalJudge', 'reset'].includes(data.kind)) fail('等待房主判定猜測結果，遊戲暫停。', 409);
  if (room.hint && !['reset', 'endHint'].includes(data.kind)) fail('隊長提示中，請等待倒數結束。', 409);
  if (room.phase === 'choosing-goal' && !['hiddenGoal', 'reset'].includes(data.kind)) fail('請等待所有隊長選擇隱藏勝利條件。', 409);
  if (room.activeCard && !['cardCancel', 'cardAnswer', 'cardJudge', 'cardNextQuestion', 'cardFinish', 'winnerReward'].includes(data.kind)) fail('卡牌作答期間暫停遊戲。', 409);
  const before = REVERSIBLE_ACTIONS.has(data.kind) && room.phase === 'playing' ? captureGameState(room) : null;
  handlers[data.kind](room, player, data, presence, now);
  if (room.phase === 'playing') settleVictory(room, undefined, now);
  if (data.kind === 'start') initializeTeamClock(room, now);
  else syncTeamClock(room, now);
  if (before) room.history.push(before);
}
module.exports = { applyGameAction };
