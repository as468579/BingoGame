'use strict';
const { randomUUID } = require('node:crypto');

function createIdentity(name, token) {
  return { id: randomUUID(), token, name, requests: [] };
}

module.exports = { createIdentity };
