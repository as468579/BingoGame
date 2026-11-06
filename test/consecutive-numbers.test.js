const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { drawForNumber } = require('../src/games/teambingo/card-actions');
const { settleVictory, hasHiddenVictory, ascendingNumberStreak } = require('../src/games/teambingo/victory');

function fixture(t) {
  t.mock.method(Date, 'now', () => 0);
  const room = { ...game.initializeRoom(), code: 'ORDERED', phase: 'lobby', revision: 0, host: 'host',
    players: [{ id: 'host', teamId: null, hand: [] }, ...[['c1', 'team-1'], ['a', 'team-1'], ['c2', 'team-2'], ['b', 'team-2']]
      .map(([id, teamId]) => ({ id, teamId, ready: true, hand: [] }))] };
  const act = (kind, data = {}, id = 'host') => applyGameAction(room, room.players.find(p => p.id === id), { kind, ...data }, { isOnline: () => true }, 0);
  act('captain', { teamId: 'team-1', playerId: 'c1' }); act('captain', { teamId: 'team-2', playerId: 'c2' }); act('start');
  // Explicit three-condition fixtures retain coverage for larger selection counts.
  room.hiddenGoals.requiredCount = 3;
  for (const teamId of Object.keys(room.hiddenGoals.offers)) room.hiddenGoals.offers[teamId] = require('../src/games/teambingo/hidden-goal-offers').createOffers(room.size, 3);
  for (const captain of ['c1', 'c2']) for (const goalId of ['consecutive-numbers', 'four-corners', 'quick-finish']) act('hiddenGoal', { goalId }, captain);
  room.cells.forEach(c => { c.isSpecial = false; });
  const snapshot = id => game.snapshot(room, { isOnline: () => true }, id);
  const coverCorners = () => [1, 6, 31, 36].forEach(number => Object.assign(room.cells.find(c => c.number === number), { isCovered: true, teamId: 'team-1', playerId: 'a' }));
  const begin = (id = room.turn) => {
    const player = room.players.find(p => p.id === id);
    const definition = require('../src/games/teambingo/card-catalog').cards.find(c => c.id === 'team-snow-crystals-20');
    const held = drawForNumber({ hand: room.teamHands[player.teamId] ||= [] }, definition);
    act('cardUse', { cardId: held.id }, id);
    return room.activeCard.id;
  };
  const submit = (id = room.activeCard.playerId) => act('cardAnswer', { cardSessionId: room.activeCard.id, ...(room.activeCard.question.type === 'oral' ? { answered: true } : { choice: 0 }) }, id);
  const answer = correct => {
    const id = room.turn, cardSessionId = begin(id); submit(id);
    act('cardJudge', { cardSessionId, correct });
    act('cardFinish', { cardSessionId }, id);
  };
  return { room, act, snapshot, coverCorners, begin, submit, answer };
}

test('ordered-number goal has a four-number private progress target', t => {
  const f = fixture(t), card = f.snapshot('c1').hiddenGoal.selections.find(c => c.id === 'consecutive-numbers');
  assert.equal(card.name, '強迫症'); assert.equal(card.symbol, 'ordered-numbers');
  assert.deepEqual(card.progress, { current: 0, target: 4 });
  assert.equal(f.snapshot('a').hiddenGoal, undefined);
});

test('ascending consecutive numbers across rounds and opposing turns complete the condition', t => {
  const f = fixture(t); f.coverCorners();
  for (const [number, actor] of [[8, 'a'], [20, 'b'], [9, 'a'], [21, 'b']]) f.act('call', { number }, actor);
  assert.equal(f.room.roundNumber, 3); assert.equal(ascendingNumberStreak(f.room, 'team-1'), 2);
  assert.equal(f.room.phase, 'playing');
  f.act('call', { number: 10 }, 'a');
  assert.equal(f.room.phase, 'playing');
  assert.deepEqual(f.snapshot('c1').hiddenGoal.selections.find(c => c.id === 'consecutive-numbers').progress, { current: 3, target: 4 });
  f.act('call', { number: 22 }, 'b'); f.act('call', { number: 11 }, 'a');
  assert.equal(f.room.phase, 'finished'); assert.deepEqual(f.room.winners, ['team-1']);
});

test('the sequence follows team claims across different teammates', t => {
  const f = fixture(t); f.act('call', { number: 8 }, 'a'); f.act('call', { number: 20 }, 'b');
  f.room.players.push({ id: 'a2', teamId: 'team-1', hand: [], ready: true }); f.room.turn = 'a2';
  f.act('call', { number: 9 }, 'a2');
  assert.equal(ascendingNumberStreak(f.room, 'team-1'), 2);
});

