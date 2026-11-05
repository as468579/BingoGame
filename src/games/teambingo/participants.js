'use strict';

// Room membership preserves player data. The round roster decides who must ready and take turns.
function participants(room) {
  return room.players.filter(player => isParticipant(room, player.id));
}

function isCaptain(room, playerId) {
  if (playerId === room.host) return false;
  const player = room.players.find(member => member.id === playerId);
  return Boolean(player?.teamId && room.captains?.[player.teamId] === playerId);
}

function isParticipant(room, playerId) {
  return playerId !== room.host && !isCaptain(room, playerId) && (!Array.isArray(room.participantIds) || room.participantIds.includes(playerId));
}

function restoreParticipant(room, player) {
  if (room.phase !== 'lobby' || isParticipant(room, player.id)) return false;
  room.participantIds.push(player.id);
  player.ready = false;
  room.revision++;
  return true;
}

module.exports = { participants, isParticipant, isCaptain, restoreParticipant };
