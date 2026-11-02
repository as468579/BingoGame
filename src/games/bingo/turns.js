'use strict';
const { participants } = require('./participants');

function advanceTurn(room) {
  const roster = participants(room);
  const index = roster.findIndex(player => player.id === room.turn);
  room.turn = roster[(index + 1) % roster.length].id;
}

module.exports = { advanceTurn };