test('descending, skipped or wrapped numbers restart the streak instead of being sorted', t => {
  const f = fixture(t);
  for (const [numbers, expected] of [[[7, 6, 5], 1], [[4, 6, 8], 1], [[4, 5, 9, 10], 2], [[9, 10, 11], 3], [[35, 36, 1], 1]]) {
    f.room.cells.forEach(c => { c.isCovered = false; });
    f.room.called = numbers;
    for (const n of numbers) Object.assign(f.room.cells.find(c => c.number === n), { isCovered: true, teamId: 'team-1' });
    assert.equal(ascendingNumberStreak(f.room, 'team-1'), expected);
  }
});

test('using an effect card between number claims does not interrupt the number sequence', t => {
  const f = fixture(t); f.act('call', { number: 8 }, 'a'); f.act('call', { number: 20 }, 'b');
  f.answer(false); assert.equal(ascendingNumberStreak(f.room, 'team-1'), 1);
  f.act('call', { number: 21 }, 'b'); f.act('call', { number: 9 }, 'a');
  f.act('call', { number: 22 }, 'b'); f.act('call', { number: 10 }, 'a');
  f.act('call', { number: 23 }, 'b'); f.act('call', { number: 11 }, 'a');
  assert.equal(f.room.hiddenGoals.completed['team-1']['consecutive-numbers'], true);
  assert.equal(f.room.phase, 'playing');
});

test('once reached the condition remains achieved after later nonconsecutive claims', t => {
  const f = fixture(t);
  for (const [n, actor] of [[8, 'a'], [20, 'b'], [9, 'a'], [21, 'b'], [10, 'a'], [22, 'b'], [11, 'a'], [23, 'b'], [15, 'a']]) f.act('call', { number: n }, actor);
  assert.equal(ascendingNumberStreak(f.room, 'team-1'), 1);
  assert.equal(f.snapshot('c1').hiddenGoal.selections.find(c => c.id === 'consecutive-numbers').completed, true);
  assert.equal(f.room.phase, 'playing');
});

test('rearranged board positions do not change number order and uncovered claims are excluded', t => {
  const f = fixture(t); f.room.cells.reverse(); f.room.called = [8, 9, 10];
  for (const n of f.room.called) Object.assign(f.room.cells.find(c => c.number === n), { isCovered: true, teamId: 'team-1' });
  assert.equal(ascendingNumberStreak(f.room, 'team-1'), 3);
  f.room.cells.find(c => c.number === 9).isCovered = false;
  assert.equal(ascendingNumberStreak(f.room, 'team-1'), 1);
});

test('undo retracts the last consecutive claim and its resulting victory', t => {
  const f = fixture(t); f.coverCorners();
  for (const [n, actor] of [[8, 'a'], [20, 'b'], [9, 'a'], [21, 'b'], [10, 'a'], [22, 'b'], [11, 'a']]) f.act('call', { number: n }, actor);
  f.act('undo', { revision: f.room.revision });
  assert.equal(f.room.phase, 'playing'); assert.deepEqual(f.room.winners, []);
  assert.equal(ascendingNumberStreak(f.room, 'team-1'), 3);
  assert.equal(f.room.hiddenGoals.completed['team-1']['consecutive-numbers'], undefined);
});

test('saved sequence progress remains private across migration and resets on restart', t => {
  const f = fixture(t); f.act('call', { number: 8 }, 'a'); f.act('call', { number: 20 }, 'b'); f.act('call', { number: 9 }, 'a');
  const saved = structuredClone(f.room); game.migrate(saved);
  assert.equal(ascendingNumberStreak(saved, 'team-1'), 2);
  const own = game.snapshot(saved, { isOnline: () => true }, 'c1').hiddenGoal.selections.find(c => c.id === 'consecutive-numbers');
  assert.deepEqual(own.progress, { current: 2, target: 4 });
  assert.equal(f.snapshot('a').hiddenGoal, undefined);
  assert.deepEqual(f.snapshot('host').hostHiddenGoals[0].selections.find(c => c.id === 'consecutive-numbers').progress, own.progress);
  f.act('reset'); assert.equal(ascendingNumberStreak(f.room, 'team-1'), 0);
});

test('an unselected sequence never provides a hidden win and invalid calls leave progress unchanged', t => {
  const f = fixture(t); f.room.called = [8, 9, 10, 11];
  for (const n of f.room.called) Object.assign(f.room.cells.find(c => c.number === n), { isCovered: true, teamId: 'team-1' });
  f.coverCorners(); f.room.hiddenGoals.choices['team-1'] = ['sage', 'four-corners', 'quick-finish'];
  assert.equal(settleVictory(f.room), false);
  const before = structuredClone(f.room);
  assert.throws(() => f.act('call', { number: 11 }, 'b'), /輪到/);
  assert.throws(() => f.act('call', { number: 10 }, 'a'), /已被佔領/);
  assert.deepEqual(f.room, before); assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
});
