'use strict';
const { getGame } = require('../games');
function migrateRoom(room) { return getGame(room.gameType).migrate(room); }
module.exports = { migrateRoom };
