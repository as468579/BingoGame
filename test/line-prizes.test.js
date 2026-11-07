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
  assert.ok(ITEMS.includes(f.room.linePrizes[0].item));
});

test('random prize selection reserves one rare slot and independently draws regular prizes elsewhere', async () => {
  const { linePrizeItems } = await import('../public/js/games/bingo/views/line-prizes-view.js');
  assert.deepEqual(linePrizeItems, ITEMS);
  assert.deepEqual(ITEMS, ['突襲券', '傳送石', '飄雪結晶', '護身符', '龍王項鍊', '楓葉祝福20', '超級藥水']);
  const bounds = [];
  const first = createLinePrizes(3, max => { bounds.push(max); return (bounds.length - 1) % max; });
  assert.deepEqual(bounds, [8, 2, 6, 6, 6, 6, 6, 6, 6]);
  assert.equal(first[0].item, '楓葉祝福20');
  assert.ok(first.slice(1).every(prize => !['龍王項鍊', '楓葉祝福20'].includes(prize.item)));
  const second = createLinePrizes(3, max => max - 1);
  assert.ok(second.slice(0, -1).every(p => p.item === '超級藥水' && p.claimedBy === null));
  assert.equal(second.at(-1).item, '楓葉祝福20');
  assert.notDeepEqual(second.map(p => p.item), first.map(p => p.item));
  const room = { size: 3, linePrizes: first };
  assert.equal(ensureLinePrizes(room), false);
  assert.equal(room.linePrizes, first);
});

test('retired unclaimed potions are replaced consistently without changing awarded items', () => {
  const { migrateRetiredPrizes } = require('../src/shared/prize-items');
  const prizes = [
    { id: 'row-0', item: '紅色藥水', claimedBy: null },
    { id: 'row-1', item: '活力藥水', claimedBy: null },
    { id: 'column-0', item: '紅色藥水', claimedBy: 'winner' },
    { id: 'column-1', item: '傳送石', claimedBy: null }
  ];
  const room = { linePrizes: structuredClone(prizes), history: [{ linePrizes: structuredClone(prizes) }] };
  let draws = 0;
  migrateRetiredPrizes(room, bound => { assert.equal(bound, 7); return draws++ % bound; });
  assert.equal(draws, 2);
  assert.deepEqual(room.linePrizes.map(prize => prize.item), ['突襲券', '傳送石', '紅色藥水', '傳送石']);
  assert.deepEqual(room.history[0].linePrizes, room.linePrizes);
  assert.equal(room.linePrizes[2].claimedBy, 'winner');
  const saved = structuredClone(room); migrateRetiredPrizes(room, () => { throw Error('must not reroll'); });
  assert.deepEqual(room, saved);
});

test('both Bingo games migrate unclaimed potions and share the six-item server and client pools', async () => {
  const { getGame } = require('../src/games');
  for (const gameType of ['bingo', 'teambingo']) {
    const prizes = require(`../src/games/${gameType}/prizes`);
    const client = await import(`../public/js/games/${gameType}/views/line-prizes-view.js`);
    assert.deepEqual(prizes.ITEMS, ITEMS); assert.deepEqual(client.linePrizeItems, ITEMS);
    const game = getGame(gameType), room = { ...game.initializeRoom(), players: [], phase: 'lobby', history: [] };
    room.linePrizes[0].item = '紅色藥水'; room.linePrizes[1].item = '活力藥水';
    room.history.push({ linePrizes: structuredClone(room.linePrizes) });
    game.migrate(room);
    assert.ok(room.linePrizes.every(prize => ITEMS.includes(prize.item)));
    assert.deepEqual(room.history[0].linePrizes, room.linePrizes);
  }
});

