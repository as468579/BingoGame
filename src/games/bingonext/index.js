'use strict';
const { createIdentity } = require('../../domain/identity');
const { createBoard, createSpecialCells } = require('./board');
const { createLinePrizes } = require('./prizes');
const { assignPlayer } = require('./teams');
const { applyGameAction } = require('./actions');
const { roomSnapshot } = require('./snapshot');
const { migrateTeamHands } = require('./team-hands');
module.exports = {
  id: 'bingo-next',
  initializeRoom() {
    const board = createBoard(8);
    return { size: 8, boardVersion: 0, board, cells: createSpecialCells(board), teamCount: 2, playersPerTeam: 2,
      called: [], turn: null, winners: [], pending: null, lastDecision: null, history: [], teamHands: {}, captains: {}, linePrizes: createLinePrizes(8) };
  },
  createPlayer: (room, name, token) => ({ ...createIdentity(name, token), teamId: null, hand: [], usedDemoCards: [], ready: false }),
  capacity: room => room.teamCount * room.playersPerTeam,
  joined: assignPlayer, restorePlayer: () => false,
  applyAction: applyGameAction, snapshot: roomSnapshot, migrate: migrateTeamHands
};
