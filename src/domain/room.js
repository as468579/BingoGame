'use strict';
const { randomUUID } = require('node:crypto');
const { fail } = require('./errors');
const { getGame } = require('../games');

function createRoom(code, createRequest, gameType = 'bingo') {
  const game = getGame(gameType);
  return { code, createRequest, gameType: game.id, phase: 'lobby', players: [], host: null, revision: 0, ...game.initializeRoom() };
}

function joinRoom(room, name, token) {
  const game = getGame(room.gameType);
  let player = room.players.find(candidate => candidate.name === name);
  if (player) { game.restorePlayer(room, player); return player; }
  if (room.phase !== 'lobby') fail('遊戲已開始，暫時無法加入新玩家。');
  const capacity = game.capacity(room);
  if (room.players.length >= capacity) fail('房間最多可容納 ' + capacity + ' 位玩家。');
  const playerToken = [...room.players, ...(room.archivedPlayers || [])].some(candidate => candidate.token === token) ? randomUUID() : token;
  player = game.createPlayer(room, name, playerToken);
  room.players.push(player);
  game.joined(room, player);
  room.host ||= player.id;
  room.revision++;
  return player;
}

function authenticatePlayer(room, token) {
  const player = room.players.find(candidate => candidate.token === token);
  if (!player) fail('此瀏覽器尚未加入這個房間。', 401);
  return player;
}

module.exports = { createRoom, joinRoom, authenticatePlayer };
