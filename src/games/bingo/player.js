'use strict';

const { createIdentity } = require('../../domain/identity');
const { createBoard, createCells } = require('./board');
const { createHand } = require('./hand');

function createPlayer(name, token, size) {
  const board = createBoard(size);
  return { ...createIdentity(name, token), board, cells: createCells(board), hand: createHand(), ready: false };
}

module.exports = { createPlayer };
