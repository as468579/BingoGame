const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createApplication } = require('../src/app');
const { addToHand } = require('../src/domain/hand');

function fixture(t) {
  const rooms = new Map();
  const repository = { get: code => rooms.get(code), all: () => [...rooms.values()], add: room => rooms.set(room.code, room), save() {} };
  const app = createApplication({ repository });
  const tokens = [randomUUID(), randomUUID(), randomUUID()];
  const host = app.service.execute({ kind: 'create', name: 'Host', token: tokens[0], requestId: randomUUID() });
  const code = host.room.code;
  const send = (kind, index = 0, data = {}) => app.service.execute({ kind, code, token: tokens[index], requestId: randomUUID(), ...data });
  send('join', 1, { name: 'Guest' }); send('join', 2, { name: 'Offline' });
  const room = repository.get(code);
  const players = [...room.players];
  const connect = index => {
    const { player } = app.service.authenticate(code, tokens[index]);
    const stop = app.connections.subscribe(player.id, { write() {} });
    app.service.connected(room, player);
    t.after(stop);
    return stop;
  };
  const ready = index => send('board', index, { board: players[index].board, ready: true, boardVersion: room.boardVersion });
  return { ...app, room, send, connect, ready, players, tokens, code };
}

test('scan deletes offline player data and clears every room-owned reference to that player', t => {
  const { room, send, connect, ready, players } = fixture(t);
  connect(0); connect(1); ready(0); ready(1);
  const card = addToHand(room.players[2], { name: 'Retained card' });
  const removedId = room.players[2].id;
  assert.throws(() => send('start'), /準備/);
  const requestId = randomUUID();
  let result = send('scan', 0, { requestId });
  assert.equal(result.room.onlineCount, 2); assert.equal(result.room.participantCount, 2);
  assert.equal(result.room.players.length, 2); assert.equal(result.room.lastScanRemovedCount, 1);
  assert.equal(room.archivedPlayers, undefined);
  assert.equal(JSON.stringify(room).includes(removedId), false);
  assert.equal(JSON.stringify(room).includes(card.id), false);
  assert.equal(result.room.archivedPlayers, undefined);
  const retry = send('scan', 0, { requestId }); assert.equal(retry.room.revision, result.room.revision);
  result = send('start');
  assert.equal(result.room.turn, room.players[0].id);
  result = send('call', 0, { number: 1 }); result = send('approve', 0, { pendingId: result.room.pending.id });
  assert.equal(result.room.turn, room.players[1].id);
  assert.ok(room.players[0].cells[0].isCovered); assert.equal(players[2].cells[0].isCovered, false);
  result = send('call', 1, { number: 2 }); result = send('approve', 0, { pendingId: result.room.pending.id });
  assert.equal(result.room.turn, room.players[0].id);
  assert.throws(() => send('scan'), /準備階段/);
  send('reset'); assert.equal(room.participantIds, null);
});

test('only the host can scan and fewer than two participants cannot start', t => {
  const { room, send, connect, ready } = fixture(t);
  connect(0); ready(0);
  assert.throws(() => send('scan', 1), error => error.status === 403);
  const state = send('scan');
  assert.equal(state.room.participantCount, 1); assert.equal(room.players.length, 1);
  assert.throws(() => send('start'), /至少需要 2/);
});

test('disconnect alone preserves identity, but scanning after the final tab closes permanently removes it', t => {
  const { room, send, connect, ready, players } = fixture(t);
  connect(0);
  const first = connect(1), second = connect(1);
  first();
  assert.equal(send('scan').room.participantCount, 2);
  second();
  assert.equal(room.players.length, 2);
  const reconnected = connect(1);
  assert.equal(room.players[1].id, players[1].id);
  reconnected();
  assert.equal(send('scan').room.participantCount, 1);
  assert.throws(() => connect(1), error => error.status === 401);
  const fresh = send('join', 1, { name: 'Guest' });
  assert.notEqual(fresh.playerId, players[1].id);
  connect(1);
  assert.equal(room.participantIds.length, 2); assert.equal(room.players[1].ready, false);
  ready(0); ready(1); send('start');
  assert.throws(() => send('join', 2, { name: 'Offline' }), /遊戲已開始/);
  assert.throws(() => connect(2), error => error.status === 401);
  assert.equal(room.participantIds.length, 2);
});

test('same ID restores data before a scan, but starts fresh after a scan', t => {
  const { room, send, connect, ready } = fixture(t);
  connect(0); ready(2);
  const playerId = room.players[2].id;
  const card = addToHand(room.players[2], { name: 'Before scan' });
  let result = send('join', 2, { name: 'Offline' });
  assert.equal(result.playerId, playerId);
  assert.equal(result.room.players[2].hand[0].id, card.id);
  assert.equal(result.room.players[2].ready, true);
  send('scan');
  result = send('join', 2, { name: 'Offline' });
  assert.notEqual(result.playerId, playerId);
  const restored = result.room.players.find(player => player.id === result.playerId);
  assert.equal(restored.participating, true);
  assert.equal(restored.ready, false);
  assert.deepEqual(restored.hand, []);
  assert.equal(result.room.players.length, 2);
});

test('scan releases room slots without retaining archived player data', t => {
  const { room, send, connect, service, code } = fixture(t);
  connect(0); send('scan');
  service.execute({ kind: 'join', code, name: 'Replacement', token: randomUUID(), requestId: randomUUID() });
  for (let index = 2; index < 16; index++) {
    service.execute({ kind: 'join', code, name: `New${index}`, token: randomUUID(), requestId: randomUUID() });
  }
  assert.equal(room.players.length, 16);
  assert.throws(() => send('join', 2, { name: 'Offline' }), /16/);
  assert.equal(room.archivedPlayers, undefined);
});

test('deleted cells and hands cannot reappear when the same ID rejoins after a size change', t => {
  const { room, send, connect, players } = fixture(t);
  connect(0); send('scan');
  addToHand(players[2], { name: 'Old round card' });
  send('settings', 0, { size: 3 });
  assert.equal(room.players[0].cells.length, 9);
  players[2].cells[0].isCovered = true;
  addToHand(players[2]);
  send('reset');
  const result = send('join', 2, { name: 'Offline' });
  const fresh = result.room.players.find(player => player.id === result.playerId);
  assert.notEqual(fresh.id, players[2].id);
  assert.equal(fresh.board.length, 9); assert.deepEqual(fresh.hand, []);
  assert.ok(fresh.cells.every(cell => !cell.isCovered));
});

test('an explicit scan also purges private archives left by older versions', t => {
  const { room, send, connect, players } = fixture(t);
  connect(0);
  const legacy = { ...players[2], id: randomUUID(), name: 'Legacy archive' };
  const card = addToHand(legacy, { name: 'Legacy card' });
  room.archivedPlayers = [legacy];
  assert.ok(JSON.stringify(room).includes(card.id));
  send('scan');
  assert.equal(room.archivedPlayers, undefined);
  assert.equal(JSON.stringify(room).includes(legacy.id), false);
  assert.equal(JSON.stringify(room).includes(card.id), false);
});
