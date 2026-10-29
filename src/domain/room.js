'use strict';

const { randomUUID } = require('node:crypto');
const { fail } = require('./errors');
const { createPlayer } = require('./player');

function createRoom(code, createRequest) {
  return {
    code, createRequest, phase: 'lobby', players: [], host: null, called: [], turn: null,
    winners: [], pending: null, lastDecision: null, history: [], size: 5, boardVersion: 0, revision: 0
  };
}

function joinRoom(room, name, token) {
  // The entered ID is room-scoped. UUIDs remain the internal references used by turns and the host.
  let player = room.players.find(candidate => candidate.name === name);
  if (player) return player;
  if (room.phase !== 'lobby') fail('遊戲已開始，暫時無法加入新玩家。');
  if (room.players.length >= 16) fail('房間最多可容納 16 位玩家。');
  const playerToken = room.players.some(candidate => candidate.token === token) ? randomUUID() : token;
  player = createPlayer(name, playerToken, room.size || 5);
  room.players.push(player);
  room.host ||= player.id;
  room.revision++;
  return player;
}

function authenticatePlayer(room, token) {
  const player = room.players.find(candidate => candidate.token === token);
  if (!player) fail('此瀏覽器尚未加入這個房間。', 401);
  return player;
}

function requireHost(room, player, message) {
  if (room.host !== player.id) fail(message, 403);
}

function advanceTurn(room) {
  const index = room.players.findIndex(player => player.id === room.turn);
  room.turn = room.players[(index + 1) % room.players.length].id;
}

module.exports = { createRoom, joinRoom, authenticatePlayer, requireHost, advanceTurn };
