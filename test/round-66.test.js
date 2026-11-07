const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { roundNumberSum, hasHiddenVictory } = require('../src/games/teambingo/victory');
const { createOffers } = require('../src/games/teambingo/hidden-goal-offers');

function fixture(t, a = 3, b = 3) {
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
  act('start'); room.hiddenGoals.requiredCount = 1;
  act('hiddenGoal', { goalId: 'round-66' }, 'c1'); act('hiddenGoal', { goalId: 'round-66' }, 'c2');
  room.cells.forEach(cell => { cell.isSpecial = false; });
  const call = number => act('call', { number }, room.turn);
  const snapshot = id => game.snapshot(room, { isOnline: () => true }, id);
  return { room, act, call, snapshot };
}

test('66 wins immediately at exactly 66 before the other team completes its round', t => {
  const f = fixture(t);
  [36, 1, 19, 2].forEach(f.call);
  assert.deepEqual(f.snapshot('c1').hiddenGoal.progress, { current: 0, target: 1 });
  assert.equal(f.room.phase, 'playing');
  f.call(11);
  assert.equal(roundNumberSum(f.room, 'team-1'), 66);
  assert.equal(f.room.roundNumber, 1); assert.equal(f.room.phase, 'finished');
  assert.equal(f.room.endReason, 'hidden-goal'); assert.deepEqual(f.room.winners, ['team-1']);
  assert.deepEqual(f.snapshot('host').teams[0].bonusRewards, [{ item: '超級藥水', quantity: 1000 }]);
  assert.deepEqual(f.snapshot('c1').teams[0].bonusRewards, [{ item: '超級藥水', quantity: 1000 }]);
  f.act('undo', { revision: f.room.revision });
  assert.deepEqual(f.snapshot('host').teams[0].bonusRewards, []);
});

test('exceeding 66 does not satisfy the condition', t => {
  const f = fixture(t); [36, 1, 19, 2, 12].forEach(f.call);
  assert.equal(roundNumberSum(f.room, 'team-1'), 67);
  assert.equal(hasHiddenVictory(f.room, 'team-1'), false); assert.equal(f.room.phase, 'playing');
});

test('totals reset at the global round boundary and old occupied numbers stay excluded', t => {
  const f = fixture(t, 1, 1);
  f.call(36); assert.equal(roundNumberSum(f.room, 'team-1'), 36);
  f.call(1); assert.equal(f.room.roundNumber, 2);
  assert.equal(roundNumberSum(f.room, 'team-1'), 0);
  f.call(19); assert.equal(roundNumberSum(f.room, 'team-1'), 19);
  assert.equal(f.room.cells.find(c => c.number === 36).claimedRound, 1);
  assert.equal(f.room.cells.find(c => c.number === 19).claimedRound, 2);
});

test('shorter teams accumulate repeated member actions within the same global round', t => {
  const f = fixture(t, 1, 3); [36, 1, 19, 2, 11].forEach(f.call);
  assert.equal(f.room.phase, 'finished'); assert.deepEqual(f.room.winners, ['team-1']);
  assert.equal(f.room.roundNumber, 1);
});

test('only owned covered claims from the current round count, and the selected condition is required', t => {
  const f = fixture(t);
  const cover = (number, extra) => Object.assign(f.room.cells.find(c => c.number === number), { isCovered: true, teamId: 'team-1', claimedRound: 1, ...extra });
  cover(36, {}); cover(19, {}); cover(11, { teamId: 'team-2' }); cover(12, { claimedRound: 0 });
  cover(13, { isCovered: false }); cover(20, { claimedRound: undefined });
  assert.equal(roundNumberSum(f.room, 'team-1'), 55);
  cover(11, {}); assert.equal(hasHiddenVictory(f.room, 'team-1'), true);
  f.room.hiddenGoals.choices['team-1'] = 'anticipate-opponent';
  assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
});

test('undo restores the total before the winning claim and removes its round metadata', t => {
  const f = fixture(t); [36, 1, 19, 2, 11].forEach(f.call);
  f.act('undo', { revision: f.room.revision });
  assert.equal(f.room.phase, 'playing'); assert.deepEqual(f.room.winners, []);
  assert.equal(roundNumberSum(f.room, 'team-1'), 55);
  assert.equal(f.room.cells.find(c => c.number === 11).claimedRound, undefined);
  f.call(11); assert.equal(f.room.phase, 'finished');
});

test('saved totals remain private to captains and host and reset with a new game', t => {
  const f = fixture(t); f.call(36);
  const saved = structuredClone(f.room); game.migrate(saved);
  assert.deepEqual(game.snapshot(saved, { isOnline: () => true }, 'c1').hiddenGoal.progress, { current: 0, target: 1 });
  assert.deepEqual(f.snapshot('host').hostHiddenGoals[0].progress, { current: 0, target: 1 });
  assert.equal(f.snapshot('a1').hiddenGoal, undefined);
  assert.deepEqual(f.snapshot('c2').hiddenGoal.progress, { current: 0, target: 1 });
  f.act('reset'); assert.equal(roundNumberSum(f.room, 'team-1'), 0);
});

test('impossible 3x3 boards exclude 66 and all larger boards offer it', () => {
  for (let size = 3; size <= 9; size++) assert.equal(createOffers(size).some(c => c.id === 'round-66'), size >= 4);
});

test('migration renames saved 88 choices and offers to 66 and uses the new target', t => {
  const f = fixture(t);
  delete f.room.hiddenGoals.catalogVersion;
  f.room.hiddenGoals.choices['team-1'] = 'round-88';
  const old = f.room.hiddenGoals.offers['team-1'].find(c => c.id === 'round-66');
  Object.assign(old, { id: 'round-88', name: '88', symbol: 'double-eight', effect: '舊說明88' });
  game.migrate(f.room);
  assert.equal(f.room.hiddenGoals.choices['team-1'], 'round-66');
  const card = f.snapshot('c1').hiddenGoal.selected;
  assert.equal(card.name, '66'); assert.equal(card.symbol, 'double-six');
  assert.match(card.effect, /66/); assert.ok(!card.effect.includes('88'));
  assert.deepEqual(card.progress, { current: 0, target: 1 });
});

test('migration preserves earned conditions and updates undo history without restoring the old ID', t => {
  const f = fixture(t);
  delete f.room.hiddenGoals.catalogVersion;
  f.room.hiddenGoals.requiredCount = 3;
  f.room.hiddenGoals.choices['team-1'] = ['round-88', 'four-corners', 'quick-finish'];
  f.room.hiddenGoals.completed = { 'team-1': { 'round-88': true } };
  f.room.history.push(require('../src/games/teambingo/history').captureGameState(f.room));
  game.migrate(f.room);
  assert.deepEqual(f.room.hiddenGoals.choices['team-1'], ['round-66', 'four-corners', 'quick-finish']);
  assert.deepEqual(f.room.hiddenGoals.completed['team-1'], { 'round-66': true });
  f.act('undo', { revision: f.room.revision });
  assert.deepEqual(f.room.hiddenGoals.completed['team-1'], { 'round-66': true });
  assert.ok(!JSON.stringify(f.room.hiddenGoals).includes('round-88'));
});
