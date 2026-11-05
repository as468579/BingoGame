const { test } = require('node:test');
// Keep rule fixtures deterministic by limiting their bank; production cards allow all difficulties.
const fixtureQuestions = require('../src/games/teambingo/question-bank').questions;
const configuredFixtureQuestions = fixtureQuestions.slice();
test.beforeEach(() => { fixtureQuestions.splice(0, fixtureQuestions.length, ...configuredFixtureQuestions.filter(question => question.difficulty === '簡單' && question.type === 'multiple-choice' && Number.isInteger(question.answer))); });
test.afterEach(() => { fixtureQuestions.splice(0, fixtureQuestions.length, ...configuredFixtureQuestions); });
const assert = require('node:assert/strict');
const { createBoard, createSpecialCells } = require('../src/games/teambingo/board');
const { applyGameAction } = require('../src/games/teambingo/actions');
const game = require('../src/games/teambingo');
const { advanceTurn } = require('../src/games/teambingo/turns');
const { teamHand } = require('../src/games/teambingo/team-hands');
const { drawForNumber } = require('../src/games/teambingo/card-actions');
const { captureGameState } = require('../src/games/teambingo/history');
const { awardLinePrizes, teamLines } = require('../src/games/teambingo/prizes');
const { prepareCaptains, completeGoalSelection, separateHost, hostAction } = require('../scripts/test-support/team-goal-setup.cjs');

// Exercise domain actions directly: no HTTP, repository, timers or live room data.
function lobby() {
  const room = { ...game.initializeRoom(), phase: 'lobby', host: 'host', players: [
    { id: 'host', teamId: 'team-1', ready: true, hand: [] },
    { id: 'guest', teamId: 'team-2', ready: false, hand: [] }
  ] };
  separateHost(room);
  room.cells.forEach((cell, index) => { cell.isSpecial = index < 6; });
  return room;
}
const act = (room, data, player = room.players[0]) => {
  if (!room.players.some(player => player.id === room.host)) separateHost(room);
  if (data.kind === 'start') prepareCaptains(room);
  applyGameAction(room, hostAction(room, player, data.kind), data, { isOnline: () => true });
  if (data.kind === 'start') completeGoalSelection(room, (captain, goalId) => act(room, { kind: 'hiddenGoal', goalId }, captain));
};

test('default rooms have two teams, a valid 6x6 board and six unclaimed special cells', () => {
  const room = game.initializeRoom();
  assert.equal(room.teamCount, 2);
  assert.equal(room.size, 6);
  assert.deepEqual([...room.board].sort((a, b) => a - b), Array.from({ length: 36 }, (_, i) => i + 1));
  assert.deepEqual(room.cells.map(cell => cell.number), room.board);
  assert.equal(room.cells.filter(cell => cell.isSpecial).length, 6);
  assert.ok(room.cells.every(cell => !cell.isCovered && !cell.teamId));
  assert.equal(room.linePrizes.length, 14);
});

test('changing one room cannot change the next room defaults or its mutable state', () => {
  const first = game.initializeRoom(), second = game.initializeRoom();
  const unchanged = structuredClone(second);
  first.size = 8; first.teamCount = 3;
  first.board[0] = 999; first.cells[0].isCovered = true;
  first.linePrizes.splice(0); first.teamHands['team-1'] = [{ id: 'test-card' }];
  assert.deepEqual(second, unchanged);
  const next = game.initializeRoom();
  assert.equal(next.size, 6); assert.equal(next.teamCount, 2);
  assert.equal(next.board.length, 36); assert.equal(next.board[0], 1);
});

test('host settings and reset preserve custom dimensions instead of reapplying creation defaults', () => {
  const room = lobby();
  act(room, { kind: 'settings', size: 8, teamCount: 3, playersPerTeam: 2 });
  act(room, { kind: 'reset' });
  game.migrate(room);
  assert.equal(room.size, 8); assert.equal(room.teamCount, 3);
  assert.equal(room.board.length, 64); assert.equal(room.cells.length, 64);
  assert.equal(room.cells.filter(cell => cell.isSpecial).length, 10);
  assert.equal(room.linePrizes.length, 18);
});

test('migration retains an existing room layout and team count after default changes', () => {
  const room = lobby();
  act(room, { kind: 'settings', size: 5, teamCount: 4, playersPerTeam: 2 });
  act(room, { kind: 'board', board: [...room.board].reverse(), boardVersion: room.boardVersion });
  const saved = structuredClone(room);
  game.migrate(room);
  assert.equal(room.teamCount, 4); assert.equal(room.size, 5);
  assert.deepEqual(room.board, saved.board);
  assert.deepEqual(room.cells, saved.cells);
  assert.deepEqual(room.linePrizes, saved.linePrizes);
});

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
  for (const [total, expected] of [[0, 0], [1, 1], [6, 1], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [20, 3], [21, 4], [25, 4], [26, 4]]) {
    let calls = 0;
    const cells = createSpecialCells(Array.from({ length: total }, (_, i) => i + 1), () => { calls++; return 0; });
    assert.equal(cells.filter(cell => cell.isSpecial).length, expected);
    assert.equal(calls, expected);
  }
});

