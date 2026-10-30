const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createApplication } = require('../src/app');
const { createPlayer } = require('../src/domain/player');
const { createBoard, createCells, coverNumber, coveredLines } = require('../src/domain/board');
const { addToHand, removeFromHand } = require('../src/domain/hand');
const { migrateRoom } = require('../src/domain/room-migration');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-player-state-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const app = createApplication({ dataDirectory: directory });
  const hostToken = randomUUID(), guestToken = randomUUID();
  const host = app.service.execute({ kind: 'create', name: 'Host', token: hostToken, requestId: randomUUID() });
  const code = host.room.code;
  const send = (kind, token = hostToken, extra = {}) => app.service.execute({ kind, code, token, requestId: randomUUID(), ...extra });
  const guest = send('join', guestToken, { name: 'Guest' });
  const room = app.repository.get(code);
  const prepare = () => {
    send('board', hostToken, { board: room.players[0].board, ready: true });
    send('board', guestToken, { board: room.players[1].board, ready: true });
    send('start');
  };
  return { ...app, directory, code, host, guest, hostToken, guestToken, room, send, prepare };
}

test('every cell has its own boolean, and lines depend on those flags rather than called-number history', () => {
  const first = createPlayer('First', randomUUID(), 3), second = createPlayer('Second', randomUUID(), 3);
  assert.ok(first.cells.every(cell => typeof cell.isCovered === 'boolean' && !cell.isCovered));
  for (const number of [1, 2, 3]) coverNumber(first.cells, number, true);
  assert.equal(coveredLines(first.cells), 1);
  assert.equal(coveredLines(second.cells), 0);
  coverNumber(first.cells, 2, false);
  assert.equal(coveredLines(first.cells), 0);
  assert.throws(() => coverNumber(first.cells, 2, 'true'), TypeError);
  assert.notEqual(first.hand, second.hand);
});

test('old saves infer flags once while existing independent covers and hand data survive migration', () => {
  const board = createBoard(3);
  const old = { called: [1, 2], players: [{ board }] };
  migrateRoom(old);
  assert.deepEqual(old.players[0].cells.slice(0, 3).map(cell => cell.isCovered), [true, true, false]);
  assert.deepEqual(old.players[0].hand, []);
  coverNumber(old.players[0].cells, 1, false);
  coverNumber(old.players[0].cells, 9, true);
  const card = addToHand(old.players[0], { name: 'Test card' });
  migrateRoom(old);
  assert.equal(old.players[0].cells[0].isCovered, false);
  assert.equal(old.players[0].cells[8].isCovered, true);
  assert.equal(old.players[0].hand[0].id, card.id);
});

test('pending selections do not cover cells; approval, rejection and undo restore exact per-player state', t => {
  const { send, prepare, room, guestToken } = fixture(t);
  const card = addToHand(room.players[0], { name: 'Test card' });
  prepare();
  let result = send('call', undefined, { number: 1 });
  assert.ok(room.players.every(player => !player.cells[0].isCovered));
  result = send('approve', undefined, { pendingId: result.room.pending.id });
  assert.ok(room.players.every(player => player.cells[0].isCovered));
  result = send('call', guestToken, { number: 2 });
  result = send('reject', undefined, { pendingId: result.room.pending.id });
  assert.ok(room.players.every(player => !player.cells[1].isCovered));
  result = send('undo', undefined, { revision: result.room.revision });
  assert.equal(result.room.pending.number, 2);
  result = send('undo', undefined, { revision: result.room.revision });
  result = send('undo', undefined, { revision: result.room.revision });
  assert.equal(result.room.pending.number, 1);
  assert.ok(room.players.every(player => !player.cells[0].isCovered));
  result = send('undo', undefined, { revision: result.room.revision });
  assert.equal(result.room.canUndo, false);
  assert.equal(room.players[0].hand[0].id, card.id);
});

