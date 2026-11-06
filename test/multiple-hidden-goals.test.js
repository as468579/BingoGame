const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { settleVictory, hasHiddenVictory } = require('../src/games/teambingo/victory');
const { remainingTime } = require('../src/games/teambingo/team-clock');
const { drawForNumber } = require('../src/games/teambingo/card-actions');

const quickGoals = ['four-corners', 'mathematician', 'quick-finish'];
const otherGoals = ['round-66', 'anticipate-opponent', 'almost-bingo'];
function fixture(t, { choose = true, goals = quickGoals } = {}) {
  let now = 0; t.mock.method(Date, 'now', () => now);
  const room = { ...game.initializeRoom(), code: 'THREE', phase: 'lobby', host: 'host', revision: 0,
    players: [{ id: 'host', teamId: null, ready: false, hand: [] },
      ...[['c1', 'team-1'], ['a', 'team-1'], ['c2', 'team-2'], ['b', 'team-2']].map(([id, teamId]) => ({ id, teamId, ready: true, hand: [] }))] };
  const act = (kind, data = {}, id = 'host') => applyGameAction(room, room.players.find(p => p.id === id), { kind, ...data }, { isOnline: () => true }, now);
  act('captain', { teamId: 'team-1', playerId: 'c1' }); act('captain', { teamId: 'team-2', playerId: 'c2' }); act('start');
  // Explicit three-condition fixtures retain coverage for larger selection counts.
  room.hiddenGoals.requiredCount = 3;
  for (const teamId of Object.keys(room.hiddenGoals.offers)) room.hiddenGoals.offers[teamId] = require('../src/games/teambingo/hidden-goal-offers').createOffers(room.size, 3);
  if (choose) {
    goals.forEach(goalId => act('hiddenGoal', { goalId }, 'c1'));
    otherGoals.forEach(goalId => act('hiddenGoal', { goalId }, 'c2'));
  }
  room.cells.forEach(c => { c.isSpecial = false; });
  const cover = (number, teamId = 'team-1', extra = {}) => Object.assign(room.cells.find(c => c.number === number), { isCovered: true, teamId, playerId: teamId === 'team-1' ? 'a' : 'b', ...extra });
  const prerequisites = () => [1, 6, 31, 36, 2, 3, 5, 7].forEach(n => cover(n));
  const snapshot = id => game.snapshot(room, { isOnline: () => true }, id);
  const budget = value => { room.teamClock.remaining['team-1'] = value; room.teamClock.activeTeamId = null; room.teamClock.startedAt = null; };
  return { room, act, cover, prerequisites, snapshot, budget, time: value => { now = value; } };
}

test('new games require three distinct confirmed choices per team before starting', t => {
  const f = fixture(t, { choose: false });
  assert.equal(f.room.hiddenGoals.requiredCount, 3);
  f.act('hiddenGoal', { goalId: 'four-corners' }, 'c1');
  assert.equal(f.room.phase, 'choosing-goal');
  assert.equal(f.snapshot('c1').hiddenGoal.selected, null);
  assert.equal(f.snapshot('c1').hiddenGoal.selections.length, 1);
  assert.equal(f.snapshot('a').goalsRemaining, 2);
  const before = structuredClone(f.room);
  assert.throws(() => f.act('hiddenGoal', { goalId: 'four-corners' }, 'c1'), /重複/);
  assert.deepEqual(f.room, before);
  quickGoals.slice(1).forEach(goalId => f.act('hiddenGoal', { goalId }, 'c1'));
  assert.equal(f.room.phase, 'choosing-goal');
  quickGoals.forEach(goalId => f.act('hiddenGoal', { goalId }, 'c2'));
  assert.equal(f.room.phase, 'playing');
  assert.deepEqual(f.room.hiddenGoals.choices['team-1'], f.room.hiddenGoals.choices['team-2']);
  assert.throws(() => f.act('hiddenGoal', { goalId: 'round-66' }, 'c1'), /不是選擇/);
});

test('a high opening clock cannot complete quick finish before the other two conditions', t => {
  const f = fixture(t);
  assert.equal(settleVictory(f.room), false); assert.equal(f.room.phase, 'playing');
  [1, 6, 31, 36].forEach(n => f.cover(n));
  assert.equal(settleVictory(f.room), false);
  assert.equal(f.room.hiddenGoals.completed['team-1']['four-corners'], true);
  assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
});

for (const [remaining, expected] of [[299999, false], [300000, false], [300001, true]]) {
  test(`quick finish checks strictly greater than five minutes at ${remaining}ms`, t => {
    const f = fixture(t); f.prerequisites(); f.budget(remaining);
    assert.equal(settleVictory(f.room), expected);
    assert.equal(f.room.phase, expected ? 'finished' : 'playing');
    assert.deepEqual(f.room.winners, expected ? ['team-1'] : []);
  });
}

