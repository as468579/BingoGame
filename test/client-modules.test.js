const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

function storage(values = {}) {
  const data = new Map(Object.entries(values));
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
}

function snapshot(overrides = {}) {
  return {
    code: 'ABC123', revision: 1, boardVersion: 0, size: 3,
    players: [{ id: 'me', board: [1, 2, 3, 4, 5, 6, 7, 8, 9] }], ...overrides
  };
}

test('chalk lines follow horizontal, vertical and diagonal cell centers for every supported size', async () => {
  const { completedBoardLines } = await import('../public/js/views/board-lines.js');
  const { coveredLines } = require('../src/games/bingo/board');
  for (let size = 3; size <= 9; size++) {
    const cells = Array.from({ length: size * size }, (_, index) => ({ number: index + 1, isCovered: false }));
    const groups = [
      { indices: Array.from({ length: size }, (_, i) => i), axis: 'row' },
      { indices: Array.from({ length: size }, (_, i) => i * size), axis: 'column' },
      { indices: Array.from({ length: size }, (_, i) => i * (size + 1)), axis: 'diagonal' },
      { indices: Array.from({ length: size }, (_, i) => (i + 1) * (size - 1)), axis: 'reverse' }
    ];
    for (const { indices, axis } of groups) {
      cells.forEach((cell, index) => { cell.isCovered = indices.includes(index); });
      const lines = completedBoardLines(cells, size);
      assert.equal(lines.length, 1, `${size}: ${axis}`);
      assert.equal(lines.length, coveredLines(cells));
      const first = 50 / size, last = 100 - first;
      const line = lines[0];
      if (axis === 'row') { assert.equal(line.y1, first); assert.equal(line.y2, first); }
      if (axis === 'column') { assert.equal(line.x1, first); assert.equal(line.x2, first); }
      if (axis === 'diagonal') { assert.equal(line.x1, line.y1); assert.equal(line.x2, line.y2); }
      if (axis === 'reverse') { assert.ok(Math.abs(line.x1 - last) < 1e-10); assert.equal(line.y1, first); }
    }
    cells.forEach(cell => { cell.isCovered = true; });
    assert.equal(completedBoardLines(cells, size).length, 2 * size + 2);
  }
});

test('chalk lines disappear after undoing a cover and never infer marks from number values', async () => {
  const { completedBoardLines } = await import('../public/js/views/board-lines.js');
  const cells = Array.from({ length: 9 }, (_, i) => ({ number: 9 - i, isCovered: i < 3 }));
  const original = structuredClone(cells);
  assert.equal(completedBoardLines(cells, 3).length, 1);
  assert.deepEqual(cells, original);
  cells[1].isCovered = false;
  assert.deepEqual(completedBoardLines(cells, 3), []);
  cells[1].isCovered = 'true';
  assert.deepEqual(completedBoardLines(cells, 3), []);
  assert.deepEqual(completedBoardLines(cells, 4), []);
});

test('each row, column and diagonal has a stable prize that follows independent cover flags', async () => {
  const { linePrizes, linePrizeItems } = await import('../public/js/games/bingo/views/line-prizes-view.js');
  const { coveredLines } = require('../src/games/bingo/board');
  for (let size = 3; size <= 9; size++) {
    const cells = Array.from({ length: size * size }, (_, index) => ({ number: index + 1, isCovered: false }));
    const initial = linePrizes(cells, size);
    assert.equal(initial.filter(slot => slot.kind === 'row').length, size);
    assert.equal(initial.filter(slot => slot.kind === 'column').length, size);
    assert.equal(initial.filter(slot => slot.kind === 'diagonal').length, 2);
    assert.ok(initial.every(slot => !slot.completed && !slot.earned && linePrizeItems.includes(slot.item)));
    for (let index = 0; index < size; index++) cells[index].isCovered = true;
    const earned = linePrizes(cells, size);
    assert.deepEqual(earned.filter(slot => slot.completed).map(slot => [slot.kind, slot.index]), [['row', 0]]);
    assert.deepEqual(earned.map(slot => slot.item), initial.map(slot => slot.item));
    cells.forEach(cell => { cell.isCovered = true; });
    assert.equal(linePrizes(cells, size).filter(slot => slot.completed).length, coveredLines(cells));
  }
});

test('prize availability follows the viewed board and undo, with no shared earned state', async () => {
  const { linePrizes } = await import('../public/js/games/bingo/views/line-prizes-view.js');
  const first = Array.from({ length: 9 }, (_, index) => ({ number: index + 1, isCovered: index % 4 === 0 }));
  const second = first.map(cell => ({ ...cell, isCovered: false }));
  const original = structuredClone(first);
  assert.deepEqual(linePrizes(first, 3).filter(slot => slot.completed).map(slot => [slot.kind, slot.index]), [['diagonal', 0]]);
  assert.ok(linePrizes(second, 3).every(slot => !slot.completed));
  assert.deepEqual(first, original);
  first[4].isCovered = false;
  assert.ok(linePrizes(first, 3).every(slot => !slot.completed));
  assert.deepEqual(linePrizes(first, 4), []);
});

