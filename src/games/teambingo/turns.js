'use strict';
const { participants } = require('./participants');
const { teams } = require('./teams');

function teamMembers(room) {
  const members = participants(room);
  return teams(room).map(team => ({ ...team, members: members.filter(player => player.teamId === team.id) }));
}

function startTurn(room) {
  room.turnCursors = {};
  room.turn = null;
  advanceTurn(room);
}

function advanceTurn(room) {
  const groups = teamMembers(room);
  const currentTeamId = room.players.find(player => player.id === room.turn)?.teamId;
  const index = groups.findIndex(team => team.id === currentTeamId);
  room.turnCursors ||= {};
  if (index >= 0) {
    const current = groups[index];
    const seat = current.members.findIndex(player => player.id === room.turn);
    if (seat >= 0) room.turnCursors[current.id] = (seat + 1) % current.members.length;
  }
  for (let offset = 1; offset <= groups.length; offset++) {
    const team = groups[(index + offset) % groups.length];
    if (team.members.length && (room.teamClock?.remaining[team.id] ?? Infinity) > 0) {
      room.turn = team.members[(room.turnCursors[team.id] || 0) % team.members.length].id;
      return;
    }
  }
  room.phase = 'finished'; room.turn = null; room.winners = [];
  room.endReason = groups.some(team => team.members.length) ? 'time-exhausted' : 'no-active-players';
}

module.exports = { startTurn, advanceTurn };
