const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { setGoalOffers } = require('../scripts/test-support/team-goal-setup.cjs');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { isPrime, countPrimeCells, hasHiddenVictory } = require('../src/games/teambingo/victory');
const { teamLines } = require('../src/games/teambingo/prizes');

function fixture(t, size = 6, choose = true) {
  t.mock.method(Date, 'now', () => 0);
  const room = { ...game.initializeRoom(), code: 'MATH', phase: 'lobby', revision: 0, host: 'host', players: [
    { id: 'host', teamId: null, ready: false, hand: [] },
    ...[['c1', 'team-1'], ['a1', 'team-1'], ['c2', 'team-2'], ['b1', 'team-2']].map(([id, teamId]) => ({ id, name: id, teamId, ready: true, hand: [] }))
  ] };
  const act = (kind, data = {}, id = 'host') => applyGameAction(room, room.players.find(player => player.id === id), { kind, ...data }, { isOnline: () => true }, 0);
  if (size !== 6) act('settings', { size, teamCount: 2, playersPerTeam: 2 });
  for (const player of room.players) if (player.id !== room.host) player.ready = true;
  act('captain', { teamId: 'team-1', playerId: 'c1' }); act('captain', { teamId: 'team-2', playerId: 'c2' });
  act('start'); setGoalOffers(room);
  if (choose) { act('hiddenGoal', { goalId: 'mathematician' }, 'c1'); act('hiddenGoal', { goalId: 'anticipate-opponent' }, 'c2'); }
  const cover = (number, teamId = 'team-1', playerId = 'a1') => Object.assign(room.cells.find(cell => cell.number === number), { isCovered: true, teamId, playerId });
  return { room, act, cover, snapshot: viewer => game.snapshot(room, { isOnline: () => true }, viewer) };
}

test('primality is correct through every supported board number and excludes one and invalid values', () => {
  const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79];
  for (let number = 1; number <= 81; number++) assert.equal(isPrime(number), primes.includes(number), String(number));
  for (const invalid of [-1, 0, 1, 2.5, NaN, Infinity, '7', null]) assert.equal(isPrime(invalid), false);
});

test('mathematician can be offered and chosen on a 3x3 board with a two-prime target', t => {
  const small = fixture(t, 3, false);
  assert.equal(small.snapshot('c1').hiddenGoal.options.length, 3);
  assert.ok(small.snapshot('c1').hiddenGoal.options.some(card => card.id === 'mathematician'));
  small.act('hiddenGoal', { goalId: 'mathematician' }, 'c1');
  assert.deepEqual(small.snapshot('c1').hiddenGoal.progress, { current: 0, target: 2 });
  const supported = fixture(t, 4, false);
  const card = supported.snapshot('c1').hiddenGoal.options.find(card => card.id === 'mathematician');
  assert.equal(card.name, '數學家'); assert.equal(card.symbol, 'abacus');
  assert.equal(supported.snapshot('c1').hiddenGoal.options.length, 3);
});

test('four owned prime cells do not win but the fifth wins without requiring a line', t => {
  const f = fixture(t);
  [2, 3, 5, 7].forEach((number, index) => f.cover(number, 'team-1', index % 2 ? 'teammate' : 'a1'));
  assert.equal(countPrimeCells(f.room, 'team-1'), 4); assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
  assert.deepEqual(f.snapshot('c1').hiddenGoal.progress, { current: 4, target: 5 });
  f.act('call', { number: 11 }, 'a1');
  assert.equal(teamLines(f.room, 'team-1'), 0);
  assert.equal(f.room.phase, 'finished'); assert.deepEqual(f.room.winners, ['team-1']);
  assert.equal(f.room.endReason, 'hidden-goal'); assert.equal(f.room.turn, null);
});

test('unclaimed primes, opposing primes, one and composites do not count and an unselected goal cannot win', t => {
  const f = fixture(t);
  [2, 3, 5, 7].forEach(number => f.cover(number));
  f.cover(11, 'team-2'); f.cover(1); f.cover(4); f.cover(9);
  assert.equal(countPrimeCells(f.room, 'team-1'), 4);
  assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
  f.cover(11); assert.equal(hasHiddenVictory(f.room, 'team-1'), true);
  f.room.hiddenGoals.choices['team-1'] = 'pending-1';
  assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
});

test('a team that selected mathematician can still win by a normal line before collecting five primes', t => {
  const f = fixture(t); [1, 2, 3, 4, 5].forEach(number => f.cover(number));
  f.act('call', { number: 6 }, 'a1');
  assert.equal(countPrimeCells(f.room, 'team-1'), 3);
  assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
  assert.equal(f.room.phase, 'finished'); assert.deepEqual(f.room.winners, ['team-1']);
  assert.equal(f.room.linePrizes[0].claimedBy, 'team-1');
});

