const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { createOffers } = require('../src/games/teambingo/hidden-goal-offers');
const { settleVictory } = require('../src/games/teambingo/victory');

function settingsFixture() {
  const room = { ...game.initializeRoom(), code: 'CONFIG', host: 'host', phase: 'lobby', revision: 0,
    players: ['host', 'c1', 'a', 'c2', 'b'].map(id => ({ id, name: id, hand: [], teamId: null, ready: false })) };
  const act = (kind, data = {}, id = 'host') => applyGameAction(room, room.players.find(p => p.id === id), { kind, ...data }, { isOnline: () => true }, 0);
  return { room, act };
}
test('host settings configure the exact number of choices and retain it across reset and reload', () => {
  const { maxGoalCount } = require('../src/games/teambingo/hidden-goal-offers');
  for (const count of [1, 2, 3, maxGoalCount(6)]) {
    const f = settingsFixture(); f.act('settings', { hiddenGoalCount: count });
    assert.equal(f.room.hiddenGoalCount, count);
    const snapshot = game.snapshot(f.room, { isOnline: () => true }, 'host');
    assert.equal(snapshot.hiddenGoalCount, count); assert.equal(snapshot.hiddenGoalMaxCount, maxGoalCount(6));
    assert.equal(snapshot.availableHiddenGoals.some(card => card.id === 'quick-finish'), count >= 3);
    f.room.players.forEach(p => { if (p.id !== 'host') p.ready = true; });
    f.act('captain', { teamId: 'team-1', playerId: 'c1' }); f.act('captain', { teamId: 'team-2', playerId: 'c2' });
    f.act('start');
    assert.equal(f.room.hiddenGoals.requiredCount, count);
    for (const captain of ['c1', 'c2']) {
      const teamId = f.room.players.find(p => p.id === captain).teamId;
      for (const card of f.room.hiddenGoals.offers[teamId].slice(0, count)) f.act('hiddenGoal', { goalId: card.id }, captain);
    }
    assert.equal(f.room.phase, 'playing');
    assert.throws(() => f.act('settings', { hiddenGoalCount: 2 }), /重新開局/);
    const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved); assert.equal(saved.hiddenGoalCount, count);
    f.act('reset'); assert.equal(f.room.hiddenGoalCount, count);
  }
});
test('goal count settings reject invalid values, nonhosts and unavailable counts atomically', () => {
  const f = settingsFixture();
  for (const hiddenGoalCount of [0, -1, 1.5, '3', null, 999]) {
    const before = structuredClone(f.room);
    assert.throws(() => f.act('settings', { hiddenGoalCount }), /隱藏條件數量/);
    assert.deepEqual(f.room, before);
  }
  assert.throws(() => f.act('settings', { hiddenGoalCount: 3 }, 'a'), /只有房主/);
  assert.throws(() => f.act('settings', { size: 3, hiddenGoalCount: 13 }), /隱藏條件數量/);
  f.act('settings', { size: 3, hiddenGoalCount: 3 });
  assert.equal(f.room.size, 3); assert.equal(f.room.hiddenGoalCount, 3);
});

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
  assert.equal(view.hiddenGoal.options.length, 12);
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

test('public hidden-condition reference follows actual offer rules and never includes private progress', t => {
  const f = fixture(t);
  f.act('hiddenGoal', { goalId: 'mathematician' }, 'c1');
  const before = structuredClone(f.room);
  const catalog = require('../src/games/teambingo/hidden-goal-catalog');
  const snapshots = ['host', 'c1', 'a', 'b'].map(id => f.snapshot(id));
  for (const snapshot of snapshots) {
    const list = snapshot.availableHiddenGoals;
    assert.deepEqual(list.map(card => card.id), createOffers(f.room.size, 2).map(card => card.id));
    assert.match(list.find(card => card.id === 'mathematician').effect, new RegExp(String(f.room.size - 1)));
    assert.ok(list.every(card => !card.effect.includes('(n-1)')));
    for (const card of list) {
      assert.equal(card.name, catalog.find(item => item.id === card.id).name);
      for (const field of ['selected', 'completed', 'progress', 'teamId']) assert.equal(card[field], undefined);
    }
  }
  assert.deepEqual(snapshots[0].availableHiddenGoals, snapshots[2].availableHiddenGoals);
  assert.deepEqual(f.room, before);
  f.room.size = 3; f.room.hiddenGoals.requiredCount = 3;
  const small = f.snapshot('host').availableHiddenGoals;
  assert.ok(small.some(card => card.id === 'quick-finish'));
  assert.ok(!small.some(card => ['round-66', 'round-77', 'round-88'].includes(card.id)));
  delete f.room.hiddenGoals;
  assert.ok(!f.snapshot('host').availableHiddenGoals.some(card => card.id === 'quick-finish'));
});

test('the public reference filters all supported board sizes and resolves dynamic goals without mutating the catalog', () => {
  const { availableHiddenGoals } = require('../src/games/teambingo/hidden-goals');
  const catalog = require('../src/games/teambingo/hidden-goal-catalog');
  const before = structuredClone(catalog);
  for (let size = 3; size <= 9; size++) for (const requiredCount of [1, 2, 3]) {
    const room = { size, hiddenGoals: { requiredCount } };
    const options = availableHiddenGoals(room);
    assert.equal(new Set(options.map(card => card.id)).size, options.length);
    assert.ok(options.every(card => !card.id.startsWith('pending-')));
    assert.equal(options.some(card => card.id === 'quick-finish'), requiredCount >= 3);
    for (const id of ['round-66', 'round-77', 'round-88']) assert.equal(options.some(card => card.id === id), size >= 4);
    for (const id of ['mathematician', 'almost-bingo']) {
      assert.match(options.find(card => card.id === id).effect, new RegExp(String(size - 1)));
      assert.ok(!options.find(card => card.id === id).effect.includes('(n-1)'));
    }
    options[0].name = 'changed by viewer';
    assert.notEqual(availableHiddenGoals(room)[0].name, 'changed by viewer');
  }
  assert.deepEqual(catalog, before);
});
