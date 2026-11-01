const { test } = require('node:test');
const assert = require('node:assert/strict');
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

test('module assets are served and private files and invalid actions remain inaccessible', async () => {
  const { server } = createApplication({ repository: memoryRepository() });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const file of ['/', '/join', '/client.js', '/js/app.js', '/js/views/players-view.js', '/js/views/board-lines.js', '/js/views/line-prizes-view.js', '/style.css', '/chalkboard.css', '/prizes.css']) {
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
