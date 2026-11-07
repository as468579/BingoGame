const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrateGoalAliases } = require('../src/games/teambingo/hidden-goal-state');
const { privateHiddenGoal } = require('../src/games/teambingo/hidden-goals');

test('version two totals migrate simultaneously without confusing old 66 with new 66', () => {
  const completed = { 'team-1': { 'round-66': true, 'round-77': false, 'round-88': true, sage: true } };
  const room = { size: 6, host: 'host', captains: { 'team-1': 'captain' }, cells: [], roundNumber: 2,
    hiddenGoals: { catalogVersion: 2, requiredCount: 3,
      choices: { 'team-1': ['round-66', 'round-77', 'round-88'], 'team-2': 'round-66' },
      offers: { 'team-1': [66, 77, 88].map(n => ({ id: `round-${n}`, name: String(n), roundSum: n, effect: 'old rule' })) },
      completed: structuredClone(completed), publicProgress: { 'team-1': [{ current: 1, target: 1, completed: true }] } },
    history: [{ hiddenGoalProgress: { completed: structuredClone(completed) } }] };
  migrateGoalAliases(room);
  const ids = ['round-44', 'round-55', 'round-66'];
  assert.deepEqual(room.hiddenGoals.choices['team-1'], ids);
  assert.equal(room.hiddenGoals.choices['team-2'], 'round-44');
  assert.deepEqual(room.hiddenGoals.offers['team-1'].map(card => card.id), ids);
  const flags = { 'team-1': { 'round-44': true, 'round-55': false, 'round-66': true, sage: true } };
  assert.deepEqual(room.hiddenGoals.completed, flags);
  assert.deepEqual(room.history[0].hiddenGoalProgress.completed, flags);
  const cards = privateHiddenGoal(room, { id: 'captain', teamId: 'team-1' }).selections;
  assert.deepEqual(cards.map(card => card.name), ['44', '55', '66']);
  assert.deepEqual(cards.map(card => card.roundSum), [44, 55, 66]);
  assert.ok(cards.every(card => card.reward.item === '超級藥水' && card.reward.quantity === 1000));
  const once = structuredClone(room); migrateGoalAliases(room); assert.deepEqual(room, once);
});