test('history copies hands and cells independently; reset and resizing clear player state', t => {
  const { send, prepare, room } = fixture(t);
  prepare();
  coverNumber(room.players[0].cells, 9, true);
  const card = addToHand(room.players[0], { name: 'Test card' });
  let result = send('call', undefined, { number: 1 });
  removeFromHand(room.players[0], card.id);
  coverNumber(room.players[0].cells, 9, false);
  result = send('undo', undefined, { revision: result.room.revision });
  assert.equal(room.players[0].hand[0].id, card.id);
  assert.equal(room.players[0].cells[8].isCovered, true);
  assert.equal(room.players[1].cells[8].isCovered, false);
  send('reset');
  assert.ok(room.players.every(player => !player.cells.some(cell => cell.isCovered) && player.hand.length === 0));
  addToHand(room.players[0]);
  send('settings', undefined, { size: 3 });
  assert.ok(room.players.every(player => player.cells.length === 9 && player.hand.length === 0 && !player.cells.some(cell => cell.isCovered)));
});

test('REST and SSE expose only the viewer hand, including when the viewer is the host', t => {
  const { service, connections, room, hostToken, guestToken, send } = fixture(t);
  const hostCard = addToHand(room.players[0], { name: 'Host secret' });
  const guestCard = addToHand(room.players[1], { name: 'Guest secret' });
  const hostView = send('join', hostToken, { name: 'Host' }).room;
  const guestView = send('join', guestToken, { name: 'Guest' }).room;
  assert.equal(hostView.players[0].hand[0].id, hostCard.id);
  assert.equal(hostView.players[1].hand, undefined);
  assert.equal(hostView.players[1].handCount, 1);
  assert.equal(guestView.players[1].hand[0].id, guestCard.id);
  assert.equal(guestView.players[0].hand, undefined);
  const writes = [[], []];
  const unsubscribe = room.players.map((player, index) => connections.subscribe(player.id, { write: value => writes[index].push(value) }));
  try {
    service.broadcast(room);
    const hostEvent = JSON.parse(writes[0].at(-1).slice(6));
    const guestEvent = JSON.parse(writes[1].at(-1).slice(6));
    assert.equal(hostEvent.players[1].hand, undefined);
    assert.equal(guestEvent.players[0].hand, undefined);
    assert.equal(hostEvent.players[0].hand[0].id, hostCard.id);
    assert.equal(guestEvent.players[1].hand[0].id, guestCard.id);
  } finally { unsubscribe.forEach(close => close()); }
});

test('persisted independent covers and hands are recovered by the same player ID after restart', t => {
  const { repository, room, directory, code } = fixture(t);
  room.called = [1];
  room.players[0].cells = createCells(room.players[0].board);
  coverNumber(room.players[0].cells, 9, true);
  const card = addToHand(room.players[0], { name: 'Persistent test card' });
  repository.save();
  const restored = createApplication({ dataDirectory: directory });
  const result = restored.service.execute({ kind: 'join', code, name: 'Host', token: randomUUID(), requestId: randomUUID() });
  const player = result.room.players.find(candidate => candidate.id === result.playerId);
  assert.equal(player.cells[0].isCovered, false);
  assert.equal(player.cells[8].isCovered, true);
  assert.equal(player.hand[0].id, card.id);
});

test('submitting a board cannot inject cover flags or cards through the public API', t => {
  const { send, room } = fixture(t);
  send('board', undefined, { board: room.players[0].board, cells: [{ number: 1, isCovered: true }], hand: [{ id: 'fake' }], ready: true });
  assert.ok(room.players[0].cells.every(cell => cell.isCovered === false));
  assert.deepEqual(room.players[0].hand, []);
});

test('scanned-out player data is deleted from saves and cannot return after restart', t => {
  const { repository, room, directory, code, send, guest } = fixture(t);
  const card = addToHand(room.players[1], { name: 'Archived hand' });
  room.players[1].cells[8].isCovered = true;
  send('scan');
  assert.equal(room.players.length, 1);
  repository.save();
  const restored = createApplication({ dataDirectory: directory });
  assert.equal(restored.repository.get(code).players.length, 1);
  const result = restored.service.execute({ kind: 'join', code, name: 'Guest', token: randomUUID(), requestId: randomUUID() });
  const player = result.room.players.find(candidate => candidate.id === result.playerId);
  assert.notEqual(player.id, guest.playerId);
  assert.equal(player.cells[8].isCovered, false);
  assert.deepEqual(player.hand, []);
  assert.equal(player.ready, false);
  assert.equal(result.room.archivedPlayers, undefined);
  const saved = fs.readFileSync(path.join(directory, 'rooms.json'), 'utf8');
  assert.equal(saved.includes(guest.playerId), false);
  assert.equal(saved.includes(card.id), false);
});
