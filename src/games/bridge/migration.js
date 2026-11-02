'use strict';
const { createBridgeState, assignBridgePlayer } = require('./game');

function migrateBridgeRoom(room) {
  if (!room.bridge) {
    room.bridge = createBridgeState({ playersPerTeam: Math.max(2, Math.ceil(room.players.length / 2)) });
    room.phase = 'lobby';
    for (const player of room.players) { player.ready = false; assignBridgePlayer(room, player); }
  }
  return room;
}

module.exports = { migrateBridgeRoom };
