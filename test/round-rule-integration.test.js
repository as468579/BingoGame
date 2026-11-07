const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { startTurn } = require('../src/games/teambingo/turns');
const { createOffers } = require('../src/games/teambingo/hidden-goal-offers');
const { initializeTeamClock, syncTeamClock, expireTeamClock } = require('../src/games/teambingo/team-clock');
const { roundNumberSum, goalCompleted, hasHiddenVictory } = require('../src/games/teambingo/victory');
const { drawForNumber } = require('../src/games/teambingo/card-actions');
function fixture(t) {
  let now = 0; t.mock.method(Date, 'now', () => now);
  const room = { ...game.initializeRoom(), code: 'ROUND-RULES', host: 'host', phase: 'playing', revision: 0,
    players: [['host', null], ['c1', 'team-1'], ['a1', 'team-1'], ['a2', 'team-1'], ['a3', 'team-1'], ['c2', 'team-2'], ['b1', 'team-2'], ['b2', 'team-2']]
      .map(([id, teamId]) => ({ id, name: id, teamId, hand: [] })), captains: { 'team-1': 'c1', 'team-2': 'c2' },
    hiddenGoals: { catalogVersion: 3, requiredCount: 2, choices: { 'team-1': ['anticipate-opponent', 'sage'], 'team-2': ['round-44', 'sage'] },
      offers: { 'team-1': createOffers(6), 'team-2': createOffers(6) }, completed: {}, achieved: {}, guessRounds: {} } };
  room.cells.forEach(cell => { cell.isSpecial = false; });
  startTurn(room); initializeTeamClock(room, now);
  const act = (kind, data = {}, id = 'host') => applyGameAction(room, room.players.find(p => p.id === id), { kind, ...data }, { isOnline: () => false }, now);
  const snapshot = id => game.snapshot(room, { isOnline: () => true }, id);
  return { room, act, snapshot, time: value => { now = value; } };
}
test('smaller-team final action shares the same boundary for totals, guess limits, reports, notices and undo', t => {
  const f = fixture(t);
  f.act('hiddenGoalGuess', {}, 'c1'); f.act('hiddenGoalJudge', { guessId: f.room.hiddenGoalGuess.id, correct: false });
  for (const [actor, number] of [['a1', 1], ['b1', 10], ['a2', 2], ['b2', 14], ['a3', 3]]) f.act('call', { number }, actor);
  assert.deepEqual(f.room.roundActionCounts, { 'team-1': 3, 'team-2': 2 });
  assert.equal(f.room.roundNumber, 1); assert.equal(roundNumberSum(f.room, 'team-2'), 24);
  assert.equal(f.snapshot('c1').hiddenGoal.canGuess, false);
  assert.equal(f.snapshot('a1').teams[1].hiddenProgress.conditions[0].percentage, 0);
  assert.equal(f.room.lastRoundEnd, undefined);
  f.act('call', { number: 20 }, 'b1');
  assert.equal(f.room.roundNumber, 2); assert.equal(roundNumberSum(f.room, 'team-2'), 0);
  assert.equal(goalCompleted(f.room, 'team-2', 'round-44'), true);
  assert.equal(hasHiddenVictory(f.room, 'team-2'), false, 'Other selected goals remain required');
  assert.equal(f.snapshot('c1').hiddenGoal.canGuess, true);
  const event = f.room.lastRoundEnd;
  for (const viewer of ['host', 'c1', 'a1', 'c2', 'b1']) {
    const snapshot = f.snapshot(viewer);
    assert.equal(snapshot.teams[1].hiddenProgress.round, 1);
    assert.equal(snapshot.teams[1].hiddenProgress.conditions[0].percentage, 100);
    assert.deepEqual(snapshot.roundEnd, event);
  }
  f.act('undo', { revision: 0 });
  assert.equal(f.room.roundNumber, 1); assert.equal(roundNumberSum(f.room, 'team-2'), 24);
  assert.equal(goalCompleted(f.room, 'team-2', 'round-44'), false);
  assert.equal(f.snapshot('c1').hiddenGoal.canGuess, false);
  assert.equal(f.snapshot('a1').teams[1].hiddenProgress.conditions[0].percentage, 0);
  assert.deepEqual(f.room.roundActionCounts, { 'team-1': 3, 'team-2': 2 });
  f.act('call', { number: 20 }, 'b1'); assert.equal(f.room.roundNumber, 2);
  assert.notEqual(f.room.lastRoundEnd.id, event.id);
});
test('card completion, skips and overtime count once; hints, guesses and introductions do not count', t => {
  const f = fixture(t);
  const definition = require('../src/games/teambingo/card-catalog').cards.find(card => card.id === 'team-time-plus-2m');
  const held = drawForNumber({ hand: f.room.teamHands['team-1'] ||= [] }, definition);
  f.act('cardUse', { cardId: held.id }, 'a1'); const card = f.room.activeCard;
  assert.deepEqual(f.room.roundActionCounts, {});
  f.act('cardAnswer', { cardSessionId: card.id, ...(card.question.type === 'oral' ? { answered: true } : { choice: 0 }) }, 'a1');
  f.act('cardJudge', { cardSessionId: card.id, correct: false });
  assert.deepEqual(f.room.roundActionCounts, {});
  f.act('cardFinish', { cardSessionId: card.id }, 'a1');
  assert.deepEqual(f.room.roundActionCounts, { 'team-1': 1 });
  assert.throws(() => f.act('cardFinish', { cardSessionId: card.id }, 'a1'), /已結束/);
  f.act('skip'); // B1
  const counts = structuredClone(f.room.roundActionCounts);
  f.act('captainHint', {}, 'c1'); f.act('endHint', { hintId: f.room.hint.id }, 'c1');
  f.act('hiddenGoalGuess', {}, 'c1'); f.act('hiddenGoalJudge', { guessId: f.room.hiddenGoalGuess.id, correct: false });
  f.act('introduction', { open: true, page: 0 }); f.act('introduction', { open: false, sessionId: f.room.introduction.id });
  assert.deepEqual(f.room.roundActionCounts, counts);
  f.act('skip'); // A2
  f.act('call', { number: 5 }, 'b2');
  f.room.teamClock.remaining['team-1'] = 0; syncTeamClock(f.room, 0);
  f.time(3000); assert.equal(expireTeamClock(f.room, 3000), true); // A3 overtime expires
  assert.equal(f.room.turn, 'b1'); assert.equal(f.room.roundNumber, 1);
  assert.deepEqual(f.room.roundActionCounts, { 'team-1': 3, 'team-2': 2 });
  f.act('skip'); assert.equal(f.room.roundNumber, 2); assert.deepEqual(f.room.roundActionCounts, {});
});
