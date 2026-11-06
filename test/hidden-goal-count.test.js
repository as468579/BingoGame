const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { createOffers } = require('../src/games/teambingo/hidden-goal-offers');
const { settleVictory } = require('../src/games/teambingo/victory');

function fixture(t) {
  t.mock.method(Date, 'now', () => 0);
  const room = { ...game.initializeRoom(), code: 'TWO', host: 'host', phase: 'lobby', revision: 0,
    players: [{ id: 'host', teamId: null, hand: [] }, ...[['c1', 'team-1'], ['a', 'team-1'], ['c2', 'team-2'], ['b', 'team-2']]
      .map(([id, teamId]) => ({ id, teamId, hand: [], ready: true }))] };
  const act = (kind, data = {}, id = 'host') => applyGameAction(room, room.players.find(p => p.id === id), { kind, ...data }, { isOnline: () => true }, 0);
  act('captain', { teamId: 'team-1', playerId: 'c1' }); act('captain', { teamId: 'team-2', playerId: 'c2' }); act('start');
  return { room, act, snapshot: id => game.snapshot(room, { isOnline: () => true }, id) };
}

test('new games require exactly two different conditions and do not offer quick finish', t => {
  const f = fixture(t), view = f.snapshot('c1');
  assert.equal(f.room.hiddenGoals.requiredCount, 2); assert.equal(view.hiddenGoal.requiredCount, 2);
  assert.equal(view.hiddenGoal.options.length, 10);
  assert.ok(view.hiddenGoal.options.every(card => card.id !== 'quick-finish'));
});

test('quick finish is listed only for counts of at least three on all board sizes', () => {
  for (let size = 3; size <= 9; size++) for (const count of [1, 2, 3, 4]) {
    const offers = createOffers(size, count);
    assert.equal(offers.some(card => card.id === 'quick-finish'), count >= 3);
    assert.equal(new Set(offers.map(card => card.id)).size, offers.length);
  }
});

test('both captains must confirm two distinct conditions before the game starts', t => {
  const f = fixture(t);
  f.act('hiddenGoal', { goalId: 'four-corners' }, 'c1');
  assert.equal(f.room.phase, 'choosing-goal'); assert.equal(f.snapshot('a').goalsRemaining, 2);
  assert.throws(() => f.act('hiddenGoal', { goalId: 'four-corners' }, 'c1'), /重複/);
  f.act('hiddenGoal', { goalId: 'mathematician' }, 'c1');
  assert.equal(f.room.phase, 'choosing-goal'); assert.equal(f.snapshot('a').goalsRemaining, 1);
  for (const goalId of ['four-corners', 'mathematician']) f.act('hiddenGoal', { goalId }, 'c2');
  assert.equal(f.room.phase, 'playing'); assert.equal(f.snapshot('c1').hiddenGoal.selections.length, 2);
  assert.deepEqual(f.room.hiddenGoals.choices['team-1'], f.room.hiddenGoals.choices['team-2']);
});

test('a stale or injected quick-finish offer cannot bypass the two-condition requirement', t => {
  const f = fixture(t);
  f.room.hiddenGoals.offers['team-1'].push(createOffers(6, 3).find(card => card.id === 'quick-finish'));
  const before = structuredClone(f.room);
  assert.throws(() => f.act('hiddenGoal', { goalId: 'quick-finish' }, 'c1'), /至少3個/);
  assert.deepEqual(f.room, before);
});

test('two-condition victory requires both selected goals, not a third one', t => {
  const f = fixture(t);
  for (const captain of ['c1', 'c2']) for (const goalId of ['four-corners', 'sage']) f.act('hiddenGoal', { goalId }, captain);
  [1, 6, 31, 36].forEach(number => Object.assign(f.room.cells.find(c => c.number === number), { isCovered: true, teamId: 'team-1' }));
  assert.equal(settleVictory(f.room), false);
  f.room.teamCorrectAnswers['team-1'] = 4;
  assert.equal(settleVictory(f.room), true); assert.deepEqual(f.room.winners, ['team-1']);
});

test('migration respects saved selection counts when rebuilding incomplete offers', t => {
  const f = fixture(t); f.act('hiddenGoal', { goalId: 'four-corners' }, 'c1');
  for (const count of [2, 3]) {
    const saved = structuredClone(f.room); saved.hiddenGoals.requiredCount = count; game.migrate(saved);
    assert.equal(saved.hiddenGoals.requiredCount, count);
    assert.equal(saved.hiddenGoals.offers['team-1'].some(card => card.id === 'quick-finish'), count >= 3);
    assert.deepEqual(saved.hiddenGoals.choices['team-1'], ['four-corners']);
    assert.equal(saved.phase, 'choosing-goal');
  }
});
