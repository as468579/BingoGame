const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBoard, createSpecialCells } = require('../src/games/teambingo/board');
const { applyGameAction } = require('../src/games/teambingo/actions');
const game = require('../src/games/teambingo');
const { advanceTurn } = require('../src/games/teambingo/turns');
const { teamHand } = require('../src/games/teambingo/team-hands');
const { drawForNumber } = require('../src/games/teambingo/card-actions');
const { captureGameState } = require('../src/games/teambingo/history');
const { awardLinePrizes, teamLines } = require('../src/games/teambingo/prizes');

// Exercise domain actions directly: no HTTP, repository, timers or live room data.
function lobby() {
  const room = { ...game.initializeRoom(), phase: 'lobby', host: 'host', players: [
    { id: 'host', teamId: 'team-1', ready: true, hand: [] },
    { id: 'guest', teamId: 'team-2', ready: false, hand: [] }
  ] };
  room.cells.forEach((cell, index) => { cell.isSpecial = index < 8; });
  return room;
}
const act = (room, data, player = room.players[0]) => applyGameAction(room, player, data, { isOnline: () => true });

for (const [size, expected] of [[3, 2], [4, 2], [5, 3], [6, 5], [7, 6], [8, 8], [9, 10]]) {
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
  for (const [total, expected] of [[0, 0], [1, 1], [6, 1], [8, 1], [9, 2], [10, 2], [11, 2], [25, 3], [26, 4]]) {
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
  assert.equal(room.cells.filter(cell => cell.isSpecial).length, 8);
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
  assert.equal(room.cells.filter(cell => cell.isSpecial).length, 8);
  const initialized = structuredClone(room.cells);
  game.migrate(room); assert.deepEqual(room.cells, initialized);
  const playing = lobby(); playing.phase = 'playing';
  playing.cells.forEach(cell => { delete cell.isSpecial; });
  game.migrate(playing);
  assert.ok(playing.cells.every(cell => !Object.hasOwn(cell, 'isSpecial')));
});

function playing(size = 3) {
  const room = lobby(); room.revision = 0;
  act(room, { kind: 'settings', size, teamCount: 2, playersPerTeam: 1 });
  for (const player of room.players) act(room, { kind: 'ready', ready: true }, player);
  act(room, { kind: 'start' });
  room.cells.forEach(cell => { cell.isSpecial = false; });
  return room;
}
function giveCard(room, teamId = 'team-1') { return drawForNumber({ hand: teamHand(room, teamId) }); }
function occupy(room, number, teamId) {
  Object.assign(room.cells.find(cell => cell.number === number), { isCovered: true, teamId });
  room.called.push(number);
}

test('starting requires host approval, at least one ready member per team, but not full teams', () => {
  const room = lobby(), guest = room.players[1];
  const before = structuredClone(room);
  assert.throws(() => act(room, { kind: 'start' }, guest), /只有房主/);
  assert.throws(() => act(room, { kind: 'start' }), /準備/);
  assert.deepEqual(room, before);
  guest.ready = true; guest.teamId = 'team-1';
  assert.throws(() => act(room, { kind: 'start' }), /每隊至少/);
  guest.teamId = 'team-2';
  act(room, { kind: 'start' });
  assert.equal(room.playersPerTeam, 2); assert.equal(room.players.length, 2);
  assert.equal(room.phase, 'playing');
});

test('turn order follows the fixed member order and wraps even when teammates share a team', () => {
  const room = playing();
  room.players.splice(1, 0, { id: 'teammate', teamId: 'team-1', hand: [] });
  const order = [];
  for (let i = 0; i < 4; i++) { order.push(room.turn); advanceTurn(room); }
  assert.deepEqual(order, ['host', 'teammate', 'guest', 'host']);
});

