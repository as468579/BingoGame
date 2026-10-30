'use strict';

const { coveredLines } = require('../domain/board');
const { canUndo } = require('../domain/game-history');
const { isParticipant, participants } = require('../domain/participants');

// Explicitly project public fields; credentials and retry/history records never leave the server.
function roomSnapshot(room, presence, viewerId) {
  return {
    code: room.code, phase: room.phase, host: room.host, turn: room.turn,
    size: room.size || 5, goal: room.size || 5, boardVersion: room.boardVersion || 0,
    called: room.called, winners: room.winners, revision: room.revision,
    pending: room.pending || null, lastDecision: room.lastDecision || null,
    canUndo: canUndo(room),
    lastScanAt: room.lastScanAt || null,
    lastScanRemovedCount: room.lastScanRemovedCount || 0,
    participantCount: participants(room).length,
    onlineCount: room.players.filter(player => presence.isOnline(player.id)).length,
    players: room.players.map(player => ({
      id: player.id, name: player.name, board: player.board, cells: player.cells, ready: player.ready,
      online: presence.isOnline(player.id), lines: coveredLines(player.cells),
      participating: isParticipant(room, player.id),
      handCount: player.hand.length,
      ...(player.id === viewerId ? { hand: player.hand } : {})
    }))
  };
}

module.exports = { roomSnapshot };
