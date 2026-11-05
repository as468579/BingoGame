'use strict';
const { randomInt } = require('node:crypto');
const ITEMS = Object.freeze(['突襲券', '傳送石', '飄雪結晶', '護身符', '龍王項鍊', '楓葉祝福20']);
const RETIRED = new Set(['紅色藥水', '活力藥水', 'hp_potion', 'mp_potion']);

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

module.exports = { ITEMS, migrateRetiredPrizes };
