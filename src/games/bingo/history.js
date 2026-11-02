'use strict';

const { randomUUID } = require('node:crypto');
const { fail } = require('../../domain/errors');
const { createCells } = require('./board');
const { participants } = require('./participants');
const { createLinePrizes, migrateLinePrizes } = require('./prizes');

const REVERSIBLE_ACTIONS = new Set(['call', 'approve', 'reject', 'skip', 'cardUse']);

function initialGameState(room) {
  return { phase: 'playing', turn: participants(room)[0].id, called: [], winners: [], pending: null, lastDecision: null, activeCard: null,
    linePrizes: (room.linePrizes || createLinePrizes(room.size || 5)).map(prize => ({ ...prize, claimedBy: null })),
    playerStates: structuredClone(room.roundStart || room.players.map(player => ({ id: player.id, cells: createCells(player.board), hand: [] }))) };
}

function captureGameState(room) {
  return structuredClone({
    phase: room.phase, turn: room.turn, called: room.called, winners: room.winners,
    pending: room.pending || null, lastDecision: room.lastDecision || null,
    activeCard: room.activeCard || null,
    linePrizes: room.linePrizes || createLinePrizes(room.size || 5),
    playerStates: room.players.map(player => ({ id: player.id, cells: player.cells, hand: player.hand, usedDemoCards: player.usedDemoCards || [] }))
  });
}

function canUndo(room) {
  if (room.history?.length) return true;
  return ['playing', 'finished'].includes(room.phase) && (room.phase === 'finished' || room.called.length > 0 ||
    Boolean(room.pending) || Boolean(room.lastDecision) || room.winners.length > 0 || room.turn !== participants(room)[0].id ||
    room.players.some(player => player.cells?.some(cell => cell.isCovered)));
}

function undoGame(room, revision) {
  if (revision !== room.revision) fail('遊戲進度已更新，請查看最新狀態後再按上一步。', 409);
  if (!canUndo(room)) fail('已經回到本局剛開始，沒有更早的步驟。');
  // Old saves can lack early history. Preserve recorded steps, then restore the opening state.
  const previous = room.history?.length ? room.history.pop() : initialGameState(room);
  const { playerStates, ...progress } = previous;
  Object.assign(room, progress);
  room.activeCard = progress.activeCard || null;
  room.linePrizes = progress.linePrizes || (room.linePrizes || createLinePrizes(room.size || 5)).map(prize => ({ ...prize, claimedBy: null }));
  for (const player of room.players) {
    const saved = playerStates?.find(state => state.id === player.id);
    player.cells = saved ? structuredClone(saved.cells) : createCells(player.board, room.called);
    if (saved) player.hand = structuredClone(saved.hand);
    player.usedDemoCards = structuredClone(saved?.usedDemoCards || []);
  }
  if (!progress.linePrizes) migrateLinePrizes(room, true);
  // Invalidate decisions sent by older tabs before this selection was restored.
  if (room.pending) room.pending.id = randomUUID();
  if (room.activeCard) room.activeCard.id = randomUUID();
}

module.exports = { REVERSIBLE_ACTIONS, initialGameState, captureGameState, canUndo, undoGame };