test('a completed line does not imply a reward when another player already owns that slot', async () => {
  const { linePrizes } = await import('../public/js/games/bingo/views/line-prizes-view.js');
  const cells = Array.from({ length: 9 }, (_, index) => ({ isCovered: index < 3 }));
  const pool = [{ id: 'row-0', item: '突襲券', claimedBy: 'first' }];
  const late = linePrizes(cells, 3, pool, 'second')[0];
  assert.equal(late.completed, true); assert.equal(late.earned, false); assert.equal(late.taken, true);
  const owner = linePrizes(cells, 3, pool, 'first')[0];
  assert.equal(owner.earned, true); assert.equal(owner.taken, false);
});

test('reward gains announce actual newly awarded prizes regardless of line ranking', async () => {
  const { rewardGains } = await import('../public/js/games/bingo/state/reward-progress.js');
  const players = [{ id: 'a', name: 'A', lines: 3 }, { id: 'b', name: 'B', lines: 0 }];
  const prizes = [{ id: 'row-0', item: '突襲券', claimedBy: 'a' },
    { id: 'row-1', item: '傳送石', claimedBy: null }, { id: 'column-0', item: '傳送石', claimedBy: null }];
  const before = snapshot({ phase: 'playing', players, linePrizes: prizes });
  const after = snapshot({ revision: 2, phase: 'playing', players: [{ ...players[0], lines: 3 }, { ...players[1], lines: 1 }],
    linePrizes: prizes.map((prize, i) => i ? { ...prize, claimedBy: 'b' } : prize) });
  assert.deepEqual(rewardGains(before, after).map(p => [p.id, p.rewards.map(r => r.id)]), [['b', ['row-1', 'column-0']]]);
  assert.deepEqual(rewardGains(after, after), []);
  assert.deepEqual(rewardGains(after, before), []);
  assert.deepEqual(rewardGains(null, after), []);
  assert.deepEqual(rewardGains(before, { ...after, code: 'OTHER' }), []);
  assert.deepEqual(rewardGains(before, { ...after, boardVersion: 1 }), []);
  assert.deepEqual(rewardGains(before, { ...after, phase: 'lobby' }), []);
  assert.deepEqual(rewardGains({ ...before, phase: 'lobby' }, after), []);
  assert.equal(rewardGains(before, { ...after, phase: 'finished' })[0].rewards.length, 2);
  // A completed line with no new prize ownership must stay silent.
  assert.deepEqual(rewardGains(before, { ...after, linePrizes: prizes }), []);
  assert.deepEqual(rewardGains({ ...before, linePrizes: [] }, after), []);
  const simultaneous = { ...after, linePrizes: after.linePrizes.map((p, i) => i === 2 ? { ...p, claimedBy: 'a' } : p) };
  assert.deepEqual(rewardGains(before, simultaneous).map(p => p.id), ['a', 'b']);
  // Undo removes ownership; confirming the same prize again announces it again.
  assert.deepEqual(rewardGains({ ...before, revision: 3 }, { ...after, revision: 4 }).map(p => p.id), ['b']);
});

test('card preview requires an answer, consumes only local demo cards, and can restart', async () => {
  const { CardPreview, demoCards } = await import('../public/js/games/bingo/state/card-preview.js');
  const preview = new CardPreview();
  preview.open('star');
  assert.equal(preview.submit(), false);
  preview.flip();
  assert.equal(preview.submit(), false);
  preview.choose(-1);
  assert.equal(preview.choice, null);
  preview.choose(1);
  assert.equal(preview.submit(), true);
  assert.equal(preview.correct, true);
  assert.equal(preview.remaining.length, 2);
  assert.equal(preview.submit(), false);
  preview.open('shield'); preview.flip(); preview.choose(0); preview.submit();
  assert.equal(preview.correct, false);
  assert.equal(preview.remaining.length, 1);
  assert.equal(demoCards.length, 3);
  preview.reset();
  assert.equal(preview.remaining.length, 3);
  assert.equal(preview.selected, null);
});

test('client state ignores old snapshots, preserves drafts, and resets drafts on size changes', async () => {
  const { BingoState } = await import('../public/js/games/bingo/state.js');
  const state = new BingoState();
  state.playerId = 'me';
  state.accept(snapshot());
  state.editCell(0, 9);
  assert.equal(state.accept(snapshot({ revision: 0 })), false);
  state.accept(snapshot({ revision: 2 }));
  assert.equal(state.draft[0], 9);
  state.settingsDirty = true;
  const board = Array.from({ length: 16 }, (_, index) => index + 1);
  state.accept(snapshot({ revision: 3, boardVersion: 1, size: 4, players: [{ id: 'me', board }] }));
  assert.deepEqual(state.draft, board);
  assert.equal(state.draftDirty, false);
  assert.equal(state.settingsDirty, false);
  assert.equal(state.target.id, 'me');
});

