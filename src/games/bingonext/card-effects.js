'use strict';
const { addTeamTime } = require('./team-clock');

const effects = {
  'team-time-plus-2m': (room, active, now) => addTeamTime(room, active.teamId, 120000, now)
};

function applyCardEffect(room, active, definition, now = Date.now()) {
  if (active.stage !== 'result' || active.correct !== true || active.effectApplied) return false;
  const effect = Object.hasOwn(effects, definition?.effectId) ? effects[definition.effectId] : null;
  if (!effect) return false;
  effect(room, active, now);
  active.effectApplied = true;
  return true;
}

module.exports = { applyCardEffect };
