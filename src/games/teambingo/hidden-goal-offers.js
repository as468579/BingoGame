'use strict';
const catalog = require('./hidden-goal-catalog');
const { DEFAULT_GOAL_COUNT } = require('./hidden-goal-state');

function createOffers(size, goalCount = DEFAULT_GOAL_COUNT) {
  return structuredClone(catalog.filter(card => size >= (card.minBoardSize || 3) && goalCount >= (card.minRequiredCount || 1) && !card.id.startsWith('pending-')));
}

module.exports = { createOffers };
