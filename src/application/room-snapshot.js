'use strict';
const { getGame } = require('../games');
function roomSnapshot(room, presence, viewerId) { return getGame(room.gameType).snapshot(room, presence, viewerId); }
module.exports = { roomSnapshot };
