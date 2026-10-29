'use strict';

const { randomUUID } = require('node:crypto');
const { createBoard } = require('./board');

function createPlayer(name, token, size) {
  return { id: randomUUID(), token, name, board: createBoard(size), ready: false, requests: [] };
}

module.exports = { createPlayer };
