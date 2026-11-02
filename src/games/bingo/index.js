'use strict';
const { createPlayer } = require('./player');
const { createLinePrizes } = require('./prizes');
const { restoreParticipant } = require('./participants');
const { applyGameAction } = require('./actions');
const { roomSnapshot } = require('./snapshot');
const { migrateRoom } = require('./migration');

module.exports = {
  id: 'bingo',
  initializeRoom: () => ({ called: [], turn: null, winners: [], pending: null, lastDecision: null,
    history: [], size: 5, boardVersion: 0, linePrizes: createLinePrizes(5) }),
  createPlayer: (room, name, token) => createPlayer(name, token, room.size || 5),
  capacity: () => 16,
  joined(room, player) { if (Array.isArray(room.participantIds)) room.participantIds.push(player.id); },
  restorePlayer: restoreParticipant,
  applyAction: applyGameAction,
  snapshot: roomSnapshot,
  migrate: migrateRoom
};
