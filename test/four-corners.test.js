const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const catalog = require('../src/games/teambingo/hidden-goal-catalog');
const { createOffers } = require('../src/games/teambingo/hidden-goal-offers');
const { beginHiddenGoals } = require('../src/games/teambingo/hidden-goals');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { countCorners, hasHiddenVictory } = require('../src/games/teambingo/victory');
const { teamLines } = require('../src/games/teambingo/prizes');
const { setGoalOffers } = require('../scripts/test-support/team-goal-setup.cjs');

const cornerIndices = size => [0, size - 1, size * (size - 1), size * size - 1];
function fixture(size = 6, choose = true) {
  const room = { ...game.initializeRoom(), code: 'CORNERS', phase: 'lobby', revision: 0, host: 'host', players: [
    { id: 'host', name: 'Host', teamId: null, ready: false, hand: [] },
    ...[['c1', 'team-1'], ['a1', 'team-1'], ['c2', 'team-2'], ['b1', 'team-2']].map(([id, teamId]) => ({ id, name: id, teamId, ready: true, hand: [] }))
  ] };
  const act = (kind, data = {}, id = 'host') => applyGameAction(room, room.players.find(player => player.id === id), { kind, ...data }, { isOnline: () => true });
  if (size !== 6) act('settings', { size, teamCount: 2, playersPerTeam: 2 });
  room.players.forEach(player => { if (player.id !== room.host) player.ready = true; });
  act('captain', { teamId: 'team-1', playerId: 'c1' }); act('captain', { teamId: 'team-2', playerId: 'c2' });
  act('start'); setGoalOffers(room, ['four-corners', 'anticipate-opponent', 'mathematician']);
  if (choose) { act('hiddenGoal', { goalId: 'four-corners' }, 'c1'); act('hiddenGoal', { goalId: 'anticipate-opponent' }, 'c2'); }
  room.cells.forEach(cell => { cell.isSpecial = false; });
  const cover = (index, teamId = 'team-1') => Object.assign(room.cells[index], { isCovered: true, teamId, playerId: teamId === 'team-1' ? 'a1' : 'b1' });
  return { room, act, cover, snapshot: viewer => game.snapshot(room, { isOnline: () => true }, viewer) };
}

test('four corners is a flag card selectable on every board size', () => {
  for (let size = 3; size <= 9; size++) {
    const f = fixture(size);
    assert.equal(f.snapshot('c1').hiddenGoal.selected.name, '四角佔領');
    assert.equal(f.snapshot('c1').hiddenGoal.selected.symbol, 'flag');
    assert.deepEqual(f.snapshot('c1').hiddenGoal.progress, { current: 0, target: 4 });
  }
});

test('every missing corner prevents victory until the fourth is occupied at every supported size', () => {
  for (let size = 3; size <= 9; size++) for (const missing of cornerIndices(size)) {
    const f = fixture(size);
    cornerIndices(size).filter(index => index !== missing).forEach(index => f.cover(index));
    assert.equal(countCorners(f.room, 'team-1'), 3); assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
    f.act('call', { number: f.room.cells[missing].number }, 'a1');
    assert.equal(countCorners(f.room, 'team-1'), 4); assert.equal(teamLines(f.room, 'team-1'), 0);
    assert.equal(f.room.phase, 'finished'); assert.deepEqual(f.room.winners, ['team-1']);
    assert.equal(f.room.endReason, 'hidden-goal');
  }
});

test('opponent or unoccupied corners and owned interior cells cannot satisfy four corners', () => {
  const f = fixture(), corners = cornerIndices(6);
  corners.slice(0, 3).forEach(index => f.cover(index));
  f.cover(corners[3], 'team-2'); f.cover(7); f.cover(14);
  assert.equal(countCorners(f.room, 'team-1'), 3); assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
  f.room.cells[corners[3]].isCovered = false;
  assert.equal(countCorners(f.room, 'team-1'), 3);
});

test('an opponent owning the four corners cannot win with a different selected condition', () => {
  const f = fixture(); cornerIndices(6).forEach(index => f.cover(index, 'team-2'));
  assert.equal(countCorners(f.room, 'team-2'), 4); assert.equal(hasHiddenVictory(f.room, 'team-2'), false);
  assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
});

