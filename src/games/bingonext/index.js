'use strict';
const { createIdentity } = require('../../domain/identity');
const { createBoard, createCells } = require('./board');
const { createLinePrizes } = require('./prizes');
const { assignPlayer } = require('./teams');
const { applyGameAction } = require('./actions');
const { roomSnapshot } = require('./snapshot');
module.exports = {
  id: 'bingo-next',
  initializeRoom() {
    const board = createBoard(5);
    return { size: 5, boardVersion: 0, board, cells: createCells(board), teamCount: 2, playersPerTeam: 2,
      called: [], turn: null, winners: [], pending: null, lastDecision: null, history: [], linePrizes: createLinePrizes(5) };
  },
  createPlayer: (room, name, token) => ({ ...createIdentity(name, token), teamId: null, hand: [], usedDemoCards: [], ready: false }),
  capacity: room => room.teamCount * room.playersPerTeam,
  joined: assignPlayer, restorePlayer: () => false,
  applyAction: applyGameAction, snapshot: roomSnapshot, migrate: room => room
};
