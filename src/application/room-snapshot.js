'use strict';

const { lines } = require('../domain/board');
const { canUndo } = require('../domain/game-history');

// Explicitly project public fields; credentials and retry/history records never leave the server.
function roomSnapshot(room, presence) {
  return {
    code: room.code, phase: room.phase, host: room.host, turn: room.turn,
    size: room.size || 5, goal: room.size || 5, boardVersion: room.boardVersion || 0,
    called: room.called, winners: room.winners, revision: room.revision,
    pending: room.pending || null, lastDecision: room.lastDecision || null,
    canUndo: canUndo(room),
    players: room.players.map(player => ({
      id: player.id, name: player.name, board: player.board, ready: player.ready,
      online: presence.isOnline(player.id), lines: lines(player.board, room.called)
    }))
  };
}

module.exports = { roomSnapshot };
