const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApplication } = require('../src/app');
const { ITEMS, createLinePrizes, ensureLinePrizes, awardLinePrizes } = require('../src/games/bingo/prizes');
const { migrateRoom } = require('../src/domain/room-migration');

function fixture(options, size = 3) {
  const rooms = new Map();
  const repository = { get: code => rooms.get(code), all: () => [...rooms.values()], add: room => rooms.set(room.code, room), save() {} };
  const app = createApplication(options || { repository });
  const hostToken = randomUUID(), guestToken = randomUUID();
  const host = app.service.execute({ kind: 'create', name: 'Host', token: hostToken, requestId: randomUUID() });
  const code = host.room.code;
  const send = (kind, token = hostToken, extra = {}) => app.service.execute({ kind, code, token, requestId: randomUUID(), ...extra });
  const guest = send('join', guestToken, { name: 'Guest' });
  send('settings', hostToken, { size });
  const room = app.repository.get(code);
  const prepare = (different = false) => {
    // Host's first column and Guest's first row contain the same numbers.
    const board = Array.from({ length: size ** 2 }, (_, i) => i + 1);
    const transposed = board.map((_, i) => (i % size) * size + Math.floor(i / size) + 1);
    send('board', hostToken, { board: different ? transposed : board, ready: true, boardVersion: room.boardVersion });
    send('board', guestToken, { board, ready: true, boardVersion: room.boardVersion });
    send('start');
  };
  const call = number => {
    const token = room.players.find(player => player.id === room.turn).token;
    send('call', token, { number });
    return send('approve', hostToken, { pendingId: room.pending.id });
  };
  return { ...app, room, host, guest, hostToken, guestToken, code, send, prepare, call };
}

test('every line owns a distinct limited prize slot at all supported sizes', () => {
  for (let size = 3; size <= 9; size++) {
    const prizes = createLinePrizes(size);
    assert.equal(prizes.length, 2 * size + 2);
    assert.equal(new Set(prizes.map(prize => prize.id)).size, prizes.length);
    assert.ok(prizes.every(prize => prize.claimedBy === null));
    assert.equal(prizes.filter(prize => prize.kind === 'diagonal').length, 2);
  }
});

for (const [oldName, newName] of [['mp_potion', '活力藥水'], ['hp_potion', '紅色藥水']]) test(`renaming ${oldName} preserves existing rewards and undo snapshots`, () => {
  const f = fixture(); f.prepare(); f.call(1);
  f.room.linePrizes[0].item = oldName;
  f.room.linePrizes[0].claimedBy = f.host.playerId;
  f.room.history.forEach(state => { state.linePrizes[0].item = oldName; });
  const previous = structuredClone(f.room.linePrizes[0]);
  migrateRoom(f.room);
  assert.deepEqual(f.room.linePrizes[0], { ...previous, item: newName });
  f.send('undo', f.hostToken, { revision: f.room.revision });
  assert.equal(f.room.linePrizes[0].item, newName);
});

test('random prize selection includes both potions and uses a fresh draw for each slot', async () => {
  const { linePrizeItems } = await import('../public/js/games/bingo/views/line-prizes-view.js');
  assert.deepEqual(linePrizeItems, ITEMS);
  assert.ok(ITEMS.includes('紅色藥水') && ITEMS.includes('活力藥水'));
  let draws = 0;
  const first = createLinePrizes(3, max => { assert.equal(max, 6); return draws++ % max; });
  assert.equal(draws, 8);
  assert.deepEqual(first.slice(0, 6).map(p => p.item), ITEMS);
  const second = createLinePrizes(3, () => 5);
  assert.ok(second.every(p => p.item === '活力藥水' && p.claimedBy === null));
  assert.notDeepEqual(second.map(p => p.item), first.map(p => p.item));
  const room = { size: 3, linePrizes: first };
  assert.equal(ensureLinePrizes(room), false);
  assert.equal(room.linePrizes, first);
});

test('random configuration stays identical through snapshots, all undo steps and legacy opening restore', () => {
  const f = fixture(); f.prepare();
  const initial = structuredClone(f.room.linePrizes);
  f.call(1); f.call(2); f.call(3);
  while (f.service.snapshot(f.room).canUndo) f.send('undo', f.hostToken, { revision: f.room.revision });
  assert.deepEqual(f.room.linePrizes, initial);
  assert.deepEqual(f.service.snapshot(f.room, f.host.playerId).linePrizes, f.service.snapshot(f.room, f.guest.playerId).linePrizes);
  f.call(1);
  f.room.history = [];
  f.send('undo', f.hostToken, { revision: f.room.revision });
  assert.deepEqual(f.room.linePrizes, initial);
  f.call(1);
  delete f.room.history[0].linePrizes;
  f.send('undo', f.hostToken, { revision: f.room.revision });
  assert.deepEqual(f.room.linePrizes, initial);
});

