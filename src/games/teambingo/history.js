'use strict';
const { randomUUID } = require('node:crypto');
const { fail } = require('../../domain/errors');
const REVERSIBLE_ACTIONS = new Set(['call', 'skip', 'cardUse']);
function captureGameState(room) {
  return structuredClone({ phase: room.phase, turn: room.turn, turnCursors: room.turnCursors || {}, called: room.called, cells: room.cells,
    winners: room.winners, endReason: room.endReason || null, pending: null, lastDecision: room.lastDecision, activeCard: room.activeCard || null,
    linePrizes: room.linePrizes, teamHands: room.teamHands || {}, cardDrawCounts: room.cardDrawCounts || {}, teamBonusRewards: room.teamBonusRewards || {}, timeBonuses: room.teamClock?.bonuses || {}, hintBonuses: room.hintBonuses || {},
    playerStates: room.players.map(p => ({ id: p.id, hand: p.hand, usedDemoCards: p.usedDemoCards || [] })) });
}
function canUndo(room) { return Boolean(room.history?.length); }
function undoGame(room, revision) {
  if (revision !== room.revision) fail('遊戲進度已更新，請查看最新狀態。', 409);
  if (!canUndo(room)) fail('已經回到本局剛開始。');
  const { playerStates, timeBonuses = {}, hintBonuses = {}, teamBonusRewards = {}, turnCursors = {}, ...progress } = room.history.pop();
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
  Object.assign(room, structuredClone({ ...progress, turnCursors }));
  for (const player of room.players) {
    const saved = playerStates.find(p => p.id === player.id);
    player.hand = structuredClone(saved.hand); player.usedDemoCards = [...saved.usedDemoCards];
  }
  if (room.activeCard) room.activeCard.id = randomUUID();
}
module.exports = { REVERSIBLE_ACTIONS, captureGameState, canUndo, undoGame };
