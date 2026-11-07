'use strict';
const catalog = require('./hidden-goal-catalog');
const { selectedIds } = require('./hidden-goal-state');
const { goalCompleted, hasHiddenVictory } = require('./victory');

function goalReward(id) {
  const reward = catalog.find(card => card.id === id)?.reward;
  return reward ? { item: reward.item, quantity: reward.quantity } : null;
}
// Derive settlement from completed selected goals, so reconnects cannot award twice
// and undo restores rewards along with the underlying game state.
function hiddenGoalRewards(room, teamId) {
  if (room.phase !== 'finished') return [];
  return selectedIds(room, teamId).filter(id => goalCompleted(room, teamId, id) ||
    (id === 'quick-finish' && hasHiddenVictory(room, teamId)))
    .map(goalReward).filter(Boolean);
}
module.exports = { goalReward, hiddenGoalRewards };