test('the final ordinary condition immediately completes quick finish when time permits', t => {
  const f = fixture(t); [1, 6, 31, 36, 2, 3, 5].forEach(n => f.cover(n));
  f.budget(300001);
  f.act('call', { number: 7 }, 'a');
  assert.equal(f.room.phase, 'finished'); assert.equal(f.room.endReason, 'hidden-goal');
  assert.deepEqual(f.room.winners, ['team-1']);
});

test('running elapsed time is subtracted instead of using the stored clock budget', t => {
  const f = fixture(t); f.prerequisites();
  f.room.teamClock.remaining['team-1'] = 310000;
  f.room.teamClock.activeTeamId = 'team-1'; f.room.teamClock.startedAt = 0;
  f.time(10000);
  assert.equal(remainingTime(f.room, 'team-1'), 300000);
  assert.equal(settleVictory(f.room), false);
});

for (const correct of [true, false]) test(`time card judgment ${correct ? 'correct' : 'wrong'} can only win after a successful bonus`, t => {
  const f = fixture(t); f.prerequisites(); f.budget(181000);
  assert.equal(settleVictory(f.room), false);
  const definition = require('../src/games/teambingo/card-catalog').cards.find(c => c.id === 'team-time-plus-2m');
  const held = drawForNumber({ hand: f.room.teamHands['team-1'] ||= [] }, definition);
  f.act('cardUse', { cardId: held.id }, 'a');
  const active = f.room.activeCard;
  f.act('cardAnswer', { cardSessionId: active.id, ...(active.question.type === 'oral' ? { answered: true } : { choice: 0 }) }, 'a');
  f.time(100000);
  f.act('cardJudge', { cardSessionId: active.id, correct });
  assert.equal(remainingTime(f.room, 'team-1'), correct ? 301000 : 181000);
  assert.equal(f.room.phase, correct ? 'finished' : 'playing');
  assert.deepEqual(f.room.winners, correct ? ['team-1'] : []);
  if (correct) {
    f.act('cardFinish', { cardSessionId: active.id }, 'a');
    f.act('undo', { revision: f.room.revision });
    assert.equal(f.room.phase, 'playing'); assert.deepEqual(f.room.winners, []);
    assert.equal(remainingTime(f.room, 'team-1'), 181000);
    assert.equal(f.room.hiddenGoals.completed['team-1']['four-corners'], true);
  }
});

test('ordinary conditions stay achieved across rounds while all three are still required', t => {
  const f = fixture(t, { goals: ['round-66', 'four-corners', 'mathematician'] });
  [36, 19, 11].forEach(n => f.cover(n, 'team-1', { claimedRound: 1 }));
  assert.equal(settleVictory(f.room), false);
  assert.equal(f.room.hiddenGoals.completed['team-1']['round-66'], true);
  f.room.roundNumber = 2;
  f.prerequisites();
  assert.equal(settleVictory(f.room), true);
  assert.deepEqual(f.room.winners, ['team-1']);
});

test('guessing correctly completes one condition rather than immediately winning all three', t => {
  const f = fixture(t, { goals: ['anticipate-opponent', 'four-corners', 'quick-finish'] });
  f.act('hiddenGoalGuess', {}, 'c1');
  f.act('hiddenGoalJudge', { guessId: f.room.hiddenGoalGuess.id, correct: true });
  assert.equal(f.room.phase, 'playing');
  assert.equal(f.room.hiddenGoals.completed['team-1']['anticipate-opponent'], true);
  assert.equal(f.snapshot('c1').hiddenGoal.canGuess, false);
  [1, 6, 31].forEach(n => f.cover(n));
  f.act('call', { number: 36 }, 'a');
  assert.deepEqual(f.room.winners, ['team-1']);
});

test('normal one-line victory is retained without completing the three hidden conditions', t => {
  const f = fixture(t); [1, 2, 3, 4, 5].forEach(n => f.cover(n));
  f.act('call', { number: 6 }, 'a');
  assert.equal(f.room.phase, 'finished'); assert.deepEqual(f.room.winners, ['team-1']);
  assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
});

test('undo restores completion flags and removes a quick-finish hidden victory', t => {
  const f = fixture(t); [1, 6, 31, 36, 2, 3, 5].forEach(n => f.cover(n));
  settleVictory(f.room); f.act('call', { number: 7 }, 'a');
  assert.equal(f.room.phase, 'finished');
  f.act('undo', { revision: f.room.revision });
  assert.equal(f.room.phase, 'playing'); assert.deepEqual(f.room.winners, []);
  assert.equal(f.room.hiddenGoals.completed['team-1']['four-corners'], true);
  assert.equal(f.room.hiddenGoals.completed['team-1']['mathematician'], undefined);
});

