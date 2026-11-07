'use strict';
const { publishGoalProgress } = require('./goal-progress');
const { participants } = require('./participants');
const { randomUUID } = require('node:crypto');

// Each team gets as many actions per round as the largest active team has members.
function completeTurn(room) {
  if (!room.turn) return;
  const members = participants(room).filter(player => player.teamId);
  const actor = members.find(player => player.id === room.turn);
  if (!actor) return;
  const acted = new Set(room.roundActedIds || []);
  const sizes = {};
  for (const member of members) sizes[member.teamId] = (sizes[member.teamId] || 0) + 1;
  if (!room.roundActionCounts) {
    // Older saves tracked unique actors only; retain their completed actions.
    room.roundActionCounts = {};
    for (const id of acted) {
      const teamId = members.find(member => member.id === id)?.teamId;
      if (teamId) room.roundActionCounts[teamId] = (room.roundActionCounts[teamId] || 0) + 1;
    }
  }
  acted.add(room.turn);
  room.roundActionCounts[actor.teamId] = (room.roundActionCounts[actor.teamId] || 0) + 1;
  const target = Math.max(...Object.values(sizes));
  room.roundNumber ||= 1;
  if (Object.keys(sizes).every(teamId => (room.roundActionCounts[teamId] || 0) >= target)) {
    publishGoalProgress(room);
    room.lastRoundEnd = { id: randomUUID(), round: room.roundNumber, nextRound: room.roundNumber + 1 };
    room.roundNumber++; room.roundActedIds = []; room.roundActionCounts = {};
  } else room.roundActedIds = [...acted];
}

module.exports = { completeTurn };
