'use strict';

const http = require('node:http');
const path = require('node:path');
const { JsonRoomRepository } = require('./infrastructure/json-room-repository');
const { ConnectionHub } = require('./infrastructure/connection-hub');
const { RoomService } = require('./application/room-service');
const { createRequestHandler } = require('./http/request-handler');

// The composition root owns dependency wiring; every application has isolated state and connections.
function createApplication({ dataDirectory = process.env.DATA_DIR || path.join(__dirname, '../data'),
  publicDirectory = path.join(__dirname, '../public'), repository = new JsonRoomRepository(dataDirectory),
  connections = new ConnectionHub() } = {}) {
  const service = new RoomService(repository, connections);
  const server = http.createServer(createRequestHandler(service, connections, publicDirectory));
  return { server, service, repository, connections };
}

module.exports = { createApplication };
