const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createApplication } = require('../src/app');

function memoryRepository() {
  const rooms = new Map();
  return { get: code => rooms.get(code), all: () => [...rooms.values()], add: room => rooms.set(room.code, room), save() {} };
}

test('application instances own independent repositories and presence', () => {
  const first = createApplication({ repository: memoryRepository() });
  const second = createApplication({ repository: memoryRepository() });
  first.repository.add({ code: 'ONLY-FIRST' });
  assert.equal(second.repository.get('ONLY-FIRST'), undefined);
  const unsubscribe = first.connections.subscribe('player', { write() {} });
  try {
    assert.equal(first.connections.isOnline('player'), true);
    assert.equal(second.connections.isOnline('player'), false);
  } finally { unsubscribe(); }
  assert.equal(first.connections.isOnline('player'), false);
});

test('hosts select a game at room creation; joins and retries preserve the room game', () => {
  const app = createApplication({ repository: memoryRepository() });
  const send = extra => app.service.execute({ token: randomUUID(), requestId: randomUUID(), name: 'Host', ...extra });
  const bingo = send({ kind: 'create' });
  assert.equal(bingo.room.gameType, 'bingo');
  const token = randomUUID(), requestId = randomUUID();
  const bridge = send({ kind: 'create', token, requestId, gameType: 'bridge-bingo' });
  assert.equal(bridge.room.gameType, 'bridge-bingo');
  assert.equal(send({ kind: 'create', token, requestId, gameType: 'bingo' }).room.code, bridge.room.code);
  const joined = send({ kind: 'join', code: bridge.room.code, gameType: 'bingo', name: 'Guest' });
  assert.equal(joined.room.gameType, 'bridge-bingo');
  assert.equal(joined.room.players.length, 2);
  assert.throws(() => send({ kind: 'start', code: bridge.room.code, token }), /不支援的 Bridge Bingo 操作/);
  for (const gameType of ['unknown', '', null]) {
    assert.throws(() => send({ kind: 'create', gameType }), /有效的遊戲/);
  }
});

test('game selection survives serialization and older rooms default to Bingo', () => {
  const app = createApplication({ repository: memoryRepository() });
  const created = app.service.execute({ kind: 'create', name: 'Host', token: randomUUID(), requestId: randomUUID(), gameType: 'bridge-bingo' });
  const saved = JSON.parse(JSON.stringify(app.repository.get(created.room.code)));
  app.repository.add(saved);
  assert.equal(app.service.snapshot(saved, created.playerId).gameType, 'bridge-bingo');
  const bingo = app.service.execute({ kind: 'create', name: 'Legacy Host', token: randomUUID(), requestId: randomUUID() });
  const legacy = app.repository.get(bingo.room.code);
  delete legacy.gameType;
  assert.equal(app.service.snapshot(legacy, bingo.playerId).gameType, 'bingo');
});

test('creating again with the same player identity creates a fresh room without copying old progress', () => {
  const app = createApplication({ repository: memoryRepository() });
  const token = randomUUID();
  const create = gameType => app.service.execute({ kind: 'create', name: 'Same Host', token, requestId: randomUUID(), gameType });
  const first = create('bingo');
  const oldRoom = app.repository.get(first.room.code);
  oldRoom.called = [1, 2];
  oldRoom.players[0].ready = true;
  oldRoom.players[0].hand = [{ id: 'old-card', name: 'Old Card' }];
  const second = create('bingo');
  assert.notEqual(second.room.code, first.room.code);
  assert.deepEqual(second.room.called, []);
  assert.deepEqual(second.room.players[0].hand, []);
  assert.equal(second.room.players[0].ready, false);
  const bridge = create('bridge-bingo');
  assert.notEqual(bridge.room.code, second.room.code);
  assert.equal(bridge.room.gameType, 'bridge-bingo');
  assert.deepEqual(oldRoom.called, [1, 2]);
});

test('module assets are served and private files and invalid actions remain inaccessible', async () => {
  const { server } = createApplication({ repository: memoryRepository() });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const file of ['/', '/join', '/bingo-next', '/bingo-next/', '/games/bingonext/game.css', '/js/games/bingonext/game-view.js', '/bridge-bingo', '/bridge-bingo/', '/games/bridge/game.css', '/js/games/bridge/board-view.js', '/client.js', '/js/app.js', '/js/games/bingo/views/players-view.js', '/js/views/board-lines.js', '/js/games/bingo/views/line-prizes-view.js', '/styles/base.css', '/styles/chalkboard.css', '/games/bingo/game.css']) {
      const response = await fetch(base + file);
      assert.equal(response.status, 200, file);
      assert.ok(response.headers.get('content-security-policy'));
      const body = await response.text();
      assert.ok(body.length);
      if (file.endsWith('.js')) assert.match(response.headers.get('content-type'), /javascript/);
    }
    for (const item of ['突襲券', '紅色藥水', '活力藥水']) {
      const prize = await fetch(base + `/assets/items/${item}.png`);
      assert.equal(prize.status, 200);
      assert.equal(prize.headers.get('content-type'), 'image/png');
      assert.equal(prize.headers.get('x-content-type-options'), 'nosniff');
      const bytes = Buffer.from(await prize.arrayBuffer());
      assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    }
    assert.equal((await fetch(base + '/assets/items/missing.png')).status, 404);
    for (const file of ['/data/rooms.json', '/server.js', '/js/missing.js', '/src/app.js', '/.git/config',
      '/assets/items/%ZZ.png', '/assets/items/%2e%2e%2f%2e%2e%2f%2e%2e%2fserver.js']) {
      assert.equal((await fetch(base + file)).status, 404, file);
    }
    const response = await fetch(base + '/api/action', { method: 'POST', body: '{broken' });
    assert.equal(response.status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