test('another round replenishes prizes and starting preserves the displayed pool without accepting client assignments', () => {
  const f = fixture(); f.prepare(); f.call(1);
  f.send('reset');
  const waitingPool = f.room.linePrizes;
  f.prepare();
  assert.equal(f.room.linePrizes, waitingPool);
  assert.ok(f.room.linePrizes.every(p => ITEMS.includes(p.item) && !p.claimedBy));
  const pool = structuredClone(f.room.linePrizes);
  f.send('join', f.guestToken, { name: 'Guest', linePrizes: [] });
  assert.deepEqual(f.room.linePrizes, pool);
});

test('only the host can reroll before start; retries are idempotent and player preparation is preserved', () => {
  const f = fixture();
  f.send('board', f.hostToken, { board: [9, 8, 7, 6, 5, 4, 3, 2, 1], ready: true, boardVersion: f.room.boardVersion });
  const players = structuredClone(f.room.players);
  const original = f.room.linePrizes;
  assert.throws(() => f.send('rerollPrizes', f.guestToken), error => error.status === 403);
  assert.equal(f.room.linePrizes, original);
  const requestId = randomUUID();
  const result = f.send('rerollPrizes', f.hostToken, { requestId, linePrizes: [] });
  assert.notEqual(f.room.linePrizes, original);
  assert.equal(result.room.linePrizes.length, 8);
  assert.ok(result.room.linePrizes.every(p => ITEMS.includes(p.item) && !p.claimedBy));
  assert.deepEqual(f.room.players.map(({ requests, ...p }) => p), players.map(({ requests, ...p }) => p));
  const rerolled = structuredClone(f.room.linePrizes);
  const retry = f.send('rerollPrizes', f.hostToken, { requestId });
  assert.equal(retry.room.revision, result.room.revision);
  assert.deepEqual(f.room.linePrizes, rerolled);
  assert.deepEqual(f.service.snapshot(f.room, f.guest.playerId).linePrizes, rerolled);
  f.prepare();
  assert.deepEqual(f.room.linePrizes, rerolled);
  assert.throws(() => f.send('rerollPrizes'), /開始前/);
  [1, 2, 3].forEach(f.call);
  assert.equal(f.room.phase, 'finished');
  assert.throws(() => f.send('rerollPrizes'), /開始前/);
});

test('a slot is awarded once to its first completer, while other positions remain independently claimable', () => {
  const f = fixture(undefined, 4); f.prepare(true);
  [1, 2, 3, 4].forEach(f.call);
  assert.equal(f.room.linePrizes.find(prize => prize.id === 'row-0').claimedBy, f.guest.playerId);
  assert.equal(f.room.linePrizes.find(prize => prize.id === 'column-0').claimedBy, f.host.playerId);
  // Host completes row 0 later; it must remain Guest's reward.
  f.call(5); f.call(9); f.call(13);
  assert.equal(f.room.linePrizes.find(prize => prize.id === 'row-0').claimedBy, f.guest.playerId);
  const snapshot = f.service.snapshot(f.room, f.host.playerId);
  assert.ok(snapshot.players.find(player => player.id === f.guest.playerId).rewards.some(prize => prize.id === 'row-0'));
  assert.ok(!snapshot.players.find(player => player.id === f.host.playerId).rewards.some(prize => prize.id === 'row-0'));
});

test('simultaneous completions use join order; retries and repeated award passes cannot duplicate a prize', () => {
  const f = fixture(); f.prepare(); f.call(1); f.call(2);
  f.send('call', f.hostToken, { number: 3 });
  const pendingId = f.room.pending.id, requestId = randomUUID();
  f.send('approve', f.hostToken, { pendingId, requestId });
  const revision = f.room.revision;
  f.send('approve', f.hostToken, { pendingId, requestId });
  assert.equal(f.room.revision, revision);
  awardLinePrizes(f.room); awardLinePrizes(f.room);
  assert.equal(f.room.linePrizes.filter(prize => prize.claimedBy).length, 1);
  assert.equal(f.room.linePrizes[0].claimedBy, f.host.playerId);
  assert.equal(f.service.snapshot(f.room, f.guest.playerId).players.find(player => player.id === f.guest.playerId).rewards.length, 0);
  assert.throws(() => f.send('approve', f.hostToken, { pendingId }), /沒有待確認/);
});

test('pending and rejected numbers cannot award a prize, and clients cannot nominate an owner', () => {
  const f = fixture(); f.prepare(); f.call(1); f.call(2);
  f.send('call', f.hostToken, { number: 3 });
  assert.ok(f.room.linePrizes.every(prize => !prize.claimedBy));
  f.send('reject', f.hostToken, { pendingId: f.room.pending.id });
  assert.ok(f.room.linePrizes.every(prize => !prize.claimedBy));
  f.send('call', f.guestToken, { number: 3 });
  f.send('approve', f.hostToken, { pendingId: f.room.pending.id, claimedBy: f.guest.playerId, linePrizes: [] });
  assert.equal(f.room.linePrizes[0].claimedBy, f.host.playerId);
});