test('fifteen-percent layouts obey the ceiling for every total through the largest supported board', () => {
  for (let total = 0; total <= 81; total++) {
    const board = Object.freeze(Array.from({ length: total }, (_, i) => i + 1));
    for (const pick of [() => 0, bound => bound - 1]) {
      const cells = createSpecialCells(board, pick);
      const special = cells.filter(cell => cell.isSpecial);
      assert.equal(special.length, Math.ceil(total * 15 / 100));
      assert.equal(new Set(special.map(cell => cell.number)).size, special.length);
      assert.deepEqual(cells.map(cell => cell.number), board);
      assert.ok(cells.every(cell => cell.isCovered === false));
    }
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
  assert.equal(room.cells[0].number, 36);
  assert.ok(room.players.every(player => !player.ready));
});

test('shuffle refreshes fixed-count specials while preserving mixed preparation states', () => {
  const room = lobby(), version = room.boardVersion;
  room.cells.forEach(cell => { cell.isSpecial = false; });
  act(room, { kind: 'board', board: room.board, boardVersion: version, rerollSpecial: true });
  assert.equal(room.cells.filter(cell => cell.isSpecial).length, 6);
  assert.deepEqual(room.players.filter(player => player.id !== room.host).map(player => player.ready), [true, false]);
  assert.equal(room.boardVersion, version + 1);
});

test('unauthorized, stale and invalid shuffle requests preserve the complete room state', () => {
  const room = lobby();
  const request = { kind: 'board', board: room.board, boardVersion: room.boardVersion, rerollSpecial: true };
  const before = structuredClone(room);
  assert.throws(() => act(room, request, room.players[1]), /只有房主/);
  assert.throws(() => act(room, { ...request, boardVersion: -1 }), /已更新/);
  assert.throws(() => act(room, { ...request, board: Array(36).fill(1) }), /每個數字/);
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
  assert.equal(room.cells.filter(cell => cell.isSpecial).length, 6);
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
  for (const player of room.players.filter(player => player.id !== room.host)) act(room, { kind: 'ready', ready: true }, player);
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
  assert.equal(room.playersPerTeam, 2); assert.equal(room.players.filter(player => player.id !== room.host && !Object.values(room.captains).includes(player.id)).length, 2);
  assert.equal(room.phase, 'playing');
});

test('turn order alternates teams before moving to the next member and wraps', () => {
  const room = playing();
  room.players.splice(1, 0, { id: 'teammate', teamId: 'team-1', hand: [] });
  const order = [];
  for (let i = 0; i < 4; i++) { order.push(room.turn); advanceTurn(room); }
  assert.deepEqual(order, ['host', 'guest', 'teammate', 'guest']);
});

test('three-team play starts with team one even when the host joined another team first', () => {
  const room = lobby(); room.teamCount = 3; room.playersPerTeam = 2; room.host = 'c1';
  room.players = [['c1', 'team-3'], ['a1', 'team-1'], ['a2', 'team-1'], ['b1', 'team-2'], ['b2', 'team-2'], ['c2', 'team-3']]
    .map(([id, teamId]) => ({ id, teamId, ready: true, hand: [] }));
  separateHost(room);
  act(room, { kind: 'start' });
  const order = [];
  for (let index = 0; index < 7; index++) { order.push(room.turn); advanceTurn(room); }
  assert.deepEqual(order, ['a1', 'b1', 'c1', 'a2', 'b2', 'c2', 'a1']);
});

test('unequal teams rotate their own members independently without empty team turns', () => {
  const room = lobby(); room.teamCount = 3; room.playersPerTeam = 3; room.host = 'c1';
  room.players = [['c1', 'team-3'], ['a1', 'team-1'], ['a2', 'team-1'], ['b1', 'team-2'], ['c2', 'team-3'], ['c3', 'team-3']]
    .map(([id, teamId]) => ({ id, teamId, ready: true, hand: [] }));
  separateHost(room);
  act(room, { kind: 'start' });
  const order = [];
  for (let index = 0; index < 12; index++) { order.push(room.turn); advanceTurn(room); }
  assert.deepEqual(order, ['a1', 'b1', 'c1', 'a2', 'b1', 'c2', 'a1', 'b1', 'c3', 'a2', 'b1', 'c1']);
});

test('interleaved turns skip all seats of expired teams without removing them from the roster', () => {
  const room = playing();
  room.players.splice(1, 0, { id: 'teammate', teamId: 'team-1', hand: [] });
  room.teamClock.remaining['team-1'] = 0;
  const before = structuredClone(room.players);
  advanceTurn(room); assert.equal(room.turn, 'guest');
  advanceTurn(room); assert.equal(room.turn, 'guest');
  assert.deepEqual(room.players, before);
});

test('three-versus-two players follow the requested repeating team sequence', () => {
  const room = lobby(); room.playersPerTeam = 3;
  room.players = [['host', 'team-1'], ['a2', 'team-1'], ['a3', 'team-1'], ['b1', 'team-2'], ['b2', 'team-2']]
    .map(([id, teamId]) => ({ id, teamId, ready: true, hand: [] }));
  act(room, { kind: 'start' });
  const order = [];
  for (let index = 0; index < 24; index++) { order.push(room.turn); advanceTurn(room); }
  assert.deepEqual(order.slice(0, 8), ['host', 'b1', 'a2', 'b2', 'a3', 'b1', 'host', 'b2']);
  assert.deepEqual(order.slice(0, 12), order.slice(12));
});

test('team member cursors survive save migration, undo, replay and reset', () => {
  const room = lobby();
  room.players = ['host', 'a2', 'a3', 'b1', 'b2'].map(id => ({ id, hand: [], usedDemoCards: [] }));
  act(room, { kind: 'settings', size: 4, teamCount: 2, playersPerTeam: 3 });
  room.players.filter(player => player.id !== room.host).forEach(player => act(room, { kind: 'ready', ready: true }, player));
  act(room, { kind: 'start' });
  for (let number = 1; number <= 5; number++) act(room, { kind: 'call', number }, room.players.find(player => player.id === room.turn));
  assert.equal(room.turn, 'b1');
  const saved = JSON.parse(JSON.stringify(room)); game.migrate(saved);
  assert.deepEqual(saved.turnCursors, room.turnCursors);
  advanceTurn(saved); assert.equal(saved.turn, 'host');
  const before = captureGameState(room);
  act(room, { kind: 'call', number: 6 }, room.players.find(player => player.id === room.turn));
  assert.equal(room.turn, 'host');
  act(room, { kind: 'undo', revision: room.revision });
  assert.equal(room.turn, 'b1'); assert.deepEqual(room.turnCursors, before.turnCursors);
  act(room, { kind: 'call', number: 6 }, room.players.find(player => player.id === room.turn));
  assert.equal(room.turn, 'host');
  act(room, { kind: 'reset' }); assert.deepEqual(room.turnCursors, {});
  room.players.filter(player => player.id !== room.host).forEach(player => act(room, { kind: 'ready', ready: true }, player));
  act(room, { kind: 'start' }); assert.equal(room.turn, 'host');
  advanceTurn(room); assert.equal(room.turn, 'b1');
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

test('cancellation before submission cannot refund a card, remove history or unlock number selection', () => {
  const room = playing(), first = giveCard(room), second = giveCard(room);
  act(room, { kind: 'cardUse', cardId: first.id });
  const before = structuredClone(room);
  assert.throws(() => act(room, { kind: 'cardCancel', cardSessionId: room.activeCard.id }), /無法取消/);
  assert.deepEqual(room, before);
  assert.deepEqual(room.teamHands['team-1'].map(card => card.id), [second.id]);
  assert.equal(room.history.length, 1); assert.equal(room.turn, 'host');
  assert.throws(() => act(room, { kind: 'call', number: 1 }), /暫停/);
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

test('card award snapshots broadcast only the awarded card and undo removes that public award', () => {
  const room = playing();
  const earlier = giveCard(room, 'team-1'), opponentCard = giveCard(room, 'team-2');
  room.cells[0].isSpecial = true;
  act(room, { kind: 'call', number: 1 });
  const granted = room.teamHands['team-1'].at(-1), before = structuredClone(room);
  const snapshots = room.players.map(player => game.snapshot(room, { isOnline: () => true }, player.id));
  for (const [index, snapshot] of snapshots.entries()) {
    assert.equal(snapshot.lastDraw.id, granted.id);
    assert.notEqual(snapshot.lastDraw.id, earlier.id); assert.notEqual(snapshot.lastDraw.id, opponentCard.id);
    assert.equal(snapshot.lastDraw.teamId, 'team-1'); assert.equal(snapshot.lastDraw.teamName, '隊伍 1');
    assert.equal(snapshot.lastDraw.symbol, granted.symbol);
    for (const field of ['answer', 'correctAnswer', 'questionDifficulty', 'effectId']) assert.equal(snapshot.lastDraw[field], undefined);
    assert.equal(snapshot.teamHands, undefined);
    for (const other of snapshot.players.filter(player => player.id !== room.players[index].id)) assert.equal(other.hand, undefined);
  }
  assert.deepEqual(snapshots[0].lastDraw, snapshots[1].lastDraw);
  assert.deepEqual(room, before);
  act(room, { kind: 'undo', revision: room.revision });
  for (const player of room.players) assert.equal(game.snapshot(room, { isOnline: () => true }, player.id).lastDraw, null);
  assert.deepEqual(room.teamHands['team-1'], [earlier]);
  assert.deepEqual(room.teamHands['team-2'], [opponentCard]);
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
