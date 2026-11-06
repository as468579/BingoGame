'use strict';
const DEFAULT_GOAL_COUNT = 2;

function selectedIds(room, teamId) {
  const choice = room.hiddenGoals?.choices?.[teamId];
  return Array.isArray(choice) ? choice : typeof choice === 'string' ? [choice] : [];
}
function requiredCount(room) { return room.hiddenGoals?.requiredCount ?? 1; }
function selectionComplete(room, teamId) { return selectedIds(room, teamId).length === requiredCount(room); }

function migrateGoalAliases(room) {
  // Only pre-versioned saves used 88 as the former name of 66.
  if (room.hiddenGoals?.catalogVersion >= 2) return;
  const rename = id => id === 'round-88' ? 'round-66' : id;
  const completed = groups => {
    for (const goals of Object.values(groups || {})) if (Object.hasOwn(goals, 'round-88')) {
      goals['round-66'] = Boolean(goals['round-66'] || goals['round-88']); delete goals['round-88'];
    }
  };
  if (room.hiddenGoals) {
    for (const [teamId, choices] of Object.entries(room.hiddenGoals.choices)) {
      room.hiddenGoals.choices[teamId] = Array.isArray(choices) ? [...new Set(choices.map(rename))] : rename(choices);
    }
    for (const cards of Object.values(room.hiddenGoals.offers)) for (const card of cards) card.id = rename(card.id);
    completed(room.hiddenGoals.completed);
  }
  for (const state of room.history || []) completed(state.hiddenGoalProgress?.completed);
  if (room.hiddenGoals) room.hiddenGoals.catalogVersion = 2;
}

module.exports = { selectedIds, requiredCount, selectionComplete, migrateGoalAliases, DEFAULT_GOAL_COUNT };
