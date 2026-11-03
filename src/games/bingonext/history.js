'use strict';
const { randomUUID } = require('node:crypto');
const { fail } = require('../../domain/errors');
const REVERSIBLE_ACTIONS = new Set(['call', 'skip', 'cardUse']);
function captureGameState(room) {
  return structuredClone({ phase: room.phase, turn: room.turn, called: room.called, cells: room.cells,
    winners: room.winners, endReason: room.endReason || null, pending: null, lastDecision: room.lastDecision, activeCard: room.activeCard || null,
    linePrizes: room.linePrizes, teamHands: room.teamHands || {}, timeBonuses: room.teamClock?.bonuses || {},
    playerStates: room.players.map(p => ({ id: p.id, hand: p.hand, usedDemoCards: p.usedDemoCards || [] })) });
}
function canUndo(room) { return Boolean(room.history?.length); }
function undoGame(room, revision) {
  if (revision !== room.revision) fail('遊戲進度已更新，請查看最新狀態。', 409);
  if (!canUndo(room)) fail('已經回到本局剛開始。');
  const { playerStates, timeBonuses = {}, ...progress } = room.history.pop();
  if (room.teamClock) {
    for (const [teamId, bonus] of Object.entries(room.teamClock.bonuses || {})) {
      room.teamClock.remaining[teamId] = Math.max(0, room.teamClock.remaining[teamId] - (bonus - (timeBonuses[teamId] || 0)));
    }
    room.teamClock.bonuses = structuredClone(timeBonuses);
  }
  Object.assign(room, structuredClone(progress));
  for (const player of room.players) {
    const saved = playerStates.find(p => p.id === player.id);
    player.hand = structuredClone(saved.hand); player.usedDemoCards = [...saved.usedDemoCards];
  }
  if (room.activeCard) room.activeCard.id = randomUUID();
}
module.exports = { REVERSIBLE_ACTIONS, captureGameState, canUndo, undoGame };