test('undo a prime victory restores four-cell progress while preserving the selected condition', t => {
  const f = fixture(t); [2, 3, 5, 7].forEach(number => f.cover(number));
  f.act('call', { number: 11 }, 'a1');
  f.act('undo', { revision: f.room.revision });
  assert.equal(f.room.phase, 'playing'); assert.deepEqual(f.room.winners, []);
  assert.equal(f.room.endReason, null); assert.equal(f.room.turn, 'a1');
  assert.equal(f.room.hiddenGoals.choices['team-1'], 'mathematician');
  assert.deepEqual(f.snapshot('c1').hiddenGoal.progress, { current: 4, target: 5 });
  assert.equal(f.room.cells.find(cell => cell.number === 11).isCovered, false);
});

test('saved mathematician progress stays private to its captain and the host and resets on a new game', t => {
  const f = fixture(t); [2, 3, 5].forEach(number => f.cover(number));
  const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
  assert.deepEqual(game.snapshot(saved, { isOnline: () => true }, 'c1').hiddenGoal.progress, { current: 3, target: 5 });
  assert.deepEqual(f.snapshot('host').hostHiddenGoals[0].progress, { current: 3, target: 5 });
  assert.equal(f.snapshot('a1').hiddenGoal, undefined); assert.equal(f.snapshot('c2').hiddenGoal.progress, undefined);
  assert.ok(f.snapshot('b1').teams.every(team => !Object.hasOwn(team, 'progress')));
  f.act('reset'); assert.equal(f.room.hiddenGoals, null); assert.equal(countPrimeCells(f.room, 'team-1'), 0);
});

test('mathematician counts cell numbers rather than their index after rearranging the board', t => {
  const f = fixture(t);
  f.room.board = [...f.room.board].reverse();
  f.room.cells = f.room.board.map(number => ({ number, isCovered: false, isSpecial: false }));
  [2, 3, 5, 7].forEach(number => f.cover(number));
  f.act('call', { number: 11 }, 'a1');
  assert.equal(f.room.cells[25].number, 11); assert.equal(f.room.cells[25].isCovered, true);
  assert.equal(countPrimeCells(f.room, 'team-1'), 5); assert.deepEqual(f.room.winners, ['team-1']);
});

test('at least five prime cells also recognizes a restored board with more than five', t => {
  const f = fixture(t);
  [2, 3, 5, 7, 11, 13, 17, 19].forEach(number => f.cover(number));
  assert.equal(countPrimeCells(f.room, 'team-1'), 8); assert.equal(hasHiddenVictory(f.room, 'team-1'), true);
  assert.equal(hasHiddenVictory(f.room, 'team-2'), false);
  const { settleVictory } = require('../src/games/teambingo/victory');
  assert.equal(settleVictory(f.room), true);
  assert.deepEqual(f.room.winners, ['team-1']); assert.equal(f.room.endReason, 'hidden-goal');
});

test('invalid prime claims cannot inflate progress and a composite claim does not satisfy the condition', t => {
  const f = fixture(t); [2, 3, 5, 7].forEach(number => f.cover(number));
  const before = structuredClone(f.room);
  assert.throws(() => f.act('call', { number: 11 }, 'b1'), /輪到/);
  assert.throws(() => f.act('call', { number: 7 }, 'a1'), /已被佔領/);
  assert.deepEqual(f.room, before);
  f.act('call', { number: 1 }, 'a1');
  assert.equal(countPrimeCells(f.room, 'team-1'), 4); assert.equal(f.room.phase, 'playing');
  assert.deepEqual(f.room.winners, []);
});

test('mathematician description, progress and victory use size minus one on every supported size', t => {
  const primes = [2, 3, 5, 7, 11, 13, 17, 19];
  for (let size = 3; size <= 9; size++) {
    const f = fixture(t, size, false);
    assert.equal(f.snapshot('c1').hiddenGoal.options.length, 3);
    f.act('hiddenGoal', { goalId: 'mathematician' }, 'c1');
    f.act('hiddenGoal', { goalId: 'anticipate-opponent' }, 'c2');
    const target = size - 1;
    assert.match(f.snapshot('c1').hiddenGoal.selected.effect, new RegExp(`至少${target}個質數格`));
    assert.match(f.snapshot('host').hostHiddenGoals[0].selected.effect, new RegExp(`至少${target}個質數格`));
    primes.slice(0, target - 1).forEach(number => f.cover(number));
    assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
    assert.deepEqual(f.snapshot('c1').hiddenGoal.progress, { current: target - 1, target });
    f.act('call', { number: primes[target - 1] }, 'a1');
    assert.equal(teamLines(f.room, 'team-1'), 0);
    assert.equal(f.room.phase, 'finished'); assert.deepEqual(f.room.winners, ['team-1']);
  }
});
