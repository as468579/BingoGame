'use strict';

const { randomUUID } = require('node:crypto');
const { fail } = require('./errors');

const REVERSIBLE_ACTIONS = new Set(['call', 'approve', 'reject', 'skip']);

function initialGameState(room) {
  return { phase: 'playing', turn: room.players[0].id, called: [], winners: [], pending: null, lastDecision: null };
}

function captureGameState(room) {
  return structuredClone({
    phase: room.phase, turn: room.turn, called: room.called, winners: room.winners,
    pending: room.pending || null, lastDecision: room.lastDecision || null
  });
}

function canUndo(room) {
  if (room.history?.length) return true;
  return ['playing', 'finished'].includes(room.phase) && (room.phase === 'finished' || room.called.length > 0 ||
    Boolean(room.pending) || Boolean(room.lastDecision) || room.winners.length > 0 || room.turn !== room.players[0].id);
}

function undoGame(room, revision) {
  if (revision !== room.revision) fail('遊戲進度已更新，請查看最新狀態後再按上一步。', 409);
  if (!canUndo(room)) fail('已經回到本局剛開始，沒有更早的步驟。');
  // Old saves can lack early history. Preserve recorded steps, then restore the opening state.
  Object.assign(room, room.history?.length ? room.history.pop() : initialGameState(room));
  // Invalidate decisions sent by older tabs before this selection was restored.
  if (room.pending) room.pending.id = randomUUID();
}

module.exports = { REVERSIBLE_ACTIONS, initialGameState, captureGameState, canUndo, undoGame };