for (const expected of ['龍王項鍊', '楓葉祝福20']) test(`${expected} can occupy any single board prize slot in both Bingo games`, () => {
  assert.ok(fs.existsSync(path.join(__dirname, '../public/assets/items', `${expected}.png`)));
  for (const gameType of ['bingo', 'teambingo']) {
    const { createLinePrizes: create } = require(`../src/games/${gameType}/prizes`);
    for (let position = 0; position < 14; position++) {
      let draws = 0;
      const prizes = create(6, () => { draws++; return draws === 1 ? position : draws === 2 ? ['龍王項鍊', '楓葉祝福20'].indexOf(expected) : 0; });
      assert.equal(prizes.length, 14); assert.equal(prizes[position].item, expected);
      assert.equal(prizes.filter(prize => ['龍王項鍊', '楓葉祝福20'].includes(prize.item)).length, 1);
      assert.ok(prizes.every(prize => prize.claimedBy === null));
    }
  }
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

for (const gameType of ['bingo', 'teambingo']) test(`${gameType} shares one total rare-prize allowance across all line slots and refreshes it on each board`, () => {
  const { createLinePrizes: create } = require(`../src/games/${gameType}/prizes`);
  const rare = item => ['龍王項鍊', '楓葉祝福20'].includes(item);
  for (let size = 3; size <= 9; size++) {
    for (const firstRare of [0, 1]) {
      let draws = 0;
      const prizes = create(size, bound => { draws++; return draws === 1 ? 0 : draws === 2 ? firstRare : bound - 1; });
      assert.equal(prizes.length, 2 * size + 2);
      assert.equal(prizes.filter(prize => rare(prize.item)).length, 1);
      assert.equal(prizes[0].item, ['龍王項鍊', '楓葉祝福20'][firstRare]);
      assert.ok(prizes.every(prize => ITEMS.includes(prize.item)));
    }
    assert.equal(create(size, () => 0).filter(prize => rare(prize.item)).length, 1);
    assert.equal(create(size, bound => bound - 1).filter(prize => rare(prize.item)).length, 1);
  }
});

test('rare-prize migration keeps the awarded slot and makes unclaimed replacements consistent across undo history', () => {
  const { migrateLimitedPrizes } = require('../src/shared/prize-items');
  const prizes = [{ id: 'row-0', item: '龍王項鍊', claimedBy: null },
    { id: 'column-0', item: '楓葉祝福20', claimedBy: 'winner' },
    { id: 'diagonal-0', item: '楓葉祝福20', claimedBy: null }];
  const room = { phase: 'playing', linePrizes: structuredClone(prizes), history: [{ linePrizes: structuredClone(prizes) }] };
  let draws = 0; migrateLimitedPrizes(room, bound => { assert.equal(bound, 5); return draws++ % bound; });
  assert.equal(draws, 2); assert.deepEqual(room.linePrizes.map(prize => prize.item), ['突襲券', '楓葉祝福20', '傳送石']);
  assert.deepEqual(room.linePrizes[1], prizes[1]); assert.deepEqual(room.history[0].linePrizes, room.linePrizes);
  const before = structuredClone(room); migrateLimitedPrizes(room, () => { throw Error('must not reroll'); });
  assert.deepEqual(room, before);
  const finished = { phase: 'finished', linePrizes: structuredClone(prizes) };
  migrateLimitedPrizes(finished, () => { throw Error('completed games must remain intact'); });
  assert.deepEqual(finished.linePrizes, prizes);
});

test('both games normalize existing unclaimed rare duplicates on loading a room', () => {
  const { getGame } = require('../src/games');
  for (const type of ['bingo', 'teambingo']) {
    const game = getGame(type), room = { ...game.initializeRoom(), phase: 'lobby', players: [], history: [] };
    room.linePrizes.forEach((prize, index) => { prize.item = index % 2 ? '龍王項鍊' : '楓葉祝福20'; });
    room.history.push({ linePrizes: structuredClone(room.linePrizes) });
    game.migrate(room);
    assert.equal(room.linePrizes.filter(prize => ['龍王項鍊', '楓葉祝福20'].includes(prize.item)).length, 1);
    assert.deepEqual(room.history[0].linePrizes, room.linePrizes);
  }
});

test('Bingo creation, host rerolls, size changes and resets all enforce the shared rare-prize cap', () => {
  const f = fixture();
  const check = () => assert.equal(f.room.linePrizes.filter(prize => ['龍王項鍊', '楓葉祝福20'].includes(prize.item)).length, 1);
  check();
  for (let i = 0; i < 12; i++) { f.send('rerollPrizes'); check(); }
  f.send('settings', f.hostToken, { size: 6 }); check();
  f.send('reset'); check();
});

test('Team Bingo host rerolls, size changes and resets all enforce the shared rare-prize cap', () => {
  const game = require('../src/games/teambingo');
  const host = { id: 'host', hand: [], ready: false };
  const room = { ...game.initializeRoom(), phase: 'lobby', host: host.id, players: [host] };
  const check = () => assert.equal(room.linePrizes.filter(prize => ['龍王項鍊', '楓葉祝福20'].includes(prize.item)).length, 1);
  const act = data => game.applyAction(room, host, data, { isOnline: () => true }, 0);
  check();
  for (let i = 0; i < 12; i++) { act({ kind: 'rerollPrizes' }); check(); }
  act({ kind: 'settings', size: 4, teamCount: 2, playersPerTeam: 2 }); check();
  room.phase = 'playing'; act({ kind: 'reset' }); check();
});

test('an existing board without a rare prize receives exactly one and keeps the same slot through undo history', () => {
  const { migrateLimitedPrizes } = require('../src/shared/prize-items');
  const prizes = [{ id: 'row-0', item: '護身符', claimedBy: 'already-awarded' },
    { id: 'row-1', item: '傳送石', claimedBy: null }, { id: 'column-0', item: '飄雪結晶', claimedBy: null }];
  const room = { phase: 'playing', linePrizes: structuredClone(prizes), history: [{ linePrizes: structuredClone(prizes) }] };
  migrateLimitedPrizes(room, max => max - 1);
  assert.deepEqual(room.linePrizes[0], prizes[0]);
  assert.equal(room.linePrizes[2].item, '楓葉祝福20');
  assert.equal(room.linePrizes.filter(prize => ['龍王項鍊', '楓葉祝福20'].includes(prize.item)).length, 1);
  assert.deepEqual(room.history[0].linePrizes, room.linePrizes);
  const before = structuredClone(room); migrateLimitedPrizes(room, () => { throw Error('must not reroll'); });
  assert.deepEqual(room, before);
});

test('guaranteeing a rare prize never changes already granted rewards or completed game results', () => {
  const { migrateLimitedPrizes } = require('../src/shared/prize-items');
  const awarded = { phase: 'playing', linePrizes: [{ id: 'row-0', item: '傳送石', claimedBy: 'winner' }] };
  const finished = { phase: 'finished', linePrizes: [{ id: 'row-0', item: '護身符', claimedBy: null }] };
  for (const room of [awarded, finished]) {
    const before = structuredClone(room);
    migrateLimitedPrizes(room, () => { throw Error('must not replace historical prizes'); });
    assert.deepEqual(room, before);
  }
});

for (const type of ['bingo', 'teambingo']) test(`${type} draws the six exact item/quantity variants and keeps exactly one rare item with quantity one`, () => {
  const { REGULAR_PRIZES } = require('../src/shared/prize-items');
  const expected = [{ item: '飄雪結晶', quantity: 100 }, { item: '飄雪結晶', quantity: 50 },
    { item: '傳送石', quantity: 50 }, { item: '突襲券', quantity: 10 }, { item: '護身符', quantity: 40 }, { item: '超級藥水', quantity: 1000 }];
  assert.deepEqual(REGULAR_PRIZES, expected);
  const { createLinePrizes: create } = require(`../src/games/${type}/prizes`);
  for (const [index, variant] of expected.entries()) {
    let draws = 0;
    const prizes = create(3, bound => { draws++; return draws === 1 ? bound - 1 : draws === 2 ? 0 : index; });
    for (const prize of prizes.slice(0, -1)) assert.deepEqual({ item: prize.item, quantity: prize.quantity }, variant);
    assert.equal(prizes.at(-1).item, '龍王項鍊'); assert.equal(prizes.at(-1).quantity, 1);
    assert.equal(prizes.filter(prize => ['龍王項鍊', '楓葉祝福20'].includes(prize.item)).length, 1);
  }
});

test('reward projections preserve the quantity of each earned line and do not include another player or team', () => {
  const prizes = [{ id: 'row-0', item: '飄雪結晶', quantity: 100, claimedBy: 'owner' },
    { id: 'column-0', item: '飄雪結晶', quantity: 50, claimedBy: 'owner' },
    { id: 'diagonal-0', item: '傳送石', quantity: 50, claimedBy: 'other' },
    { id: 'row-1', item: '龍王項鍊', claimedBy: 'owner' }];
  for (const type of ['bingo', 'teambingo']) {
    const { playerRewards } = require(`../src/games/${type}/prizes`);
    assert.deepEqual(playerRewards(prizes, 'owner').map(prize => [prize.item, prize.quantity]), [['飄雪結晶', 100], ['飄雪結晶', 50], ['龍王項鍊', 1]]);
    assert.deepEqual(playerRewards(prizes, 'nobody'), []);
  }
});

test('quantity migration assigns legacy unclaimed rewards consistently while preserving awarded and completed quantities', () => {
  const { migratePrizeQuantities } = require('../src/shared/prize-items');
  const prizes = [{ id: 'row-0', item: '飄雪結晶', claimedBy: null }, { id: 'row-1', item: '傳送石', claimedBy: null },
    { id: 'row-2', item: '護身符', claimedBy: null }, { id: 'column-0', item: '突襲券', claimedBy: null },
    { id: 'column-1', item: '楓葉祝福20', quantity: 40, claimedBy: null },
    { id: 'diagonal-0', item: '飄雪結晶', claimedBy: 'old-winner' }];
  const room = { phase: 'playing', linePrizes: structuredClone(prizes), history: [{ linePrizes: structuredClone(prizes) }] };
  let draws = 0; migratePrizeQuantities(room, bound => { assert.equal(bound, 2); draws++; return 0; });
  assert.equal(draws, 1);
  assert.deepEqual(room.linePrizes.map(prize => prize.quantity), [100, 50, 40, 10, 1, 1]);
  assert.deepEqual(room.history[0].linePrizes, room.linePrizes);
  const saved = structuredClone(room); migratePrizeQuantities(room, () => { throw Error('must not reroll valid quantities'); });
  assert.deepEqual(room, saved);
  const finished = { phase: 'finished', linePrizes: [{ id: 'old', item: '飄雪結晶', claimedBy: null }] };
  migratePrizeQuantities(finished, () => { throw Error('must not reconfigure completed rewards'); });
  assert.equal(finished.linePrizes[0].quantity, 1);
});

test('quantity migration cannot inflate an already-earned legacy prize after undo and replay', () => {
  const { migratePrizeQuantities } = require('../src/shared/prize-items');
  for (const quantity of [undefined, 20, 50, 100]) {
    const current = { id: 'row-0', item: '飄雪結晶', claimedBy: 'winner', ...(quantity === undefined ? {} : { quantity }) };
    const room = { phase: 'playing', linePrizes: [current], history: [{ linePrizes: [{ id: 'row-0', item: '飄雪結晶', claimedBy: null }] }] };
    migratePrizeQuantities(room, () => 0);
    assert.equal(room.linePrizes[0].quantity, quantity ?? 1);
    assert.equal(room.history[0].linePrizes[0].quantity, quantity ?? 1, 'undo must preserve the amount originally earned');
  }
});

for (const type of ['bingo', 'teambingo']) test(`${type} randomized boards always contain valid quantities and exactly one rare prize across all sizes`, () => {
  const { createLinePrizes: create } = require(`../src/games/${type}/prizes`);
  const allowed = new Set(['飄雪結晶:100', '飄雪結晶:50', '傳送石:50', '突襲券:10', '護身符:40', '超級藥水:1000', '龍王項鍊:1', '楓葉祝福20:1']);
  for (let size = 3; size <= 9; size++) for (let seed = 1; seed <= 24; seed++) {
    let value = seed;
    const pick = max => { value = (value * 1664525 + 1013904223) >>> 0; return value % max; };
    const prizes = create(size, pick);
    assert.equal(prizes.length, 2 * size + 2);
    assert.equal(prizes.filter(prize => ['龍王項鍊', '楓葉祝福20'].includes(prize.item)).length, 1);
    assert.equal(new Set(prizes.map(prize => prize.id)).size, prizes.length);
    for (const prize of prizes) {
      assert.ok(Number.isSafeInteger(prize.quantity) && prize.quantity > 0);
      assert.ok(allowed.has(`${prize.item}:${prize.quantity}`));
    }
  }
});

test('forged prize fields and duplicate approvals cannot change Bingo rewards or inflate them after undo', () => {
  const f = fixture();
  const forged = [{ id: 'row-0', item: '龍王項鍊', quantity: Number.MAX_SAFE_INTEGER, claimedBy: f.host.playerId }];
  const metadata = () => f.room.linePrizes.map(({ id, item, quantity }) => ({ id, item, quantity }));
  const configured = metadata();
  f.send('board', f.hostToken, { board: [1, 2, 3, 4, 5, 6, 7, 8, 9], boardVersion: f.room.boardVersion, ready: true,
    linePrizes: forged, quantity: -100, rewards: forged });
  assert.deepEqual(metadata(), configured);
  assert.throws(() => f.send('rerollPrizes', f.guestToken, { linePrizes: forged }), error => error.status === 403);
  f.prepare(); f.call(1); f.call(2);
  f.send('call', f.hostToken, { number: 3, linePrizes: forged, item: '龍王項鍊', quantity: Number.MAX_SAFE_INTEGER });
  const pendingId = f.room.pending.id, requestId = randomUUID(), before = structuredClone(f.room);
  assert.throws(() => f.send('approve', f.guestToken, { pendingId, quantity: 999999 }), error => error.status === 403);
  assert.deepEqual(f.room, before);
  f.send('approve', f.hostToken, { pendingId, requestId, linePrizes: forged, quantity: 999999, claimedBy: f.guest.playerId });
  const expected = f.room.linePrizes.find(prize => prize.id === 'row-0');
  const earned = () => f.service.snapshot(f.room, f.host.playerId).players.find(player => player.id === f.host.playerId).rewards.filter(prize => prize.id === 'row-0');
  assert.deepEqual(metadata(), configured); assert.equal(earned().length, 1); assert.equal(earned()[0].quantity, expected.quantity);
  const revision = f.room.revision;
  f.send('approve', f.hostToken, { pendingId, requestId, quantity: -1 });
  assert.equal(f.room.revision, revision); assert.equal(earned().length, 1);
  assert.throws(() => f.send('approve', f.hostToken, { pendingId }), /待確認/);
  f.send('undo', f.hostToken, { revision: f.room.revision });
  assert.equal(earned().length, 0); assert.deepEqual(metadata(), configured);
  f.send('approve', f.hostToken, { pendingId, requestId }); assert.equal(earned().length, 0);
  assert.throws(() => f.send('approve', f.hostToken, { pendingId }), /處理|最新/);
  f.send('approve', f.hostToken, { pendingId: f.room.pending.id });
  assert.equal(earned().length, 1); assert.equal(earned()[0].quantity, expected.quantity);
});

test('invalid unclaimed quantities in legacy saves are repaired to the configured amounts', () => {
  const { migratePrizeQuantities } = require('../src/shared/prize-items');
  for (const invalid of [undefined, null, -100, 0, 0.5, NaN, Infinity, '50', true, {}, [], Number.MAX_SAFE_INTEGER]) {
    const room = { phase: 'lobby', linePrizes: [
      { id: 'row-0', item: '飄雪結晶', quantity: invalid, claimedBy: null },
      { id: 'row-1', item: '傳送石', quantity: invalid, claimedBy: null },
      { id: 'row-2', item: '突襲券', quantity: invalid, claimedBy: null },
      { id: 'column-0', item: '護身符', quantity: invalid, claimedBy: null },
      { id: 'column-1', item: '龍王項鍊', quantity: invalid, claimedBy: null }
    ] };
    room.history = [{ linePrizes: structuredClone(room.linePrizes) }];
    migratePrizeQuantities(room, () => 0);
    assert.deepEqual(room.linePrizes.map(prize => prize.quantity), [100, 50, 10, 40, 1]);
    assert.deepEqual(room.history[0].linePrizes, room.linePrizes);
  }
});
