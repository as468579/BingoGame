'use strict';

// Room membership preserves player data. The round roster decides who must ready and take turns.
function participants(room) {
  return room.players.filter(player => !Array.isArray(room.participantIds) || room.participantIds.includes(player.id));
}

function isParticipant(room, playerId) {
  return !Array.isArray(room.participantIds) || room.participantIds.includes(playerId);
}

function restoreParticipant(room, player) {
  if (room.phase !== 'lobby' || isParticipant(room, player.id)) return false;
  room.participantIds.push(player.id);
  player.ready = false;
  room.revision++;
  return true;
}

module.exports = { participants, isParticipant, restoreParticipant };
