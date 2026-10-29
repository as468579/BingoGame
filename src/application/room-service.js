'use strict';

const { randomBytes } = require('node:crypto');
const { fail } = require('../domain/errors');
const { createRoom, joinRoom, authenticatePlayer } = require('../domain/room');
const { applyGameAction } = require('../domain/game-actions');
const { roomSnapshot } = require('./room-snapshot');

class RoomService {
  constructor(repository, connections) {
    this.repository = repository;
    this.connections = connections;
  }

  authenticate(code, token) {
    const room = this.repository.get(code);
    if (!room) fail('找不到房間，請確認房號。', 404);
    return { room, player: authenticatePlayer(room, token) };
  }

  snapshot(room) { return roomSnapshot(room, this.connections); }

  broadcast(room) {
    this.connections.broadcast(room.players.map(player => player.id), this.snapshot(room));
  }

  execute(data) {
    const { kind, token, requestId } = data;
    if (typeof token !== 'string' || !/^[a-f0-9-]{36}$/i.test(token)) fail('無效的玩家憑證。');
    if (typeof requestId !== 'string' || requestId.length > 80 || !requestId) fail('缺少操作識別碼。');
    if (kind === 'create' || kind === 'join') return this.enter(data);
    const { room, player } = this.authenticate(String(data.code).toUpperCase(), token);
    if (player.requests.includes(requestId)) return { room: this.snapshot(room), playerId: player.id };
    applyGameAction(room, player, data, this.connections);
    player.requests.push(requestId);
    room.revision++;
    this.repository.save();
    this.broadcast(room);
    return { room: this.snapshot(room), playerId: player.id };
  }

  enter(data) {
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name || name.length > 20) fail('請輸入 1～20 個字的玩家 ID。');
    let room;
    if (data.kind === 'create') {
      room = this.repository.all().find(candidate => candidate.createRequest === data.requestId &&
        candidate.players.some(player => player.token === data.token));
      if (!room) {
        if (this.repository.all().length >= 1000) fail('房間已達上限。', 503);
        let code;
        do { code = randomBytes(3).toString('hex').toUpperCase(); } while (this.repository.get(code));
        room = createRoom(code, data.requestId);
        this.repository.add(room);
      }
    } else room = this.repository.get(String(data.code).toUpperCase());
    if (!room) fail('找不到房間，請確認房號。', 404);
    const player = joinRoom(room, name, data.token);
    this.repository.save();
    this.broadcast(room);
    return { room: this.snapshot(room), playerId: player.id, token: player.token };
  }
}

module.exports = { RoomService };
