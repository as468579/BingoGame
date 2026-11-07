'use strict';
const DEFAULT_GOAL_COUNT = 2;

function selectedIds(room, teamId) {
  const choice = room.hiddenGoals?.choices?.[teamId];
  return Array.isArray(choice) ? choice : typeof choice === 'string' ? [choice] : [];
}
function requiredCount(room) { return room.hiddenGoals?.requiredCount ?? 1; }
function selectionComplete(room, teamId) { return selectedIds(room, teamId).length === requiredCount(room); }

function migrateGoalAliases(room) {
  if (!room.hiddenGoals || room.hiddenGoals.catalogVersion >= 3) return;
  const version = room.hiddenGoals.catalogVersion || 1;
  const aliases = { 'round-66': 'round-44', 'round-77': 'round-55', 'round-88': 'round-66' };
  const rename = id => {
    // Pre-versioned saves had only the original 88, later renamed to 66.
    if (version < 2 && id === 'round-88') id = 'round-66';
    return aliases[id] || id;
  };
  const completed = groups => {
    for (const [teamId, goals] of Object.entries(groups || {})) {
      const renamed = {};
      for (const [id, done] of Object.entries(goals)) renamed[rename(id)] = Boolean(renamed[rename(id)] || done);
      groups[teamId] = renamed;
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
  room.hiddenGoals.catalogVersion = 3;
}

module.exports = { selectedIds, requiredCount, selectionComplete, migrateGoalAliases, DEFAULT_GOAL_COUNT };
