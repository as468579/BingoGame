'use strict';
const { randomInt } = require('node:crypto');
const ITEMS = Object.freeze(['突襲券', '傳送石', '飄雪結晶', '護身符', '龍王項鍊', '楓葉祝福20']);
const RETIRED = new Set(['紅色藥水', '活力藥水', 'hp_potion', 'mp_potion']);
const LIMITED_ITEMS = Object.freeze(['龍王項鍊', '楓葉祝福20']);
const REGULAR_ITEMS = Object.freeze(ITEMS.filter(item => !LIMITED_ITEMS.includes(item)));

// Both rare prizes share one slot allowance per board, not one allowance per type.
function createPrizePicker(pick = randomInt) {
  let pool = ITEMS;
  return () => {
    const item = pool[pick(pool.length)];
    if (LIMITED_ITEMS.includes(item)) pool = REGULAR_ITEMS;
    return item;
  };
}

// Keep an existing awarded rare prize; normalize only unclaimed duplicates.
// The same slot gets the same replacement in undo history.
function migrateLimitedPrizes(room, pick = randomInt) {
  if (room.phase === 'finished') return;
  const rare = (room.linePrizes || []).filter(prize => LIMITED_ITEMS.includes(prize.item));
  const kept = (rare.find(prize => prize.claimedBy) || rare[0])?.id;
  const replacements = new Map();
  for (const state of [room, ...(room.history || [])]) {
    for (const prize of state.linePrizes || []) {
      if (prize.id === kept || prize.claimedBy || !LIMITED_ITEMS.includes(prize.item)) continue;
      if (!replacements.has(prize.id)) replacements.set(prize.id, REGULAR_ITEMS[pick(REGULAR_ITEMS.length)]);
      prize.item = replacements.get(prize.id);
    }
  }
}

// Replace unclaimed retired prizes consistently across the live board and undo history.
// Already awarded items remain in historical results.
function migrateRetiredPrizes(room, pick = randomInt) {
  const replacements = new Map((room.linePrizes || []).filter(prize => ITEMS.includes(prize.item)).map(prize => [prize.id, prize.item]));
  for (const state of [room, ...(room.history || [])]) {
    for (const prize of state.linePrizes || []) {
      if (prize.claimedBy || !RETIRED.has(prize.item)) continue;
      if (!replacements.has(prize.id)) replacements.set(prize.id, ITEMS[pick(ITEMS.length)]);
      prize.item = replacements.get(prize.id);
    }
  }
}

module.exports = { ITEMS, LIMITED_ITEMS, createPrizePicker, migrateLimitedPrizes, migrateRetiredPrizes };