test('undo restores prize ownership and removes granted rewards together with the covered number', () => {
  const f = fixture(); f.prepare(); [1, 2, 3].forEach(f.call);
  assert.equal(f.room.linePrizes[0].claimedBy, f.host.playerId);
  f.send('undo', f.hostToken, { revision: f.room.revision });
  assert.equal(f.room.linePrizes[0].claimedBy, null);
  assert.ok(f.service.snapshot(f.room, f.host.playerId).players.every(player => player.rewards.length === 0));
  f.send('approve', f.hostToken, { pendingId: f.room.pending.id });
  assert.equal(f.room.linePrizes.filter(prize => prize.claimedBy).length, 1);
  assert.equal(f.room.linePrizes[0].claimedBy, f.host.playerId);
});

test('the final winning call awards its prizes before publishing every player final rewards', () => {
  const f = fixture(); f.prepare();
  let result;
  for (const number of [1, 2, 4, 6, 8, 9, 5]) result = f.call(number);
  assert.equal(result.room.phase, 'finished');
  assert.equal(result.room.winners.length, 2);
  const host = result.room.players.find(player => player.id === f.host.playerId);
  const guest = result.room.players.find(player => player.id === f.guest.playerId);
  // Number 5 completes row 1, column 1 and the main diagonal in the first winning call.
  assert.equal(host.rewards.length, 3); assert.equal(guest.rewards.length, 0);
  assert.ok(host.rewards.some(prize => prize.id === 'column-1'));
  assert.ok(host.rewards.some(prize => prize.id === 'diagonal-0'));
  assert.equal(result.room.linePrizes.filter(prize => prize.claimedBy).length, host.rewards.length + guest.rewards.length);
  f.send('undo', f.hostToken, { revision: f.room.revision });
  assert.equal(f.room.phase, 'playing');
  assert.equal(f.room.linePrizes.find(prize => prize.id === 'column-1').claimedBy, null);
  assert.equal(f.room.linePrizes.find(prize => prize.id === 'diagonal-0').claimedBy, null);
});

test('new rounds and size changes replenish the prize pool without carrying over owners', () => {
  const f = fixture(); f.prepare(); [1, 2, 3].forEach(f.call);
  f.send('reset');
  assert.ok(f.room.linePrizes.every(prize => !prize.claimedBy));
  assert.ok(f.service.snapshot(f.room, f.host.playerId).players.every(player => !player.rewards.length));
  f.send('settings', f.hostToken, { size: 4 });
  assert.equal(f.room.linePrizes.length, 10);
  assert.ok(f.room.linePrizes.every(prize => !prize.claimedBy));
});

test('legacy saves infer owners once, but existing ownership never changes during migration', () => {
  const f = fixture(); f.prepare(true); [1, 2, 3].forEach(f.call);
  const saved = JSON.parse(JSON.stringify(f.room));
  saved.players[0].cells.slice(0, 3).forEach(cell => { cell.isCovered = true; });
  migrateRoom(saved);
  assert.equal(saved.linePrizes[0].claimedBy, f.guest.playerId);
  delete saved.linePrizes;
  migrateRoom(saved);
  assert.equal(saved.linePrizes[0].claimedBy, f.host.playerId);
  saved.players[1].cells.forEach(cell => { cell.isCovered = true; });
  migrateRoom(saved);
  assert.equal(saved.linePrizes[0].claimedBy, f.host.playerId);
});

test('ownership and player rewards survive an actual repository restart and are not duplicated on reconnect', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-prizes-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const f = fixture({ dataDirectory: directory }); f.prepare(true); [1, 2, 3].forEach(f.call);
  const restarted = createApplication({ dataDirectory: directory });
  const restored = restarted.repository.get(f.code);
  assert.deepEqual(restored.linePrizes, f.room.linePrizes);
  const rejoin = restarted.service.execute({ kind: 'join', code: f.code, name: 'Guest', token: randomUUID(), requestId: randomUUID() });
  assert.equal(rejoin.playerId, f.guest.playerId);
  assert.equal(rejoin.room.players.find(player => player.id === f.guest.playerId).rewards.length, 1);
  assert.equal(rejoin.room.linePrizes.filter(prize => prize.claimedBy).length, 2);
});

test('legacy migration uses earlier snapshots to preserve the actual first completer over join order', () => {
  const f = fixture(undefined, 4); f.prepare(true); [1, 2, 3, 4, 5, 9, 13].forEach(f.call);
  const legacy = JSON.parse(JSON.stringify(f.room));
  delete legacy.linePrizes;
  for (const state of legacy.history) delete state.linePrizes;
  // Both have row 0 at this point, but Guest completed it first on number 4.
  assert.ok(legacy.players.every(player => player.cells.slice(0, 4).every(cell => cell.isCovered)));
  migrateRoom(legacy);
  assert.equal(legacy.linePrizes[0].claimedBy, f.guest.playerId);
  assert.equal(legacy.linePrizes.find(prize => prize.id === 'column-0').claimedBy, f.host.playerId);
});
