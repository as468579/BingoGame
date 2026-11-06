const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { roundNumberSum, hasHiddenVictory } = require('../src/games/teambingo/victory');
const { createOffers } = require('../src/games/teambingo/hidden-goal-offers');

function fixture(t, target = 77, goals = [`round-${target}`, 'four-corners', 'quick-finish']) {
  const a = 3, b = 3;
  t.mock.method(Date, 'now', () => 0);
  const room = { ...game.initializeRoom(), code: 'SIXTY', host: 'host', phase: 'lobby', revision: 0,
    players: [{ id: 'host', teamId: null, hand: [] }, ...[1, 2].flatMap(team => [
      { id: `c${team}`, teamId: `team-${team}`, hand: [] },
      ...Array.from({ length: team === 1 ? a : b }, (_, i) => ({ id: `${team === 1 ? 'a' : 'b'}${i + 1}`, teamId: `team-${team}`, hand: [] }))
    ])] };
  const act = (kind, data = {}, id = 'host') => applyGameAction(room, room.players.find(p => p.id === id), { kind, ...data }, { isOnline: () => true }, 0);
  act('settings', { playersPerTeam: Math.max(a, b) + 1 });
  // Settings reassign players; use the explicit test roster above.
  for (const p of room.players) {
    p.teamId = p.id === 'host' ? null : `team-${p.id.startsWith('a') || p.id === 'c1' ? 1 : 2}`;
    p.ready = p.id !== 'host';
  }
  act('captain', { teamId: 'team-1', playerId: 'c1' }); act('captain', { teamId: 'team-2', playerId: 'c2' });
  act('start');
  // Explicit three-condition fixtures retain coverage for larger selection counts.
  room.hiddenGoals.requiredCount = 3;
  for (const teamId of Object.keys(room.hiddenGoals.offers)) room.hiddenGoals.offers[teamId] = require('../src/games/teambingo/hidden-goal-offers').createOffers(room.size, 3);
  for (const captain of ['c1', 'c2']) for (const goalId of goals) act('hiddenGoal', { goalId }, captain);
  room.cells.forEach(cell => { cell.isSpecial = false; });
  const call = number => act('call', { number }, room.turn);
  const snapshot = id => game.snapshot(room, { isOnline: () => true }, id);
  return { room, act, call, snapshot };
}

test('66, 77 and 88 are independent options available on every board of size four or greater', () => {
  for (let size = 3; size <= 9; size++) {
    const offers = createOffers(size);
    for (const target of [66, 77, 88]) {
      const goal = offers.find(card => card.id === `round-${target}`);
      assert.equal(Boolean(goal), size >= 4);
      if (goal) { assert.equal(goal.name, String(target)); assert.equal(goal.roundSum, target); }
    }
  }
});

for (const [target, numbers] of [[77, [35, 25, 17]], [88, [35, 29, 24]]]) {
  test(`${target} completes at its exact total without waiting for the global round to end`, t => {
    const f = fixture(t, target);
    [1, 6, 31, 36].forEach(number => Object.assign(f.room.cells.find(c => c.number === number), { isCovered: true, teamId: 'team-1' }));
    for (const n of [numbers[0], 2, numbers[1], 3]) f.call(n);
    assert.equal(f.room.phase, 'playing');
    assert.deepEqual(f.snapshot('c1').hiddenGoal.selections.find(c => c.id === `round-${target}`).progress, { current: numbers[0] + numbers[1], target });
    f.call(numbers[2]);
    assert.equal(roundNumberSum(f.room, 'team-1'), target);
    assert.equal(f.room.roundNumber, 1); assert.equal(f.room.phase, 'finished');
    assert.deepEqual(f.room.winners, ['team-1']);
  });

  test(`${target} rejects totals above its target and cannot borrow the opponent sum`, t => {
    const f = fixture(t, target);
    for (const n of [numbers[0], 2, numbers[1], 3, numbers[2] + 1]) f.call(n);
    assert.equal(roundNumberSum(f.room, 'team-1'), target + 1);
    assert.equal(f.snapshot('c1').hiddenGoal.selections.find(c => c.id === `round-${target}`).completed, false);
    assert.equal(f.room.phase, 'playing'); assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
  });

  test(`${target} retains its identity and achievements across repeated migration and undo history`, t => {
    const f = fixture(t, target);
    for (const n of [numbers[0], 2, numbers[1], 3, numbers[2]]) f.call(n);
    assert.equal(f.room.hiddenGoals.completed['team-1'][`round-${target}`], true);
    f.room.history.push(require('../src/games/teambingo/history').captureGameState(f.room));
    game.migrate(f.room); game.migrate(f.room);
    assert.ok(f.room.hiddenGoals.choices['team-1'].includes(`round-${target}`));
    assert.ok(!f.room.hiddenGoals.choices['team-1'].includes('round-66'));
    assert.equal(f.room.hiddenGoals.completed['team-1'][`round-${target}`], true);
    assert.equal(f.room.history.at(-1).hiddenGoalProgress.completed['team-1'][`round-${target}`], true);
    assert.equal(f.snapshot('c1').hiddenGoal.selections.find(c => c.id === `round-${target}`).name, String(target));
  });
}

test('one team can select all three totals and retain each achievement from a different round', t => {
  const f = fixture(t, 77, ['round-66', 'round-77', 'round-88']);
  assert.deepEqual(f.snapshot('c1').hiddenGoal.selections.map(c => c.progress.target), [66, 77, 88]);
  for (const [round, target, numbers] of [[1, 66, [36, 19, 11]], [2, 77, [35, 25, 17]], [3, 88, [34, 30, 24]]]) {
    f.room.roundNumber = round;
    numbers.forEach(number => Object.assign(f.room.cells.find(c => c.number === number), { isCovered: true, teamId: 'team-1', claimedRound: round }));
    const finished = require('../src/games/teambingo/victory').settleVictory(f.room);
    assert.equal(f.room.hiddenGoals.completed['team-1'][`round-${target}`], true);
    assert.equal(finished, target === 88);
  }
  assert.deepEqual(f.room.winners, ['team-1']);
});

test('new total goals reset current-round progress at the same global round boundary', t => {
  const f = fixture(t, 88);
  for (const n of [8, 20, 9, 21, 10, 22]) f.call(n);
  assert.equal(f.room.roundNumber, 2); assert.equal(roundNumberSum(f.room, 'team-1'), 0);
  f.call(11);
  assert.deepEqual(f.snapshot('c1').hiddenGoal.selections.find(c => c.id === 'round-88').progress, { current: 11, target: 88 });
});
