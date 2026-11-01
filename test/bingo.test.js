const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-test-'));
process.env.DATA_DIR = directory;
const legacyToken = randomUUID(), legacyHost = randomUUID(), legacyGuest = randomUUID();
const legacyBoard = Array.from({ length: 25 }, (_, i) => i + 1);
const legacyRoom = {
  code: 'LEGACY', phase: 'playing', host: legacyHost, turn: legacyHost, called: [1, 2], winners: [], revision: 10,
  players: [{ id: legacyHost, token: legacyToken, name: '舊房主', board: legacyBoard, ready: true, requests: [] },
    { id: legacyGuest, token: randomUUID(), name: '舊玩家', board: legacyBoard, ready: true, requests: [] }],
  history: [{ phase: 'playing', turn: legacyGuest, called: [1], winners: [], pending: null, lastDecision: null }]
};
fs.writeFileSync(path.join(directory, 'rooms.json'), JSON.stringify({ LEGACY: legacyRoom,
  OLDSAVE: { ...legacyRoom, code: 'OLDSAVE', history: undefined, phase: 'finished', winners: [legacyHost], turn: null } }));
const { server, lines } = require('../server');
let base;
before(async () => { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); });
async function send(token, kind, data = {}, expected = 200) {
  const response = await fetch(`${base}/api/action`, { method: 'POST', body: JSON.stringify({ token, kind, requestId: randomUUID(), ...data }) });
  const body = await response.json(); assert.equal(response.status, expected, JSON.stringify(body)); return body;
}
test('counts horizontal, vertical and diagonal lines', () => {
  const board = Array.from({ length: 25 }, (_, i) => i + 1);
  assert.equal(lines(board, [1, 2, 3, 4, 5]), 1);
  assert.equal(lines(board, [1, 6, 11, 16, 21]), 1);
  assert.equal(lines(board, [1, 7, 13, 19, 25]), 1);
  assert.equal(lines(board, [5, 9, 13, 17, 21]), 1);
  assert.equal(lines(board, board), 12);
});
test('room plus player ID restores across browsers, while different IDs remain independent', async () => {
  const sharedBrowserToken = randomUUID();
  const host = await send(sharedBrowserToken, 'create', { name: 'HostID' }); const code = host.room.code;
  const guest = await send(sharedBrowserToken, 'join', { code, name: 'GuestID' });
  assert.notEqual(guest.playerId, host.playerId); assert.notEqual(guest.token, host.token);
  const board = Array.from({ length: 25 }, (_, i) => 25 - i);
  await send(host.token, 'board', { code, board, ready: true });
  await send(guest.token, 'board', { code, board: [...board].reverse(), ready: true });
  await send(host.token, 'start', { code });
  let state = await send(host.token, 'call', { code, number: 25 });
  await send(host.token, 'approve', { code, pendingId: state.room.pending.id });
  const restored = await send(randomUUID(), 'join', { code, name: 'HostID' });
  assert.equal(restored.playerId, host.playerId); assert.equal(restored.token, host.token);
  assert.equal(restored.room.host, restored.playerId); assert.deepEqual(restored.room.players[0].board, board);
  assert.deepEqual(restored.room.called, [25]); assert.equal(restored.room.turn, guest.playerId);
  assert.equal(restored.room.players.length, 2);
  assert.ok(restored.room.players.every(p => !('token' in p)));
  const guestRestored = await send(randomUUID(), 'join', { code, name: 'GuestID' });
  assert.equal(guestRestored.playerId, guest.playerId);
  state = await send(guestRestored.token, 'call', { code, number: 1 });
  assert.equal(state.room.pending.playerId, guest.playerId);
  await send(randomUUID(), 'join', { code, name: 'NewID' }, 400);
});
for (let size = 3; size <= 9; size++) test(`${size}x${size} validates boards, counts lines, synchronizes players and uses ${size - 2} lines to win`, async () => {
  const a = randomUUID(), b = randomUUID();
  const first = await send(a, 'create', { name: '尺寸測試' }); const code = first.room.code;
  await send(b, 'join', { code, name: '第二位' });
  await send(b, 'settings', { code, size }, 403);
  let state = await send(a, 'settings', { code, size });
  const boardVersion = state.room.boardVersion;
  const board = Array.from({ length: size ** 2 }, (_, i) => i + 1);
  assert.equal(state.room.size, size); assert.equal(state.room.goal, size - 2);
  assert.ok(state.room.players.every(p => p.board.length === size ** 2 && !p.ready));
  assert.equal(lines(board, board), 2 * size + 2);
  assert.equal(lines(board, board.slice(0, size)), 1);
  assert.equal(lines(board, Array.from({ length: size }, (_, i) => i * (size + 1) + 1)), 1);
  await send(a, 'settings', { code, size: 2 }, 400);
  await send(a, 'settings', { code, size: 10 }, 400);
  await send(a, 'settings', { code, size: 4.5 }, 400);
  await send(a, 'board', { code, board: Array(size ** 2).fill(1), boardVersion, ready: true }, 400);
  if (size !== 5) await send(a, 'board', { code, board, boardVersion: 0, ready: true }, 409);
  for (const token of [a, b]) await send(token, 'board', { code, board, boardVersion, ready: true });
  state = await send(a, 'start', { code });
  await send(a, 'settings', { code, size: size === 3 ? 4 : 3 }, 400);
  await send(a, 'call', { code, number: size ** 2 + 1 }, 400);
  let number = 1;
  while (state.room.phase === 'playing') {
    state = await send(state.room.turn === first.playerId ? a : b, 'call', { code, number });
    state = await send(a, 'approve', { code, pendingId: state.room.pending.id });
    if (state.room.phase === 'playing') assert.ok(state.room.players.every(p => p.lines < size - 2));
    assert.ok(number++ <= size ** 2);
  }
  assert.equal(state.room.winners.length, 2); assert.ok(state.room.players.every(p => p.lines >= size - 2));
  assert.equal(number - 1, size * (size - 2), 'row-by-row calls finish exactly at the new goal');
  const saved = JSON.parse(fs.readFileSync(path.join(directory, 'rooms.json')))[code];
  assert.equal(saved.size, size);
  state = await send(a, 'undo', { code, revision: state.room.revision });
  assert.equal(state.room.size, size); assert.equal(state.room.phase, 'playing');
  await send(a, 'reset', { code });
  state = await send(a, 'settings', { code, size: size === 3 ? 4 : 3 });
  assert.equal(state.room.boardVersion, boardVersion + 1);
  assert.ok(state.room.players.every(p => !p.ready)); assert.equal(state.room.canUndo, false);
});
test('legacy rooms with partial or missing history can undo all the way to the opening state', async () => {
  let state = await send(legacyToken, 'join', { code: 'LEGACY', name: '舊房主' });
  state = await send(legacyToken, 'undo', { code: 'LEGACY', revision: state.room.revision });
  assert.deepEqual(state.room.called, [1]); assert.equal(state.room.turn, legacyGuest); assert.equal(state.room.canUndo, true);
  state = await send(legacyToken, 'undo', { code: 'LEGACY', revision: state.room.revision });
  assert.deepEqual(state.room.called, []); assert.equal(state.room.turn, legacyHost); assert.equal(state.room.phase, 'playing');
  assert.equal(state.room.pending, null); assert.deepEqual(state.room.winners, []); assert.equal(state.room.canUndo, false);
  assert.ok(state.room.players.every(p => p.ready)); assert.deepEqual(state.room.players[0].board, legacyBoard);
  await send(legacyToken, 'undo', { code: 'LEGACY', revision: state.room.revision }, 400);
  state = await send(legacyToken, 'join', { code: 'OLDSAVE', name: '舊房主' });
  assert.equal(state.room.canUndo, true);
  state = await send(legacyToken, 'undo', { code: 'OLDSAVE', revision: state.room.revision });
  assert.equal(state.room.phase, 'playing'); assert.deepEqual(state.room.called, []);
  assert.equal(state.room.turn, legacyHost); assert.equal(state.room.canUndo, false);
});
test('multiplayer validation, turns, retries, shared wins and saved identity', async () => {
  const a = randomUUID(), b = randomUUID();
  const createId = randomUUID();
  const first = await send(a, 'create', { name: '玩家甲', requestId: createId });
  const code = first.room.code;
  assert.equal((await send(a, 'create', { name: '玩家甲', requestId: createId })).room.code, code);
  const second = await send(b, 'join', { name: '玩家乙', code });
  assert.equal(second.room.players.length, 2);
  await send(a, 'start', { code }, 400);
  await send(a, 'board', { code, board: Array(25).fill(1), ready: true }, 400);
  const board = Array.from({ length: 25 }, (_, i) => i + 1);
  await send(a, 'board', { code, board, ready: true });
  await send(b, 'board', { code, board, ready: true });
  await send(b, 'start', { code }, 403);
  await send(a, 'start', { code });
  await send(randomUUID(), 'join', { code, name: '遲到' }, 400);
  await send(b, 'call', { code, number: 1 }, 400);
  await send(a, 'board', { code, board, ready: false }, 400);
  const requestId = randomUUID();
  const called = await send(a, 'call', { code, number: 1, requestId });
  const retry = await send(a, 'call', { code, number: 1, requestId });
  assert.deepEqual(retry.room.called, []); assert.equal(retry.room.pending.number, 1);
  assert.equal(retry.room.revision, called.room.revision);
  await send(b, 'approve', { code, pendingId: retry.room.pending.id }, 403);
  await send(a, 'call', { code, number: 2 }, 400);
  const approveId = randomUUID();
  const approved = await send(a, 'approve', { code, pendingId: retry.room.pending.id, requestId: approveId });
  const approveRetry = await send(a, 'approve', { code, pendingId: retry.room.pending.id, requestId: approveId });
  assert.deepEqual(approveRetry.room.called, [1]); assert.equal(approveRetry.room.revision, approved.room.revision);
  await send(b, 'call', { code, number: 1 }, 400);
  let current = approved;
  for (let number = 2; current.room.phase === 'playing'; number++) {
    current = await send(current.room.turn === first.playerId ? a : b, 'call', { code, number });
    current = await send(a, 'approve', { code, pendingId: current.room.pending.id });
  }
  assert.equal(current.room.winners.length, 2);
  const undoWin = await send(a, 'undo', { code, revision: current.room.revision });
  assert.equal(undoWin.room.phase, 'playing'); assert.deepEqual(undoWin.room.winners, []);
  assert.ok(undoWin.room.pending); assert.equal(undoWin.room.called.length, current.room.called.length - 1);
  current = await send(a, 'approve', { code, pendingId: undoWin.room.pending.id });
  assert.equal(current.room.winners.length, 2);
  const restored = await send(a, 'join', { code, name: '玩家甲' });
  assert.equal(restored.playerId, first.playerId);
  assert.deepEqual(restored.room.called, current.room.called);
  await send(randomUUID(), 'reset', { code }, 401);
  await send(b, 'reset', { code }, 403);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'rooms.json')))[code].phase, 'finished');
  const reset = await send(a, 'reset', { code });
  assert.equal(reset.room.phase, 'lobby'); assert.equal(reset.room.called.length, 0);
  assert.ok(reset.room.players.every(p => !p.ready));
});
test('SSE reconnect sends a fresh snapshot and multiple tabs keep presence', async () => {
  const token = randomUUID(); const created = await send(token, 'create', { name: '重連測試' });
  const code = created.room.code;
  async function stream() {
    const controller = new AbortController();
    const response = await fetch(`${base}/events?code=${code}&token=${token}`, { signal: controller.signal });
    const reader = response.body.getReader();
    const chunk = new TextDecoder().decode((await reader.read()).value);
    const snapshot = JSON.parse(chunk.split('data: ')[1].split('\n')[0]);
    return { controller, reader, snapshot };
  }
  const one = await stream(); const two = await stream();
  assert.equal(one.snapshot.players[0].online, true);
  one.controller.abort();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal((await send(token, 'join', { code, name: '重連測試' })).room.players[0].online, true);
  two.controller.abort(); await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal((await send(token, 'join', { code, name: '重連測試' })).room.players[0].online, false);
  const three = await stream(); assert.equal(three.snapshot.code, code); three.controller.abort();
});
test('a fresh server process restores the saved board and player identity', async () => {
  const token = randomUUID();
  const created = await send(token, 'create', { name: '持久化測試' });
  const board = Array.from({ length: 25 }, (_, i) => 25 - i);
  await send(token, 'board', { code: created.room.code, board, ready: true });
  const other = randomUUID();
  await send(other, 'join', { code: created.room.code, name: '另一位' });
  await send(other, 'board', { code: created.room.code, board, ready: true });
  await send(token, 'start', { code: created.room.code });
  const pending = await send(token, 'call', { code: created.room.code, number: 25 });
  const child = spawn(process.execPath, ['-e', "const {server}=require('./server');server.listen(0,'127.0.0.1',()=>console.log(server.address().port));"], {
    cwd: path.join(__dirname, '..'), env: { ...process.env, DATA_DIR: directory }, stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Child server did not start')), 5000);
      child.stdout.once('data', chunk => { clearTimeout(timeout); resolve(Number(chunk.toString().trim())); });
      child.once('error', reject);
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Child exited ${code}`)); });
    });
    const response = await fetch(`http://127.0.0.1:${port}/api/action`, { method: 'POST', body: JSON.stringify({ kind: 'join', code: created.room.code, token, name: '持久化測試', requestId: randomUUID() }) });
    assert.equal(response.status, 200);
    const restored = await response.json();
    assert.equal(restored.playerId, created.playerId);
    assert.deepEqual(restored.room.players[0].board, board);
    assert.equal(restored.room.players[0].ready, true);
    assert.deepEqual(restored.room.pending, pending.room.pending);
    assert.deepEqual(restored.room.called, []);
    assert.equal(restored.room.canUndo, true);
    const undoResponse = await fetch(`http://127.0.0.1:${port}/api/action`, { method: 'POST', body: JSON.stringify({ kind: 'undo', code: created.room.code, token, revision: restored.room.revision, requestId: randomUUID() }) });
    assert.equal(undoResponse.status, 200);
    const undone = await undoResponse.json(); assert.equal(undone.room.pending, null); assert.equal(undone.room.canUndo, false);
  } finally {
    const stopped = new Promise(resolve => child.once('exit', resolve));
    child.kill(); await stopped;
  }
});
test('only host can undo steps, and undo restores calls, rejected turns and skipped turns exactly once', async () => {
  const a = randomUUID(), b = randomUUID();
  const created = await send(a, 'create', { name: '房主' });
  const code = created.room.code;
  const joined = await send(b, 'join', { code, name: '玩家' });
  const board = Array.from({ length: 25 }, (_, i) => i + 1);
  for (const token of [a, b]) await send(token, 'board', { code, board, ready: true });
  let state = await send(a, 'start', { code });
  await send(a, 'undo', { code, revision: state.room.revision }, 400);
  state = await send(a, 'call', { code, number: 5 });
  const firstPendingId = state.room.pending.id;
  await send(b, 'undo', { code, revision: state.room.revision }, 403);
  state = await send(a, 'approve', { code, pendingId: firstPendingId });
  const revision = state.room.revision;
  await send(a, 'undo', { code, revision: revision - 1 }, 409);
  const requestId = randomUUID();
  state = await send(a, 'undo', { code, revision, requestId });
  assert.deepEqual(state.room.called, []); assert.equal(state.room.turn, created.playerId);
  assert.equal(state.room.pending.number, 5); assert.notEqual(state.room.pending.id, firstPendingId);
  const repeated = await send(a, 'undo', { code, revision, requestId });
  assert.equal(repeated.room.revision, state.room.revision);
  await send(a, 'reject', { code, pendingId: firstPendingId }, 409);
  state = await send(a, 'reject', { code, pendingId: state.room.pending.id });
  assert.equal(state.room.turn, joined.playerId);
  state = await send(a, 'undo', { code, revision: state.room.revision });
  assert.equal(state.room.turn, created.playerId); assert.equal(state.room.pending.number, 5);
  state = await send(a, 'undo', { code, revision: state.room.revision });
  assert.equal(state.room.pending, null); assert.equal(state.room.canUndo, false);
  state = await send(a, 'skip', { code }); assert.equal(state.room.turn, joined.playerId);
  state = await send(a, 'undo', { code, revision: state.room.revision });
  assert.equal(state.room.turn, created.playerId);
  await send(a, 'call', { code, number: 8 });
  state = await send(a, 'reset', { code });
  assert.equal(state.room.canUndo, false);
  await send(a, 'undo', { code, revision: state.room.revision }, 400);
});
test('host rejection advances the proposer turn without marking, and stale decisions cannot affect a later selection', async () => {
  const a = randomUUID(), b = randomUUID(), c = randomUUID();
  const first = await send(a, 'create', { name: '房主' });
  const code = first.room.code;
  const second = await send(b, 'join', { code, name: '乙' });
  const third = await send(c, 'join', { code, name: '丙' });
  const board = Array.from({ length: 25 }, (_, i) => i + 1);
  for (const token of [a, b, c]) await send(token, 'board', { code, board, ready: true });
  await send(a, 'start', { code });
  let result = await send(a, 'call', { code, number: 7 });
  const oldPending = result.room.pending.id;
  const rejectionId = randomUUID();
  result = await send(a, 'reject', { code, pendingId: oldPending, requestId: rejectionId });
  assert.equal(result.room.turn, second.playerId); assert.deepEqual(result.room.called, []);
  assert.equal(result.room.lastDecision.approved, false); assert.equal(result.room.pending, null);
  const repeated = await send(a, 'reject', { code, pendingId: oldPending, requestId: rejectionId });
  assert.equal(repeated.room.revision, result.room.revision);
  result = await send(b, 'call', { code, number: 7 });
  await send(b, 'reject', { code, pendingId: result.room.pending.id }, 403);
  await send(a, 'approve', { code, pendingId: oldPending }, 409);
  await send(a, 'skip', { code }, 400);
  result = await send(a, 'approve', { code, pendingId: result.room.pending.id });
  assert.equal(result.room.turn, third.playerId); assert.deepEqual(result.room.called, [7]);
  await send(a, 'reject', { code, pendingId: oldPending }, 400);
  await send(c, 'call', { code, number: 8 });
  result = await send(a, 'reset', { code });
  assert.equal(result.room.pending, null); assert.equal(result.room.lastDecision, null);
});
