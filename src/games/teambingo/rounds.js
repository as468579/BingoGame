'use strict';
const { publishGoalProgress } = require('./goal-progress');
const { participants } = require('./participants');
const { randomUUID } = require('node:crypto');

// Teams cycle independently. A round ends only after every eligible member has acted.
function completeTurn(room) {
  if (!room.turn) return;
  const members = participants(room).filter(player => player.teamId);
  const acted = new Set(room.roundActedIds || []);
  if (members.some(player => player.id === room.turn)) acted.add(room.turn);
  room.roundNumber ||= 1;
  if (members.length && members.every(player => acted.has(player.id))) {
    publishGoalProgress(room);
    room.lastRoundEnd = { id: randomUUID(), round: room.roundNumber, nextRound: room.roundNumber + 1 };
    room.roundNumber++; room.roundActedIds = [];
  } else room.roundActedIds = [...acted];
}

module.exports = { completeTurn };
