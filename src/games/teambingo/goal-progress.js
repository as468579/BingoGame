'use strict';
const { teams } = require('./teams');
const { selectedIds, requiredCount } = require('./hidden-goal-state');
const catalog = require('./hidden-goal-catalog');
const { goalReward } = require('./goal-rewards');
const { countPrimeCells, bestOwnedLine, countCorners, goalCompleted, hasHiddenVictory, ascendingNumberStreak, multiplesProgress } = require('./victory');

function goalProgress(room, teamId, id = selectedIds(room, teamId)[0]) {
  const divisor = catalog.find(card => card.id === id)?.divisor;
  if (divisor) return multiplesProgress(room, teamId, divisor);
  if (id === 'consecutive-numbers') return { current: ascendingNumberStreak(room, teamId), target: room.size };
  if (id === 'sage') return { current: room.teamCorrectAnswers?.[teamId] || 0, target: 4 };
  if (id === 'reckless') return { current: room.teamWrongAnswers?.[teamId] || 0, target: 3 };
  const roundSum = catalog.find(card => card.id === id)?.roundSum;
  if (roundSum !== undefined) return { current: goalCompleted(room, teamId, id) ? 1 : 0, target: 1 };
  if (id === 'mathematician') return { current: countPrimeCells(room, teamId), target: room.size - 1 };
  if (id === 'almost-bingo') return { current: bestOwnedLine(room, teamId), target: room.size - 1 };
  if (id === 'four-corners') return { current: countCorners(room, teamId), target: 4 };
  return undefined;
}

// Store anonymous reports at round boundaries; snapshots never calculate live progress.
function publishGoalProgress(room) {
  if (!room.hiddenGoals) return;
  room.hiddenGoals.publicProgress = Object.fromEntries(teams(room).map(team => [team.id,
    selectedIds(room, team.id).map(id => {
      const progress = goalProgress(room, team.id, id);
      const completed = goalCompleted(room, team.id, id) || (id === 'quick-finish' && hasHiddenVictory(room, team.id));
      return { current: completed ? (progress?.target ?? 1) : (progress?.current ?? 0), target: progress?.target ?? 1, completed, reward: null };
    })]));
  room.hiddenGoals.publicProgressRound = room.roundNumber || 1;
}
function publicGoalProgress(room, teamId) {
  if (!room.hiddenGoals || room.phase === 'choosing-goal' || room.phase === 'lobby') return null;
  const saved = room.hiddenGoals.publicProgress?.[teamId];
  return { round: room.hiddenGoals.publicProgressRound || 0,
    conditions: Array.from({ length: requiredCount(room) }, (_, index) => {
      const entry = saved?.[index];
      // Older round reports stored the number sum. Use only their saved completion
      // flag so migration cannot expose live progress before the next round ends.
      const id = selectedIds(room, teamId)[index];
      if (catalog.some(card => card.id === id && card.roundSum !== undefined)) return { percentage: entry?.completed ? 100 : 0, reward: goalReward(id) };
      const ratio = Number.isFinite(entry?.current) && Number.isFinite(entry?.target) && entry.target > 0 ? entry.current / entry.target : 0;
      const percentage = entry?.completed ? 100 : Math.max(0, Math.min(99, Math.floor(ratio * 100)));
      return { percentage, reward: goalReward(id) };
    }) };
}
module.exports = { goalProgress, publishGoalProgress, publicGoalProgress };
