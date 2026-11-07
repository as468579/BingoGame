'use strict';
const { randomUUID } = require('node:crypto');
const { fail } = require('../../domain/errors');
const REVERSIBLE_ACTIONS = new Set(['call', 'skip', 'cardUse', 'hiddenGoalGuess']);
function captureGameState(room) {
  return structuredClone({ phase: room.phase, turn: room.turn, turnCursors: room.turnCursors || {}, called: room.called, cells: room.cells,
    lastRoundEnd: room.lastRoundEnd || null, roundNumber: room.roundNumber || 1, roundActedIds: room.roundActedIds || [], hiddenGoalGuess: room.hiddenGoalGuess || null, teamCorrectAnswers: room.teamCorrectAnswers || {}, teamWrongAnswers: room.teamWrongAnswers || {},
    hiddenGoalProgress: { publicProgress: room.hiddenGoals?.publicProgress || {}, publicProgressRound: room.hiddenGoals?.publicProgressRound || 0, guessRounds: room.hiddenGoals?.guessRounds || {}, achieved: room.hiddenGoals?.achieved || {}, completed: room.hiddenGoals?.completed || {} },
    winnerRewards: room.winnerRewards || {}, winnerRewardSessionId: room.winnerRewardSessionId || null, winners: room.winners, endReason: room.endReason || null, pending: null, lastDecision: room.lastDecision, activeCard: room.activeCard || null,
    linePrizes: room.linePrizes, teamHands: room.teamHands || {}, cardDrawCounts: room.cardDrawCounts || {}, teamBonusRewards: room.teamBonusRewards || {}, timeBonuses: room.teamClock?.bonuses || {}, hintBonuses: room.hintBonuses || {},
    playerStates: room.players.map(p => ({ id: p.id, hand: p.hand, usedDemoCards: p.usedDemoCards || [] })) });
}
function canUndo(room) { return Boolean(room.history?.length); }
function undoGame(room, revision) {
  if (revision !== room.revision) fail('遊戲進度已更新，請查看最新狀態。', 409);
  if (!canUndo(room)) fail('已經回到本局剛開始。');
  const { playerStates, timeBonuses = {}, hintBonuses = {}, teamBonusRewards = {}, turnCursors = {},
    lastRoundEnd = null, winnerRewards = {}, winnerRewardSessionId = null, roundNumber = 1, roundActedIds = [], hiddenGoalGuess = null, hiddenGoalProgress, teamCorrectAnswers = {}, teamWrongAnswers = {}, ...progress } = room.history.pop();
  room.teamCorrectAnswers = structuredClone(teamCorrectAnswers);
  room.teamWrongAnswers = structuredClone(teamWrongAnswers);
  if (room.hiddenGoals) {
    room.hiddenGoals.publicProgress = structuredClone(hiddenGoalProgress?.publicProgress || {});
    room.hiddenGoals.publicProgressRound = hiddenGoalProgress?.publicProgressRound || 0;
    room.hiddenGoals.guessRounds = structuredClone(hiddenGoalProgress?.guessRounds || {});
    room.hiddenGoals.achieved = structuredClone(hiddenGoalProgress?.achieved || {});
    room.hiddenGoals.completed = structuredClone(hiddenGoalProgress?.completed || {});
  }
  room.teamBonusRewards = structuredClone(teamBonusRewards);
  for (const [teamId, bonus] of Object.entries(room.hintBonuses || {})) {
    room.hintUsesRemaining[teamId] = Math.max(0, (room.hintUsesRemaining[teamId] ?? 3) - (bonus - (hintBonuses[teamId] || 0)));
  }
  room.hintBonuses = structuredClone(hintBonuses);
  if (room.teamClock) {
    for (const [teamId, bonus] of Object.entries(room.teamClock.bonuses || {})) {
      room.teamClock.remaining[teamId] = Math.max(0, room.teamClock.remaining[teamId] - (bonus - (timeBonuses[teamId] || 0)));
    }
    room.teamClock.bonuses = structuredClone(timeBonuses);
  }
  Object.assign(room, structuredClone({ ...progress, lastRoundEnd, winnerRewards, winnerRewardSessionId, turnCursors, roundNumber, roundActedIds, hiddenGoalGuess }));
  for (const player of room.players) {
    const saved = playerStates.find(p => p.id === player.id);
    player.hand = structuredClone(saved.hand); player.usedDemoCards = [...saved.usedDemoCards];
  }
  if (room.activeCard) room.activeCard.id = randomUUID();
  if (room.hiddenGoalGuess) room.hiddenGoalGuess.id = randomUUID();
}
module.exports = { REVERSIBLE_ACTIONS, captureGameState, canUndo, undoGame };
