'use strict';
const { randomInt } = require('node:crypto');
const { cards } = require('./card-catalog');
const { fail } = require('../../domain/errors');

// Recover known cards in old saves by instance ID, including cards already consumed.
function migrateDrawCounts(room) {
  const seen = new Map();
  for (const state of [...(room.history || []), room]) {
    for (const held of [...Object.values(state.teamHands || {}).flat(), state.activeCard?.returnCard].filter(Boolean)) {
      if (held.id && held.definitionId) seen.set(held.id, held.definitionId);
    }
    if (!state.cardDrawCounts) {
      state.cardDrawCounts = {};
      for (const definitionId of seen.values()) state.cardDrawCounts[definitionId] = (state.cardDrawCounts[definitionId] || 0) + 1;
    }
  }
}

// The pool contains remaining copies, so drawing is without replacement across all teams.
function drawRoomCard(room, pick = randomInt) {
  const enabled = cards.filter(card => card.enabled !== false);
  if (!enabled.length) fail('這個遊戲的卡牌庫沒有啟用的卡片。');
  const pool = enabled.flatMap(card => Array(Math.max(0, (card.copiesPerGame ?? 2) - (room.cardDrawCounts?.[card.id] || 0))).fill(card));
  if (!pool.length) return null;
  const selected = pool[pick(pool.length)];
  room.cardDrawCounts ||= {};
  room.cardDrawCounts[selected.id] = (room.cardDrawCounts[selected.id] || 0) + 1;
  return selected;
}

module.exports = { drawRoomCard, migrateDrawCounts };
