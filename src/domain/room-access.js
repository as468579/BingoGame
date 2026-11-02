'use strict';
const { fail } = require('./errors');

function requireHost(room, player, message) {
  if (room.host !== player.id) fail(message, 403);
}

module.exports = { requireHost };
