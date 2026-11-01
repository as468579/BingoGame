'use strict';

const { randomUUID } = require('node:crypto');
const { fail } = require('./errors');
const { createPlayer } = require('./player');
const { participants, restoreParticipant } = require('./participants');
const { createLinePrizes } = require('./line-prizes');

function createRoom(code, createRequest) {
  return {
    code, createRequest, phase: 'lobby', players: [], host: null, called: [], turn: null,
    winners: [], pending: null, lastDecision: null, history: [], size: 5, boardVersion: 0, revision: 0,
    linePrizes: createLinePrizes(5)
  };
}

function joinRoom(room, name, token) {
  // The entered ID is room-scoped. UUIDs remain the internal references used by turns and the host.
  let player = room.players.find(candidate => candidate.name === name);
  if (player) { restoreParticipant(room, player); return player; }
  if (room.phase !== 'lobby') fail('遊戲已開始，暫時無法加入新玩家。');
  if (room.players.length >= 16) fail('房間最多可容納 16 位玩家。');
  const playerToken = [...room.players, ...(room.archivedPlayers || [])].some(candidate => candidate.token === token) ? randomUUID() : token;
  player = createPlayer(name, playerToken, room.size || 5);
  room.players.push(player);
  if (Array.isArray(room.participantIds)) room.participantIds.push(player.id);
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
  const roster = participants(room);
  const index = roster.findIndex(player => player.id === room.turn);
  room.turn = roster[(index + 1) % roster.length].id;
}

module.exports = { createRoom, joinRoom, authenticatePlayer, requireHost, advanceTurn };
