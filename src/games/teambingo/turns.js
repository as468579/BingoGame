'use strict';
const { participants } = require('./participants');

function advanceTurn(room) {
  const roster = participants(room);
  const index = roster.findIndex(player => player.id === room.turn);
  for (let offset = 1; offset <= roster.length; offset++) {
    const member = roster[(index + offset) % roster.length];
    if ((room.teamClock?.remaining[member.teamId] ?? Infinity) > 0) { room.turn = member.id; return; }
  }
  room.phase = 'finished'; room.turn = null; room.winners = []; room.endReason = 'time-exhausted';
}

module.exports = { advanceTurn };
