'use strict';

const { createCells } = require('./board');
const { createHand } = require('./hand');

function migrateRoom(room) {
  for (const player of [...room.players, ...(room.archivedPlayers || [])]) {
    const compatible = Array.isArray(player.cells) && player.cells.length === player.board.length &&
      player.cells.every((cell, index) => cell.number === player.board[index] && typeof cell.isCovered === 'boolean');
    // Only infer covers for old data. Never re-derive valid cell flags from called numbers.
    if (!compatible) player.cells = createCells(player.board, room.called);
    if (!Array.isArray(player.hand)) player.hand = createHand();
  }
  return room;
}

module.exports = { migrateRoom };