test('three choices and achievements survive migration privately and reset for a new game', t => {
  const f = fixture(t); [1, 6, 31, 36].forEach(n => f.cover(n)); settleVictory(f.room);
  const saved = structuredClone(f.room); game.migrate(saved);
  const captain = game.snapshot(saved, { isOnline: () => true }, 'c1');
  assert.equal(captain.hiddenGoal.selections.length, 3);
  assert.equal(captain.hiddenGoal.selections.find(c => c.id === 'four-corners').completed, true);
  assert.equal(f.snapshot('host').hostHiddenGoals[0].selections.length, 3);
  assert.equal(f.snapshot('a').hiddenGoal, undefined);
  assert.ok(f.snapshot('c2').hiddenGoal.selections.every(c => c.id !== 'quick-finish'));
  f.act('reset'); assert.equal(f.room.hiddenGoals, null);
  f.room.players.forEach(p => { if (p.id !== 'host') p.ready = true; }); f.act('start');
  assert.deepEqual(f.room.hiddenGoals.completed, {}); assert.equal(f.room.hiddenGoals.requiredCount, 2);
});

test('older single-choice saves retain their existing selection requirement', t => {
  const f = fixture(t);
  delete f.room.hiddenGoals.requiredCount;
  f.room.hiddenGoals.choices = { 'team-1': 'four-corners', 'team-2': 'mathematician' };
  game.migrate(f.room); [1, 6, 31, 36].forEach(n => f.cover(n));
  assert.equal(settleVictory(f.room), true); assert.deepEqual(f.room.winners, ['team-1']);
});

test('partially selected triples survive migration and only unselected options remain available', t => {
  const f = fixture(t, { choose: false });
  f.act('hiddenGoal', { goalId: 'four-corners' }, 'c1');
  const saved = structuredClone(f.room); game.migrate(saved);
  const view = game.snapshot(saved, { isOnline: () => true }, 'c1');
  assert.equal(view.hiddenGoal.requiredCount, 3); assert.equal(view.hiddenGoal.selectionComplete, false);
  assert.deepEqual(view.hiddenGoal.selections.map(c => c.id), ['four-corners']);
  assert.ok(view.hiddenGoal.options.every(c => c.id !== 'four-corners'));
  assert.equal(view.goalsRemaining, 2); assert.equal(saved.phase, 'choosing-goal');
});

test('only captains can choose individual conditions and a fourth choice cannot replace a locked triple', t => {
  const f = fixture(t, { choose: false });
  for (const id of ['a', 'host']) assert.throws(() => f.act('hiddenGoal', { goalId: 'four-corners', teamId: 'team-1' }, id), /只有該隊隊長/);
  assert.throws(() => f.act('hiddenGoal', { goalId: quickGoals }, 'c1'), /有效/);
  quickGoals.forEach(goalId => f.act('hiddenGoal', { goalId }, 'c1'));
  const before = structuredClone(f.room);
  assert.throws(() => f.act('hiddenGoal', { goalId: 'sage' }, 'c1'), /無法更換/);
  assert.deepEqual(f.room, before); assert.equal(f.room.phase, 'choosing-goal');
});

test('quick finish depends on completion rather than the position of its card in the selection order', t => {
  for (const goals of [quickGoals, ['quick-finish', 'four-corners', 'mathematician'], ['mathematician', 'quick-finish', 'four-corners']]) {
    const f = fixture(t, { goals }); f.prerequisites(); f.budget(300001);
    assert.equal(settleVictory(f.room), true); assert.deepEqual(f.room.winners, ['team-1']);
    assert.equal(f.snapshot('c1').hiddenGoal.selections.find(c => c.id === 'quick-finish').completed, true);
  }
});

test('time-card bonuses gained before the other conditions cannot trigger an early victory', t => {
  const f = fixture(t); f.budget(181000);
  const definition = require('../src/games/teambingo/card-catalog').cards.find(c => c.id === 'team-time-plus-2m');
  const held = drawForNumber({ hand: f.room.teamHands['team-1'] ||= [] }, definition);
  f.act('cardUse', { cardId: held.id }, 'a');
  const active = f.room.activeCard;
  f.act('cardAnswer', { cardSessionId: active.id, ...(active.question.type === 'oral' ? { answered: true } : { choice: 0 }) }, 'a');
  f.act('cardJudge', { cardSessionId: active.id, correct: true });
  assert.equal(remainingTime(f.room, 'team-1'), 301000);
  assert.equal(f.room.phase, 'playing'); assert.deepEqual(f.room.winners, []);
  assert.equal(f.snapshot('c1').hiddenGoal.selections.find(c => c.id === 'quick-finish').completed, false);
});

test('private selection snapshots cannot mutate saved choices or another team conditions', t => {
  const f = fixture(t), before = structuredClone(f.room.hiddenGoals);
  const view = f.snapshot('c1');
  view.hiddenGoal.selections[0].name = 'Tampered'; view.hiddenGoal.selections.pop();
  assert.deepEqual(f.room.hiddenGoals, before);
  assert.equal(f.snapshot('c2').hostHiddenGoals, undefined);
  assert.ok(f.snapshot('c2').hiddenGoal.selections.every(c => c.name !== 'Tampered'));
});
