'use strict';

const { randomUUID } = require('node:crypto');
const { createBoard, createCells } = require('./board');
const { createHand } = require('./hand');

function createPlayer(name, token, size) {
  const board = createBoard(size);
  return { id: randomUUID(), token, name, board, cells: createCells(board), hand: createHand(), ready: false, requests: [] };
}

module.exports = { createPlayer };
