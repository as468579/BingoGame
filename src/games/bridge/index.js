'use strict';
const { createIdentity } = require('../../domain/identity');
const { createBridgeState, assignBridgePlayer } = require('./game');
const { applyBridgeAction } = require('./actions');
const { bridgeSnapshot } = require('./snapshot');
const { migrateBridgeRoom } = require('./migration');

module.exports = {
  id: 'bridge-bingo',
  initializeRoom: () => ({ bridge: createBridgeState(), size: 5, boardVersion: 0 }),
  createPlayer: (room, name, token) => ({ ...createIdentity(name, token), teamId: null, ready: false }),
  capacity: room => room.bridge.teamCount * room.bridge.playersPerTeam,
  joined: assignBridgePlayer,
  restorePlayer: () => false,
  applyAction: applyBridgeAction,
  snapshot: bridgeSnapshot,
  migrate: migrateBridgeRoom
};