test('normal claims grant ownership only and special claims add exactly one shared team card', () => {
  for (const isSpecial of [false, true]) {
    const room = playing(), cell = room.cells[0]; cell.isSpecial = isSpecial;
    act(room, { kind: 'call', number: 1 });
    assert.equal(cell.isCovered, true); assert.equal(cell.teamId, 'team-1'); assert.equal(cell.playerId, 'host');
    assert.equal(room.teamHands['team-1']?.length || 0, isSpecial ? 1 : 0);
    assert.equal(room.teamHands['team-2']?.length || 0, 0);
    assert.ok(room.players.every(player => !player.hand.length));
    assert.equal(room.turn, 'guest');
  }
});

test('out-of-turn, out-of-range and occupied claims cannot mutate state or grant cards', () => {
  const room = playing(); act(room, { kind: 'call', number: 1 });
  const before = structuredClone(room), guest = room.players[1];
  assert.throws(() => act(room, { kind: 'call', number: 2 }), /輪到/);
  for (const number of [0, 10, 1.5, '2', 1]) assert.throws(() => act(room, { kind: 'call', number }, guest));
  assert.deepEqual(room, before);
});

test('only single-team complete lines award prizes and intersecting lines each award once', () => {
  const room = playing(4);
  for (const number of [1, 2, 3, 4, 5, 9, 13, 6, 11, 16]) occupy(room, number, 'team-1');
  assert.equal(teamLines(room, 'team-1'), 3);
  awardLinePrizes(room);
  assert.deepEqual(room.linePrizes.filter(prize => prize.claimedBy === 'team-1').map(prize => prize.id).sort(), ['column-0', 'diagonal-0', 'row-0']);
  const awarded = structuredClone(room.linePrizes); awardLinePrizes(room);
  assert.deepEqual(room.linePrizes, awarded);
  const blocked = playing();
  occupy(blocked, 1, 'team-1'); occupy(blocked, 2, 'team-2'); occupy(blocked, 3, 'team-1');
  awardLinePrizes(blocked);
  assert.equal(teamLines(blocked, 'team-1'), 0);
  assert.ok(blocked.linePrizes.every(prize => prize.claimedBy === null));
});

test('one completed line ends immediately with that team winning', () => {
  const room = playing(4);
  for (const number of [1, 2, 3]) occupy(room, number, 'team-1');
  assert.equal(teamLines(room, 'team-1'), 0);
  act(room, { kind: 'call', number: 4 });
  assert.equal(room.phase, 'finished'); assert.equal(room.turn, null);
  assert.deepEqual(room.winners, ['team-1']);
  const finished = structuredClone(room);
  assert.throws(() => act(room, { kind: 'call', number: 9 }), /選號階段/);
  assert.deepEqual(room, finished);
});

test('a full blocked board with zero lines declares all tied teams as winners', () => {
  const room = playing(), owners = [1, 2, 1, 1, 2, 2, 2, 1];
  owners.forEach((owner, index) => occupy(room, index + 1, `team-${owner}`));
  act(room, { kind: 'call', number: 9 });
  assert.equal(room.phase, 'finished'); assert.deepEqual(room.winners, ['team-1', 'team-2']);
  assert.equal(teamLines(room, 'team-1'), 0); assert.equal(teamLines(room, 'team-2'), 0);
});

test('a completed line wins regardless of which team performed the final action', () => {
  const room = playing(4), owners = [1, 1, 1, 1, 2, 1, 2, 2, 2, 2, 1, 2, 2, 2, 1];
  owners.forEach((owner, index) => occupy(room, index + 1, `team-${owner}`));
  room.turn = 'guest'; act(room, { kind: 'call', number: 16 }, room.players[1]);
  assert.equal(teamLines(room, 'team-1'), 1); assert.equal(teamLines(room, 'team-2'), 0);
  assert.equal(room.phase, 'finished'); assert.deepEqual(room.winners, ['team-1']);
});

test('cancelling before submission restores the same shared card and leaves the turn available', () => {
  const room = playing(), first = giveCard(room), second = giveCard(room);
  act(room, { kind: 'cardUse', cardId: first.id });
  act(room, { kind: 'cardCancel', cardSessionId: room.activeCard.id });
  assert.deepEqual(room.teamHands['team-1'].map(card => card.id), [first.id, second.id]);
  assert.equal(room.history.length, 0); assert.equal(room.turn, 'host');
  act(room, { kind: 'call', number: 1 }); assert.equal(room.turn, 'guest');
});

