'use strict';
const catalog = require('./hidden-goal-catalog');
const { DEFAULT_GOAL_COUNT } = require('./hidden-goal-state');
const { fail } = require('../../domain/errors');

function createOffers(size, goalCount = DEFAULT_GOAL_COUNT) {
  return structuredClone(catalog.filter(card => size >= (card.minBoardSize || 3) && goalCount >= (card.minRequiredCount || 1) && !card.id.startsWith('pending-')));
}

function maxGoalCount(size) { return createOffers(size, Number.MAX_SAFE_INTEGER).length; }
function validateGoalCount(count, size) {
  if (!Number.isInteger(count) || count < 1 || count > maxGoalCount(size)) fail(`每隊隱藏條件數量須為 1～${maxGoalCount(size)} 個。`);
  return count;
}
module.exports = { createOffers, maxGoalCount, validateGoalCount };
