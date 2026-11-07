'use strict';
const { fail } = require('../../domain/errors');
const { teams } = require('./teams');
const { startTurn } = require('./turns');
const { randomUUID } = require('node:crypto');
const { remainingTime, overtimeState } = require('./team-clock');
const { settleVictory, countPrimeCells, bestOwnedLine, countCorners, roundNumberSum, goalCompleted, hasHiddenVictory, ascendingNumberStreak } = require('./victory');
const { selectedIds, requiredCount, selectionComplete, DEFAULT_GOAL_COUNT } = require('./hidden-goal-state');
const catalog = require('./hidden-goal-catalog');
const { createOffers } = require('./hidden-goal-offers');

// Keep displayed rules current without changing saved selections or round progress.
function currentGoal(card, size) {
  if (!card) return null;
  const current = { ...card, ...catalog.find(definition => definition.id === card.id) };
  if (current.id.startsWith('pending-')) current.symbol = 'question-mark';
  if (current.id === 'almost-bingo' || current.id === 'mathematician') current.effect = current.effect.replaceAll('(n-1)', String(size - 1));
  return current;
}

// Public rule reference, independent of each team's private selections and progress.
function availableHiddenGoals(room) {
  const count = room.hiddenGoals ? requiredCount(room) : DEFAULT_GOAL_COUNT;
  return createOffers(room.size, count).map(card => currentGoal(card, room.size));
}

function goalProgress(room, teamId, id = selectedIds(room, teamId)[0]) {
  if (id === 'consecutive-numbers') return { current: ascendingNumberStreak(room, teamId), target: 4 };
  if (id === 'sage') return { current: room.teamCorrectAnswers?.[teamId] || 0, target: 4 };
  if (id === 'reckless') return { current: room.teamWrongAnswers?.[teamId] || 0, target: 3 };
  const roundSum = catalog.find(card => card.id === id)?.roundSum;
  if (roundSum !== undefined) return { current: roundNumberSum(room, teamId), target: roundSum };
  if (id === 'mathematician') return { current: countPrimeCells(room, teamId), target: room.size - 1 };
  if (id === 'almost-bingo') return { current: bestOwnedLine(room, teamId), target: room.size - 1 };
  if (id === 'four-corners') return { current: countCorners(room, teamId), target: 4 };
  return undefined;
}

// Placeholder choices have no victory predicate. Captains choose; hosts may review selected goals.
function beginHiddenGoals(room) {
  if (teams(room).some(team => !team.captainId)) fail('請先為每隊指定隊長。');
  room.hiddenGoals = { catalogVersion: 2, requiredCount: DEFAULT_GOAL_COUNT, choices: {}, guessRounds: {}, achieved: {}, completed: {},
    offers: Object.fromEntries(teams(room).map(team => [team.id, createOffers(room.size, DEFAULT_GOAL_COUNT)])) };
  room.phase = 'choosing-goal';
  room.turn = null;
}

function chooseHiddenGoal(room, player, data) {
  if (room.phase !== 'choosing-goal') fail('目前不是選擇隱藏勝利條件的階段。', 409);
  const team = teams(room).find(candidate => candidate.id === player.teamId);
  if (!team || team.captainId !== player.id) fail('只有該隊隊長可以選擇隱藏勝利條件。', 403);
  if (selectionComplete(room, team.id)) fail('已選擇隱藏勝利條件，無法更換。', 409);
  if (selectedIds(room, team.id).includes(data.goalId)) fail('不能重複選擇相同的隱藏勝利條件。');
  if ((catalog.find(card => card.id === data.goalId)?.minRequiredCount || 1) > requiredCount(room)) fail('此條件僅在選擇至少3個隱藏勝利條件時提供。');
  if (!room.hiddenGoals.offers[team.id]?.some(card => card.id === data.goalId)) fail('請選擇有效的隱藏勝利條件。');
  room.hiddenGoals.choices[team.id] = requiredCount(room) === 1 ? data.goalId : [...selectedIds(room, team.id), data.goalId];
  if (teams(room).every(candidate => selectionComplete(room, candidate.id))) {
    room.phase = 'playing';
    startTurn(room);
  }
}

