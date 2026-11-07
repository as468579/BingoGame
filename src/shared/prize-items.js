'use strict';
const { randomInt } = require('node:crypto');
const ITEMS = Object.freeze(['突襲券', '傳送石', '飄雪結晶', '護身符', '龍王項鍊', '楓葉祝福20', '超級藥水']);
const RETIRED = new Set(['紅色藥水', '活力藥水', 'hp_potion', 'mp_potion']);
const LIMITED_ITEMS = Object.freeze(['龍王項鍊', '楓葉祝福20']);
const REGULAR_ITEMS = Object.freeze(ITEMS.filter(item => !LIMITED_ITEMS.includes(item)));
const REGULAR_PRIZES = Object.freeze([
  { item: '飄雪結晶', quantity: 100 }, { item: '飄雪結晶', quantity: 50 },
  { item: '傳送石', quantity: 50 }, { item: '突襲券', quantity: 10 }, { item: '護身符', quantity: 40 }, { item: '超級藥水', quantity: 1000 }
].map(Object.freeze));

// Reserve exactly one random slot for either rare item on every new board.
function createPrizePicker(slotCount, pick = randomInt) {
  const rareSlot = pick(slotCount), rareItem = LIMITED_ITEMS[pick(LIMITED_ITEMS.length)];
  let slot = 0;
  return () => {
    if (slot++ === rareSlot) return { item: rareItem, quantity: 1 };
    return { ...REGULAR_PRIZES[pick(REGULAR_PRIZES.length)] };
  };
}

function migratePrizeQuantities(room, pick = randomInt) {
  // Undo must not turn an already-earned legacy reward into a larger new reward.
  const quantities = new Map((room.linePrizes || []).filter(prize => prize.claimedBy)
    .map(prize => [`${prize.id}:${prize.item}`, prize.quantity ?? 1]));
  for (const state of [room, ...(room.history || [])]) {
    for (const prize of state.linePrizes || []) {
      if (prize.claimedBy || room.phase === 'finished') { prize.quantity ??= 1; continue; }
      const variants = REGULAR_PRIZES.filter(choice => choice.item === prize.item);
      const allowed = variants.length ? variants.map(choice => choice.quantity) : [1];
      const key = `${prize.id}:${prize.item}`;
      if (!quantities.has(key)) quantities.set(key, allowed.includes(prize.quantity) ? prize.quantity
        : allowed.length === 1 ? allowed[0] : allowed[pick(allowed.length)]);
      prize.quantity = quantities.get(key);
    }
  }
}

// Keep an existing awarded rare prize; normalize only unclaimed duplicates.
// The same slot gets the same replacement in undo history.
function migrateLimitedPrizes(room, pick = randomInt) {
  if (room.phase === 'finished') return;
  const rare = (room.linePrizes || []).filter(prize => LIMITED_ITEMS.includes(prize.item));
  let kept = (rare.find(prize => prize.claimedBy) || rare[0])?.id;
  const replacements = new Map();
  if (kept === undefined) {
    const available = (room.linePrizes || []).filter(prize => !prize.claimedBy);
    if (available.length) {
      kept = available[pick(available.length)].id;
      replacements.set(kept, LIMITED_ITEMS[pick(LIMITED_ITEMS.length)]);
    }
  }
  for (const state of [room, ...(room.history || [])]) {
    for (const prize of state.linePrizes || []) {
      if (prize.claimedBy) continue;
      if (prize.id === kept) {
        if (replacements.has(kept)) prize.item = replacements.get(kept);
        continue;
      }
      if (!LIMITED_ITEMS.includes(prize.item)) continue;
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

module.exports = { ITEMS, LIMITED_ITEMS, REGULAR_PRIZES, createPrizePicker, migrateLimitedPrizes, migratePrizeQuantities, migrateRetiredPrizes };