test('viewing another board never switches the current player hand', async () => {
  const { GameState } = await import('../public/js/state/game-state.js');
  const state = new GameState(); state.playerId = 'me';
  state.accept(snapshot({ players: [{ id: 'me', board: [1], hand: [{ id: 'own-card' }] }, { id: 'other', board: [1], handCount: 2 }] }));
  state.selected = 'other';
  assert.equal(state.target.id, 'other');
  assert.deepEqual(state.hand, [{ id: 'own-card' }]);
});

test('sessions migrate the old shared host once, keep separate tab identities and restore selected IDs', async () => {
  const { PlayerSession } = await import('../public/js/storage/player-session.js');
  const token = randomUUID();
  const shared = storage({ 'bingo-token': token, 'bingo-name': 'Host', 'bingo-room': 'ABC123' });
  const firstTab = storage(), secondTab = storage();
  const host = new PlayerSession(firstTab, shared), guest = new PlayerSession(secondTab, shared);
  assert.equal(host.token, token);
  assert.equal(host.name, 'Host');
  assert.equal(host.roomCode, 'ABC123');
  assert.notEqual(guest.token, token);
  guest.remember('restored-guest-token', 'Guest', 'ABC123');
  const refreshed = new PlayerSession(secondTab, shared);
  assert.equal(refreshed.name, 'Guest');
  assert.equal(refreshed.token, 'restored-guest-token');
  assert.equal(host.name, 'Host');
  assert.equal(shared.getItem('bingo-token'), null);
});

test('HTTP retries reuse the exact operation and token; business errors are not retried', async () => {
  const { ApiClient } = await import('../public/js/network/api-client.js');
  const requests = [];
  const client = new ApiClient({
    session: { token: 'player-token' }, getRoomCode: () => 'ABC123', notify() {}, delay: async () => {},
    fetchRequest: async (url, options) => {
      requests.push(options.body);
      if (requests.length < 3) throw new Error('Offline');
      return { ok: true, json: async () => ({ accepted: true }) };
    }
  });
  assert.deepEqual(await client.send('call', { number: 7 }), { accepted: true });
  assert.equal(new Set(requests).size, 1);
  let attempts = 0;
  client.fetchRequest = async () => { attempts++; return { ok: false, json: async () => ({ error: '不是你的回合' }) }; };
  await assert.rejects(client.send('call', { number: 8 }), /不是你的回合/);
  assert.equal(attempts, 1);
});

test('the default fetch adapter does not bind the browser API to the ApiClient instance', async () => {
  const { ApiClient } = await import('../public/js/network/api-client.js');
  const original = globalThis.fetch;
  let client, calls = 0;
  globalThis.fetch = async function () {
    calls++;
    assert.notEqual(this, client);
    return { ok: true, json: async () => ({ accepted: true }) };
  };
  try {
    client = new ApiClient({ session: { token: 'token' }, getRoomCode: () => 'ABC123', notify() {}, delay: async () => {} });
    assert.deepEqual(await client.send('start'), { accepted: true });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('a replaced or closed event stream cannot update the new room', async () => {
  const { RoomConnection } = await import('../public/js/network/room-connection.js');
  const sources = [], snapshots = [], statuses = [];
  class FakeEventSource {
    constructor(url) { this.url = url; sources.push(this); }
    close() { this.closed = true; }
  }
  const connection = new RoomConnection({
    EventSourceType: FakeEventSource, onSnapshot: data => snapshots.push(data), onConnection: status => statuses.push(status)
  });
  connection.open('OLD', 'token');
  connection.open('NEW', 'token');
  assert.equal(sources[0].closed, true);
  sources[0].onmessage({ data: '{"code":"OLD"}' });
  sources[1].onmessage({ data: '{"code":"NEW"}' });
  connection.close();
  sources[1].onerror();
  assert.deepEqual(snapshots, [{ code: 'NEW' }]);
  assert.deepEqual(statuses, [true]);
});

test('public-address storage validates invitation origins without mixing player sessions', async () => {
  const { PublicAddress } = await import('../public/js/storage/public-address.js');
  const address = new PublicAddress(storage());
  assert.equal(address.save('https://bingo.example.com/'), true);
  assert.equal(address.invitation('ABC123', 'http://localhost:3000'), 'https://bingo.example.com/join?room=ABC123');
  assert.throws(() => address.save('javascript:alert(1)'));
  assert.throws(() => address.save('https://user:password@example.com'));
  assert.equal(address.save(''), false);
  assert.equal(address.invitation('ABC123', 'http://localhost:3000'), 'http://localhost:3000/join?room=ABC123');
});