function selectedCards(room, teamId) {
  return selectedIds(room, teamId).map(id => {
    const card = currentGoal((room.hiddenGoals.offers[teamId] || []).find(card => card.id === id), room.size);
    if (!card) return null;
    const progress = goalProgress(room, teamId, id);
    return { ...card, completed: goalCompleted(room, teamId, id) || (id === 'quick-finish' && hasHiddenVictory(room, teamId)), ...(progress ? { progress } : {}) };
  }).filter(Boolean);
}

function privateHiddenGoal(room, player) {
  if (!room.hiddenGoals || !player || player.id === room.host || room.captains?.[player.teamId] !== player.id) return null;
  const ids = selectedIds(room, player.teamId), complete = selectionComplete(room, player.teamId);
  const options = (room.hiddenGoals.offers[player.teamId] || []).filter(card => !ids.includes(card.id)).map(card => currentGoal(card, room.size));
  const selections = selectedCards(room, player.teamId);
  const selected = complete ? selections[0] || null : null;
  return { options: complete ? [] : options, selected, selections, requiredCount: requiredCount(room), selectionComplete: complete,
    ...(requiredCount(room) === 1 && selected && goalProgress(room, player.teamId) ? { progress: goalProgress(room, player.teamId) } : {}),
    ...(ids.includes('anticipate-opponent') ? { canGuess: canGuess(room, player), guessUsed: room.hiddenGoals.guessRounds?.[player.teamId] === (room.roundNumber || 1), round: room.roundNumber || 1 } : {}) };
}

function hostHiddenGoals(room, viewerId) {
  if (viewerId !== room.host || !room.hiddenGoals) return null;
  return teams(room).map(team => ({ teamId: team.id, teamName: team.name,
    selected: currentGoal((room.hiddenGoals.offers[team.id] || []).find(card => card.id === selectedIds(room, team.id)[0]), room.size),
    selections: selectedCards(room, team.id), requiredCount: requiredCount(room),
    ...(requiredCount(room) === 1 && goalProgress(room, team.id) ? { progress: goalProgress(room, team.id) } : {}) }));
}

function canGuess(room, player) {
  const overtime = overtimeState(room);
  const hasTime = player && (remainingTime(room, player.teamId) > 0 ||
    (overtime?.remainingMs > 0 && room.players.find(member => member.id === overtime.playerId)?.teamId === player.teamId));
  return Boolean(player && player.id !== room.host && room.captains?.[player.teamId] === player.id &&
    selectedIds(room, player.teamId).includes('anticipate-opponent') && !room.hiddenGoals?.achieved?.[player.teamId] && room.phase === 'playing' &&
    !room.activeCard && !room.hint && !room.hiddenGoalGuess && hasTime &&
    room.hiddenGoals.guessRounds?.[player.teamId] !== (room.roundNumber || 1));
}

function guessHiddenGoal(room, player) {
  if (!canGuess(room, player)) fail('只有選擇「料敵機先」的隊長可猜測，每回合限一次，且隊伍時間必須尚有剩餘。', 403);
  room.hiddenGoals.guessRounds ||= {};
  room.hiddenGoals.guessRounds[player.teamId] = room.roundNumber || 1;
  room.hiddenGoalGuess = { id: randomUUID(), teamId: player.teamId, captainId: player.id, round: room.roundNumber || 1 };
}

function judgeHiddenGoalGuess(room, player, data, presence, now = Date.now()) {
  if (player.id !== room.host) fail('只有房主可以判定猜測結果。', 403);
  if (room.phase !== 'playing' || !room.hiddenGoalGuess || room.hiddenGoalGuess.id !== data.guessId) fail('這次猜測已結束，請查看最新狀態。', 409);
  if (typeof data.correct !== 'boolean') fail('請判定猜測正確或錯誤。');
  const teamId = room.hiddenGoalGuess.teamId;
  if (data.correct) {
    room.hiddenGoals.achieved ||= {};
    room.hiddenGoals.achieved[teamId] = true;
  }
  room.hiddenGoalGuess = null;
  if (data.correct) settleVictory(room, undefined, now);
}

module.exports = { beginHiddenGoals, chooseHiddenGoal, privateHiddenGoal, hostHiddenGoals, guessHiddenGoal, judgeHiddenGoalGuess, availableHiddenGoals };
