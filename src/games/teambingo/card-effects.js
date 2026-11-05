'use strict';
const { addTeamTime } = require('./team-clock');
const { addHintUses } = require('./captain-hint');

function settlementReward(item, quantity) {
  return (room, active) => {
    room.teamBonusRewards ||= {};
    const rewards = room.teamBonusRewards[active.teamId] ||= {};
    rewards[item] = (rewards[item] || 0) + quantity;
  };
}

const effects = {
  'team-time-plus-2m': (room, active, now) => addTeamTime(room, active.teamId, 120000, now),
  'team-hints-plus-2': (room, active) => addHintUses(room, active.teamId, 2),
  'team-snow-crystals-20': settlementReward('飄雪結晶', 20),
  'team-teleport-stones-4': settlementReward('傳送石', 4),
  'team-raid-tickets-2': settlementReward('突襲券', 2)
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
