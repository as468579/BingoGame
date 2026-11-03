'use strict';
const { createBridgeState, assignBridgePlayer, ensureTeamBoards } = require('./game');

function migrateBridgeRoom(room) {
  if (!room.bridge) {
    room.bridge = createBridgeState({ teamCount: 2, playersPerTeam: Math.max(2, Math.ceil(room.players.length / 2)), size: room.size || 5 });
    room.phase = 'lobby';
    for (const player of room.players) { player.ready = false; assignBridgePlayer(room, player); }
  }
  ensureTeamBoards(room.bridge);
  return room;
}

module.exports = { migrateBridgeRoom };
