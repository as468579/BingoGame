'use strict';
const { getGame } = require('../games');
function migrateRoom(room) {
  const game = getGame(room.gameType);
  room.gameType = game.id;
  return game.migrate(room);
}
module.exports = { migrateRoom };
