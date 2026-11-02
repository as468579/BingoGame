const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBoard, createSpecialCells } = require('../src/games/bingonext/board');
const { applyGameAction } = require('../src/games/bingonext/actions');
const game = require('../src/games/bingonext');

// Exercise domain actions directly: no HTTP, repository, timers or live room data.
function lobby() {
  const room = { ...game.initializeRoom(), phase: 'lobby', host: 'host', players: [
    { id: 'host', teamId: 'team-1', ready: true, hand: [] },
    { id: 'guest', teamId: 'team-2', ready: false, hand: [] }
  ] };
  room.cells.forEach((cell, index) => { cell.isSpecial = index < 10; });
  return room;
}
const act = (room, data, player = room.players[0]) => applyGameAction(room, player, data, { isOnline: () => true });

for (const [size, expected] of [[3, 2], [4, 3], [5, 4], [6, 6], [7, 8], [8, 10], [9, 13]]) {
  test(`${size}x${size} has exactly ${expected} special cells after rounding upward`, () => {
    const board = createBoard(size);
    for (const pick of [() => 0, bound => bound - 1]) {
      const cells = createSpecialCells(board, pick);
      assert.equal(cells.filter(cell => cell.isSpecial).length, expected);
      assert.deepEqual(cells.map(cell => cell.number), board);
      assert.equal(new Set(cells.filter(cell => cell.isSpecial).map(cell => cell.number)).size, expected);
      assert.ok(cells.every(cell => !cell.isCovered && typeof cell.isSpecial === 'boolean'));
    }
  });
}

test('empty, tiny and exact-multiple boards obey ceiling boundaries', () => {
  for (const [total, expected] of [[0, 0], [1, 1], [6, 1], [7, 2], [9, 2], [10, 2], [11, 2], [20, 3], [21, 4]]) {
    let calls = 0;
    const cells = createSpecialCells(Array.from({ length: total }, (_, i) => i + 1), () => { calls++; return 0; });
    assert.equal(cells.filter(cell => cell.isSpecial).length, expected);
    assert.equal(calls, expected);
  }
});

test('every position can be chosen when the board needs one special cell', () => {
  const board = [1, 2, 3, 4, 5, 6];
  const selected = board.map((_, index) => {
    const cells = createSpecialCells(board, bound => { assert.equal(bound, 6); return index; });
    return cells.findIndex(cell => cell.isSpecial);
  });
  assert.deepEqual(selected, [0, 1, 2, 3, 4, 5]);
});

test('sampling preserves frozen input and returns independent fresh cell objects', () => {
  const board = Object.freeze(createBoard(8));
  const first = createSpecialCells(board, () => 0), second = createSpecialCells(board, bound => bound - 1);
  assert.notDeepEqual(first.map(cell => cell.isSpecial), second.map(cell => cell.isSpecial));
  const originalSecond = structuredClone(second);
  first[0].isCovered = true; first[0].isSpecial = false; first[0].number = 999;
  assert.deepEqual(second, originalSecond);
  assert.equal(board[0], 1);
});

test('manual number changes preserve special positions and cancel readiness', () => {
  const room = lobby(), flags = room.cells.map(cell => cell.isSpecial);
  room.players[1].ready = true;
  act(room, { kind: 'board', board: [...room.board].reverse(), boardVersion: room.boardVersion });
  assert.deepEqual(room.cells.map(cell => cell.isSpecial), flags);
  assert.equal(room.cells[0].number, 64);
  assert.ok(room.players.every(player => !player.ready));
});

test('shuffle refreshes fixed-count specials while preserving mixed preparation states', () => {
  const room = lobby(), version = room.boardVersion;
  room.cells.forEach(cell => { cell.isSpecial = false; });
  act(room, { kind: 'board', board: room.board, boardVersion: version, rerollSpecial: true });
  assert.equal(room.cells.filter(cell => cell.isSpecial).length, 10);
  assert.deepEqual(room.players.map(player => player.ready), [true, false]);
  assert.equal(room.boardVersion, version + 1);
});

test('unauthorized, stale and invalid shuffle requests preserve the complete room state', () => {
  const room = lobby();
  const request = { kind: 'board', board: room.board, boardVersion: room.boardVersion, rerollSpecial: true };
  const before = structuredClone(room);
  assert.throws(() => act(room, request, room.players[1]), /只有房主/);
  assert.throws(() => act(room, { ...request, boardVersion: -1 }), /已更新/);
  assert.throws(() => act(room, { ...request, board: Array(64).fill(1) }), /每個數字/);
  assert.deepEqual(room, before);
});

test('ready toggles and game start keep the prepared special layout unchanged', () => {
  const room = lobby(), cells = structuredClone(room.cells);
  act(room, { kind: 'ready', ready: true }, room.players[1]);
  act(room, { kind: 'start' });
  assert.equal(room.phase, 'playing');
  assert.deepEqual(room.cells, cells);
  assert.equal(room.turn, 'host');
});

test('migration preserves saved layouts and initializes missing lobby flags only once', () => {
  const room = lobby(), original = structuredClone(room.cells);
  game.migrate(room); assert.deepEqual(room.cells, original);
  room.cells.forEach(cell => { delete cell.isSpecial; });
  game.migrate(room);
  assert.equal(room.cells.filter(cell => cell.isSpecial).length, 10);
  const initialized = structuredClone(room.cells);
  game.migrate(room); assert.deepEqual(room.cells, initialized);
  const playing = lobby(); playing.phase = 'playing';
  playing.cells.forEach(cell => { delete cell.isSpecial; });
  game.migrate(playing);
  assert.ok(playing.cells.every(cell => !Object.hasOwn(cell, 'isSpecial')));
});