test('a completed card action consumes the turn for either verdict without allowing a number claim', () => {
  for (const correct of [true, false]) {
    const room = playing(), held = giveCard(room);
    act(room, { kind: 'cardUse', cardId: held.id });
    const cardSessionId = room.activeCard.id;
    assert.throws(() => act(room, { kind: 'call', number: 1 }), /暫停/);
    act(room, { kind: 'cardAnswer', cardSessionId, choice: 0 });
    act(room, { kind: 'cardJudge', cardSessionId, correct });
    act(room, { kind: 'cardFinish', cardSessionId });
    assert.equal(room.teamHands['team-1'].length, 0); assert.equal(room.turn, 'guest');
    assert.throws(() => act(room, { kind: 'call', number: 1 }), /輪到/);
    assert.ok(room.cells.every(cell => !cell.isCovered));
  }
});

test('undo atomically restores a winning special claim, prizes, hand, turn and special positions', () => {
  const room = playing(4);
  for (const number of [1, 2, 3]) occupy(room, number, 'team-1');
  room.cells[3].isSpecial = true; awardLinePrizes(room);
  const before = captureGameState(room);
  act(room, { kind: 'call', number: 4 });
  assert.equal(room.phase, 'finished'); assert.equal(room.teamHands['team-1'].length, 1);
  act(room, { kind: 'undo', revision: room.revision });
  assert.deepEqual(captureGameState(room), before);
  assert.equal(room.cells[3].isSpecial, true); assert.equal(room.history.length, 0);
});

test('Team Bingo requires only one line at every supported board size', () => {
  const { winningLineGoal } = require('../src/games/teambingo/board');
  for (let size = 3; size <= 9; size++) {
    assert.equal(winningLineGoal(size), 1);
    const room = playing(size);
    for (let number = 1; number < size; number++) occupy(room, number, 'team-1');
    act(room, { kind: 'call', number: size });
    assert.equal(room.phase, 'finished'); assert.deepEqual(room.winners, ['team-1']);
  }
});

test('hidden victory is inactive by default and its future rule can settle without a line', () => {
  const { winningTeams, settleVictory } = require('../src/games/teambingo/victory');
  const room = playing();
  assert.deepEqual(winningTeams(room), []); assert.equal(settleVictory(room), false);
  assert.equal(room.phase, 'playing');
  const futureRule = (state, teamId) => state === room && teamId === 'team-2';
  assert.equal(settleVictory(room, futureRule), true);
  assert.deepEqual(room.winners, ['team-2']); assert.equal(room.turn, null);
});

test('card questions pause game actions and only the answering member and host can advance each stage', () => {
  const room = playing(), guest = room.players[1], held = giveCard(room, 'team-2');
  room.turn = guest.id; act(room, { kind: 'cardUse', cardId: held.id }, guest);
  const cardSessionId = room.activeCard.id, before = structuredClone(room);
  for (const kind of ['call', 'reset', 'skip', 'captain', 'settings']) assert.throws(() => act(room, { kind, number: 1 }), /暫停/);
  assert.throws(() => act(room, { kind: 'cardAnswer', cardSessionId, choice: 0 }), /只有使用/);
  assert.throws(() => act(room, { kind: 'cardFinish', cardSessionId }, guest), /等待作答/);
  assert.deepEqual(room, before);
  act(room, { kind: 'cardAnswer', cardSessionId, choice: 0 }, guest);
  assert.throws(() => act(room, { kind: 'cardJudge', cardSessionId, correct: true }, guest), /只有房主/);
  assert.throws(() => act(room, { kind: 'cardCancel', cardSessionId }, guest), /答案已提交/);
  act(room, { kind: 'cardJudge', cardSessionId, correct: false });
  act(room, { kind: 'cardFinish', cardSessionId }, guest);
  assert.equal(room.turn, 'host');
});
