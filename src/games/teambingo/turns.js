'use strict';
const { participants } = require('./participants');
const { teams } = require('./teams');
const { completeTurn } = require('./rounds');

function teamMembers(room) {
  const members = participants(room);
  return teams(room).map(team => ({ ...team, members: members.filter(player => player.teamId === team.id) }));
}

function startTurn(room) {
  room.turnCursors = {};
  room.turn = null;
  room.roundNumber = 1; room.roundActedIds = []; room.roundActionCounts = {};
  advanceTurn(room);
}

function advanceTurn(room) {
  completeTurn(room);
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
    if (team.members.length) {
      room.turn = team.members[(room.turnCursors[team.id] || 0) % team.members.length].id;
      return;
    }
  }
  room.phase = 'finished'; room.turn = null; room.winners = [];
  room.endReason = 'no-active-players';
}

module.exports = { startTurn, advanceTurn };