test('four corners follows positions instead of corner numbers after board rearrangement', () => {
  const f = fixture(); f.room.board.push(f.room.board.shift());
  f.room.cells = f.room.board.map(number => ({ number, isCovered: false, isSpecial: false }));
  for (const number of [1, 6, 31, 36]) f.cover(f.room.cells.findIndex(cell => cell.number === number));
  assert.equal(countCorners(f.room, 'team-1'), 1);
  f.cover(0); f.cover(5);
  f.act('call', { number: f.room.cells[30].number }, 'a1');
  assert.deepEqual(f.room.winners, ['team-1']);
});

test('four-corner progress survives saves and remains private to the captain and host', () => {
  const f = fixture(); f.cover(0); f.cover(5);
  const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
  assert.deepEqual(game.snapshot(saved, { isOnline: () => true }, 'c1').hiddenGoal.progress, { current: 2, target: 4 });
  assert.deepEqual(f.snapshot('host').hostHiddenGoals[0].progress, { current: 2, target: 4 });
  assert.equal(f.snapshot('a1').hiddenGoal, undefined); assert.equal(f.snapshot('b1').hostHiddenGoals, undefined);
  f.act('reset'); assert.equal(f.room.hiddenGoals, null); assert.equal(countCorners(f.room, 'team-1'), 0);
});

test('undo restores a four-corner win to three occupied corners with the same chosen goal', () => {
  const f = fixture(); [0, 5, 30].forEach(index => f.cover(index));
  f.act('call', { number: 36 }, 'a1'); f.act('undo', { revision: f.room.revision });
  assert.equal(f.room.phase, 'playing'); assert.deepEqual(f.room.winners, []);
  assert.equal(f.room.hiddenGoals.choices['team-1'], 'four-corners');
  assert.deepEqual(f.snapshot('c1').hiddenGoal.progress, { current: 3, target: 4 });
  assert.equal(f.room.cells[35].isCovered, false);
});

test('invalid or out-of-turn corner requests cannot create progress or a hidden win', () => {
  const f = fixture(); [0, 5, 30].forEach(index => f.cover(index));
  const before = structuredClone(f.room);
  assert.throws(() => f.act('call', { number: 36 }, 'b1'), /輪到/);
  assert.throws(() => f.act('call', { number: 1 }, 'a1'), /已被佔領/);
  assert.deepEqual(f.room, before); assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
});

test('all formal conditions are offered as independent clones without placeholders at every size', () => {
  const original = structuredClone(catalog);
  for (let size = 3; size <= 9; size++) {
    const expected = catalog.filter(card => !card.id.startsWith('pending-') && size >= (card.minBoardSize || 3) && 2 >= (card.minRequiredCount || 1)).map(card => card.id);
    const first = createOffers(size), second = createOffers(size);
    assert.deepEqual(first.map(card => card.id), expected);
    assert.equal(new Set(first.map(card => card.id)).size, expected.length);
    first[0].name = 'Changed';
    assert.deepEqual(catalog, original);
    assert.ok(second.every(card => card.name !== 'Changed'));
  }
});

test('teams may independently select the same condition from the full catalog', () => {
  const f = fixture(6, false);
  beginHiddenGoals(f.room);
  f.room.hiddenGoals.requiredCount = 1;
  assert.notEqual(f.room.hiddenGoals.offers['team-1'], f.room.hiddenGoals.offers['team-2']);
  f.act('hiddenGoal', { goalId: 'four-corners' }, 'c1');
  f.act('hiddenGoal', { goalId: 'four-corners' }, 'c2');
  assert.equal(f.room.phase, 'playing');
  assert.deepEqual(f.room.hiddenGoals.choices, { 'team-1': 'four-corners', 'team-2': 'four-corners' });
});

test('invalid conditions are rejected and migration expands old unselected offers while preserving selections', () => {
  const f = fixture(6, false);
  assert.throws(() => f.act('hiddenGoal', { goalId: 'unknown' }, 'c1'), /有效/);
  f.act('hiddenGoal', { goalId: 'four-corners' }, 'c1');
  f.room.hiddenGoals.offers['team-2'] = f.room.hiddenGoals.offers['team-2'].slice(0, 1);
  const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
  assert.equal(saved.hiddenGoals.choices['team-1'], 'four-corners');
  assert.equal(saved.hiddenGoals.offers['team-2'].length, 10);
});
