'use strict';
const { teams } = require('./teams');
const { teamLines, prizeLines } = require('./prizes');
const { winningLineGoal } = require('./board');
const { selectedIds, requiredCount, selectionComplete } = require('./hidden-goal-state');
const catalog = require('./hidden-goal-catalog');
const { randomUUID } = require('node:crypto');

function conditionMet(room, teamId, id) {
  const divisor = catalog.find(card => card.id === id)?.divisor;
  if (divisor) {
    const { current, target } = multiplesProgress(room, teamId, divisor);
    return target > 0 && current === target;
  }
  if (id === 'consecutive-numbers') return ascendingNumberStreak(room, teamId) >= room.size;
  if (id === 'sage') return (room.teamCorrectAnswers?.[teamId] || 0) >= 4;
  if (id === 'reckless') return (room.teamWrongAnswers?.[teamId] || 0) >= 3;
  const roundSum = catalog.find(card => card.id === id)?.roundSum;
  if (roundSum !== undefined) return roundNumberSum(room, teamId) === roundSum;
  if (id === 'four-corners') return countCorners(room, teamId) === 4;
  if (id === 'almost-bingo') return bestOwnedLine(room, teamId) >= room.size - 1;
  if (id === 'mathematician') return countPrimeCells(room, teamId) >= room.size - 1;
  return id === 'anticipate-opponent' && room.hiddenGoals?.achieved?.[teamId] === true;
}

function goalCompleted(room, teamId, id) {
  return Boolean(room.hiddenGoals?.completed?.[teamId]?.[id] || conditionMet(room, teamId, id));
}

function updateHiddenProgress(room) {
  if (!room.hiddenGoals || requiredCount(room) === 1) return;
  room.hiddenGoals.completed ||= {};
  for (const team of teams(room)) for (const id of selectedIds(room, team.id)) {
    if (conditionMet(room, team.id, id)) (room.hiddenGoals.completed[team.id] ||= {})[id] = true;
  }
}

function hasHiddenVictory(room, teamId, now = Date.now()) {
  if (!selectionComplete(room, teamId)) return false;
  const ids = selectedIds(room, teamId);
  const othersDone = ids.filter(id => id !== 'quick-finish').every(id => goalCompleted(room, teamId, id));
  if (!othersDone) return false;
  // Read the real running clock, including elapsed time and time-card bonuses.
  return !ids.includes('quick-finish') || require('./team-clock').remainingTime(room, teamId, now) > 360000;
}

function isPrime(number) {
  if (!Number.isInteger(number) || number < 2) return false;
  for (let factor = 2; factor * factor <= number; factor++) if (number % factor === 0) return false;
  return true;
}

function multiplesProgress(room, teamId, divisor) {
  const cells = room.cells.filter(cell => cell.number > 0 && cell.number % divisor === 0);
  return { current: cells.filter(cell => cell.isCovered && cell.teamId === teamId).length, target: cells.length };
}

function countPrimeCells(room, teamId) {
  return room.cells.filter(cell => cell.isCovered && cell.teamId === teamId && isPrime(cell.number)).length;
}

function roundNumberSum(room, teamId) {
  return room.cells.filter(cell => cell.isCovered && cell.teamId === teamId && cell.claimedRound === (room.roundNumber || 1))
    .reduce((sum, cell) => sum + cell.number, 0);
}

function ascendingNumberStreak(room, teamId) {
  const cells = new Map(room.cells.map(cell => [cell.number, cell]));
  let previous = null, streak = 0;
  for (const number of room.called) {
    const cell = cells.get(number);
    if (!cell?.isCovered || cell.teamId !== teamId) continue;
    streak = previous !== null && number === previous + 1 ? streak + 1 : 1;
    previous = number;
  }
  return streak;
}

function bestOwnedLine(room, teamId) {
  let best = 0;
  for (const line of prizeLines(room.size)) {
    let consecutive = 0;
    for (const index of line.indices) {
      const cell = room.cells[index];
      consecutive = cell.isCovered && cell.teamId === teamId ? consecutive + 1 : 0;
      best = Math.max(best, consecutive);
    }
  }
  return best;
}

function countCorners(room, teamId) {
  const size = room.size;
  return [0, size - 1, size * (size - 1), size * size - 1].filter(index => room.cells[index].isCovered && room.cells[index].teamId === teamId).length;
}

function winningTeams(room, hiddenRule = hasHiddenVictory, now = Date.now()) {
  return teams(room).filter(team => teamLines(room, team.id) >= winningLineGoal() || hiddenRule(room, team.id, now)).map(team => team.id);
}

function settleVictory(room, hiddenRule = hasHiddenVictory, now = Date.now()) {
  if (room.phase !== 'playing') return false;
  updateHiddenProgress(room);
  room.winners = winningTeams(room, hiddenRule, now);
  const full = room.cells.every(cell => cell.isCovered);
  if (!room.winners.length && !full) return false;
  if (room.winners.some(teamId => hasHiddenVictory(room, teamId, now))) room.endReason = 'hidden-goal';
  if (!room.winners.length) {
    room.endReason = 'board-full-draw';
  }
  room.winnerRewardSessionId = randomUUID(); room.winnerRewards = {};
  room.phase = 'finished'; room.turn = null;
  return true;
}

module.exports = { hasHiddenVictory, winningTeams, settleVictory, isPrime, countPrimeCells, bestOwnedLine, countCorners, roundNumberSum, goalCompleted, ascendingNumberStreak, multiplesProgress };
