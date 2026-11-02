'use strict';

// Only common, non-secret room and player metadata is shared across game projections.
function publicRoom(room, presence) {
  return { code: room.code, gameType: room.gameType || 'bingo', phase: room.phase,
    host: room.host, revision: room.revision, onlineCount: room.players.filter(player => presence.isOnline(player.id)).length };
}

function publicIdentity(player, presence) {
  return { id: player.id, name: player.name, online: presence.isOnline(player.id) };
}

module.exports = { publicRoom, publicIdentity };
