const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { setGoalOffers } = require('../scripts/test-support/team-goal-setup.cjs');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { remainingTime } = require('../src/games/teambingo/team-clock');
const { drawForNumber } = require('../src/games/teambingo/card-actions');
const { hasHiddenVictory } = require('../src/games/teambingo/victory');

function fixture(t, counts = [1, 1], both = false) {
  let now = 0; t.mock.method(Date, 'now', () => now);
  const room = { ...game.initializeRoom(), code: 'GUESS', phase: 'lobby', host: 'host', revision: 0, playersPerTeam: 4,
    captains: { 'team-1': 'c1', 'team-2': 'c2' }, players: [{ id: 'host', name: 'Host', teamId: null, ready: false, hand: [] }] };
  for (let team = 1; team <= 2; team++) {
    room.players.push({ id: `c${team}`, name: `Captain ${team}`, teamId: `team-${team}`, ready: true, hand: [] });
    for (let i = 1; i <= counts[team - 1]; i++) room.players.push({ id: `${team === 1 ? 'a' : 'b'}${i}`, teamId: `team-${team}`, ready: true, hand: [] });
  }
  const act = (kind, data = {}, id = 'host') => applyGameAction(room, room.players.find(player => player.id === id), { kind, ...data }, { isOnline: () => true }, now);
  act('start'); setGoalOffers(room); act('hiddenGoal', { goalId: 'anticipate-opponent' }, 'c1');
  act('hiddenGoal', { goalId: both ? 'anticipate-opponent' : 'mathematician' }, 'c2');
  room.cells.forEach(cell => { cell.isSpecial = false; });
  let number = 0;
  return { room, act, play: () => act('call', { number: ++number }, room.turn), time: value => { now = value; },
    snapshot: viewer => game.snapshot(room, { isOnline: () => true }, viewer),
    wrong: () => act('hiddenGoalJudge', { guessId: room.hiddenGoalGuess.id, correct: false }) };
}

test('料敵機先 is a private selectable thinking card and only its captain can initiate a guess', t => {
  const f = fixture(t);
  const goal = f.snapshot('c1').hiddenGoal;
  assert.equal(goal.selected.name, '料敵機先'); assert.equal(goal.selected.symbol, 'thinking');
  assert.equal(goal.canGuess, true); assert.equal(goal.guessUsed, false);
  for (const id of ['host', 'a1', 'c2', 'b1']) {
    const before = structuredClone(f.room);
    assert.throws(() => f.act('hiddenGoalGuess', {}, id), /只有選擇/);
    assert.deepEqual(f.room, before);
  }
  assert.equal(f.snapshot('a1').hiddenGoal, undefined);
  assert.equal(f.snapshot('b1').hiddenGoal, undefined);
  f.act('hiddenGoalGuess', {}, 'c1');
  assert.equal(f.room.hiddenGoalGuess.round, 1);
  assert.equal(f.snapshot('c1').hiddenGoal.guessUsed, true);
});

test('captains and hosts see the updated achievement description even when saved card text is older', t => {
  const f = fixture(t), expected = require('../src/games/teambingo/hidden-goal-catalog').find(card => card.id === 'anticipate-opponent').effect;
  f.room.hiddenGoals.offers['team-1'].find(card => card.id === 'anticipate-opponent').effect = '舊版說明';
  f.room.hiddenGoals.offers['team-1'].find(card => card.id === 'anticipate-opponent').symbol = '🤔';
  const before = structuredClone(f.room);
  assert.equal(f.snapshot('c1').hiddenGoal.selected.effect, expected);
  assert.equal(f.snapshot('host').hostHiddenGoals[0].selected.effect, expected);
  assert.equal(f.snapshot('c1').hiddenGoal.selected.symbol, 'thinking');
  assert.equal(f.snapshot('host').hostHiddenGoals[0].selected.symbol, 'thinking');
  assert.equal(expected, '在對方達成前猜中其中一個未完成的隱藏勝利條件，每回合限猜一次。');
  assert.deepEqual(f.room, before);
});

test('wrong guesses resume the same player and cannot be repeated until everyone has acted', t => {
  const f = fixture(t); f.act('hiddenGoalGuess', {}, 'c1'); f.wrong();
  assert.equal(f.room.phase, 'playing'); assert.equal(f.room.turn, 'a1');
  assert.throws(() => f.act('hiddenGoalGuess', {}, 'c1'), /每回合限一次/);
  f.play(); assert.equal(f.room.roundNumber, 1);
  assert.equal(f.snapshot('c1').hiddenGoal.canGuess, false);
  f.play(); assert.equal(f.room.roundNumber, 2);
  assert.equal(f.snapshot('c1').hiddenGoal.canGuess, true);
  f.act('hiddenGoalGuess', {}, 'c1'); assert.equal(f.room.hiddenGoalGuess.round, 2);
});

test('three-versus-two rounds wait for all five members despite independently repeating smaller teams', t => {
  const f = fixture(t, [3, 2]); f.act('hiddenGoalGuess', {}, 'c1'); f.wrong();
  const order = [];
  for (let i = 0; i < 4; i++) { order.push(f.room.turn); f.play(); assert.equal(f.room.roundNumber, 1); }
  order.push(f.room.turn); f.play();
  assert.deepEqual(order, ['a1', 'b1', 'a2', 'b2', 'a3']);
  assert.equal(f.room.roundNumber, 2); assert.equal(f.room.turn, 'b1');
  assert.deepEqual(f.room.roundActedIds, []); assert.equal(f.snapshot('c1').hiddenGoal.canGuess, true);
});

test('each eligible captain has its own once-per-round allowance', t => {
  const f = fixture(t, [1, 1], true);
  f.act('hiddenGoalGuess', {}, 'c1'); f.wrong();
  assert.equal(f.snapshot('c1').hiddenGoal.canGuess, false);
  assert.equal(f.snapshot('c2').hiddenGoal.canGuess, true);
  f.act('hiddenGoalGuess', {}, 'c2'); f.wrong();
  assert.deepEqual(f.room.hiddenGoals.guessRounds, { 'team-1': 1, 'team-2': 1 });
});

test('guess review pauses action clocks and rejects gameplay until the host judges', t => {
  const f = fixture(t); f.time(5000); f.act('hiddenGoalGuess', {}, 'c1');
  assert.equal(remainingTime(f.room, 'team-1'), 475000);
  f.time(100000);
  for (const kind of ['call', 'cardUse', 'skip', 'undo', 'captainHint', 'hiddenGoalGuess']) {
    const before = structuredClone(f.room);
    assert.throws(() => f.act(kind, { number: 1 }, 'a1'), /等待房主判定/);
    assert.deepEqual(f.room, before);
  }
  assert.equal(game.tick(f.room, 100000), false); assert.equal(remainingTime(f.room, 'team-1'), 475000);
  f.wrong(); f.time(101000);
  assert.equal(remainingTime(f.room, 'team-1'), 474000); assert.equal(f.room.turn, 'a1');
});

test('only the host can judge a current guess and a correct verdict wins without a line', t => {
  const f = fixture(t); f.act('hiddenGoalGuess', {}, 'c1');
  const guessId = f.room.hiddenGoalGuess.id, before = structuredClone(f.room);
  assert.throws(() => f.act('hiddenGoalJudge', { guessId, correct: true }, 'c1'), /只有房主/);
  assert.throws(() => f.act('hiddenGoalJudge', { guessId: 'stale', correct: true }), /已結束/);
  assert.throws(() => f.act('hiddenGoalJudge', { guessId, correct: 'true' }), /判定猜測/);
  assert.deepEqual(f.room, before);
  f.act('hiddenGoalJudge', { guessId, correct: true });
  assert.equal(f.room.phase, 'finished'); assert.deepEqual(f.room.winners, ['team-1']);
  assert.equal(f.room.turn, null); assert.equal(f.room.endReason, 'hidden-goal');
  assert.equal(hasHiddenVictory(f.room, 'team-1'), true); assert.equal(f.room.called.length, 0);
  assert.throws(() => f.act('hiddenGoalJudge', { guessId, correct: true }), /已結束/);
});

test('using a card completes a member action only after review and does not renew guesses early', t => {
  const f = fixture(t); f.act('hiddenGoalGuess', {}, 'c1'); f.wrong();
  const held = drawForNumber({ hand: f.room.teamHands['team-1'] ||= [] });
  f.act('cardUse', { cardId: held.id }, 'a1');
  assert.equal(f.room.roundNumber, 1); assert.deepEqual(f.room.roundActedIds, []);
  f.act('cardFinish', { cardSessionId: f.room.activeCard.id });
  assert.deepEqual(f.room.roundActedIds, ['a1']); assert.equal(f.room.roundNumber, 1);
  f.play(); assert.equal(f.room.roundNumber, 2);
});

test('overtime teams still count toward rounds and their captain can guess during their active turn', t => {
  const f = fixture(t, [2, 1], true);
  f.room.teamClock.remaining['team-2'] = 0;
  assert.throws(() => f.act('hiddenGoalGuess', {}, 'c2'), /剩餘/);
  f.play(); assert.equal(f.room.turn, 'b1'); assert.equal(f.room.roundNumber, 1);
  f.act('hiddenGoalGuess', {}, 'c2'); f.wrong();
  f.play(); assert.equal(f.room.turn, 'a2'); assert.equal(f.room.roundNumber, 1);
  f.play(); assert.equal(f.room.roundNumber, 2); assert.equal(f.room.turn, 'b1');
});

test('save restoration retains an active guess, its paused clock and the already spent allowance', t => {
  const f = fixture(t); f.act('hiddenGoalGuess', {}, 'c1');
  const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
  assert.equal(saved.hiddenGoalGuess.id, f.room.hiddenGoalGuess.id);
  assert.equal(saved.teamClock.activeTeamId, null);
  applyGameAction(saved, saved.players[0], { kind: 'hiddenGoalJudge', guessId: saved.hiddenGoalGuess.id, correct: false }, {}, 1000);
  assert.equal(saved.hiddenGoals.guessRounds['team-1'], 1); assert.equal(saved.turn, 'a1');
  assert.equal(saved.roundNumber, 1);
});

test('undo restores round progress, a hidden win and its guess allowance; reset starts fresh', t => {
  const f = fixture(t); f.act('hiddenGoalGuess', {}, 'c1'); f.wrong();
  f.play(); f.play(); assert.equal(f.room.roundNumber, 2);
  f.act('undo', { revision: f.room.revision });
  assert.equal(f.room.roundNumber, 1); assert.deepEqual(f.room.roundActedIds, ['a1']);
  assert.equal(f.snapshot('c1').hiddenGoal.canGuess, false);
  f.act('undo', { revision: f.room.revision });
  f.act('undo', { revision: f.room.revision });
  assert.equal(f.snapshot('c1').hiddenGoal.canGuess, true);
  f.act('hiddenGoalGuess', {}, 'c1'); f.act('hiddenGoalJudge', { guessId: f.room.hiddenGoalGuess.id, correct: true });
  f.act('undo', { revision: f.room.revision });
  assert.equal(f.room.phase, 'playing'); assert.deepEqual(f.room.winners, []);
  assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
  f.act('reset'); assert.equal(f.room.hiddenGoals, null); assert.equal(f.room.hiddenGoalGuess, null);
  assert.equal(f.room.roundNumber, 1); assert.deepEqual(f.room.roundActedIds, []);
});

test('a pending guess cannot consume the other captain allowance or expose private conditions', t => {
  const f = fixture(t, [1, 1], true); f.act('hiddenGoalGuess', {}, 'c1');
  const before = structuredClone(f.room);
  assert.throws(() => f.act('hiddenGoalGuess', {}, 'c2'), /等待房主判定/);
  assert.deepEqual(f.room, before);
  assert.equal(f.room.hiddenGoals.guessRounds['team-2'], undefined);
  const viewer = f.snapshot('b1');
  assert.equal(viewer.hiddenGoal, undefined); assert.equal(viewer.hostHiddenGoals, undefined);
  assert.deepEqual(Object.keys(viewer.hiddenGoalGuess).sort(), ['captainId', 'captainName', 'id', 'round', 'teamId', 'teamName']);
  f.wrong(); assert.equal(f.snapshot('c2').hiddenGoal.canGuess, true);
});

test('questions and captain hints block guesses without spending the round allowance', t => {
  const f = fixture(t);
  const held = drawForNumber({ hand: f.room.teamHands['team-1'] ||= [] });
  f.act('cardUse', { cardId: held.id }, 'a1');
  assert.equal(f.snapshot('c1').hiddenGoal.canGuess, false);
  assert.throws(() => f.act('hiddenGoalGuess', {}, 'c1'), /卡牌作答/);
  assert.deepEqual(f.room.hiddenGoals.guessRounds, {});
  f.act('cardFinish', { cardSessionId: f.room.activeCard.id });
  f.act('captainHint', {}, 'c2');
  assert.equal(f.snapshot('c1').hiddenGoal.canGuess, false);
  assert.throws(() => f.act('hiddenGoalGuess', {}, 'c1'), /隊長提示/);
  assert.deepEqual(f.room.hiddenGoals.guessRounds, {});
});

test('one-versus-three teams cannot renew guessing by repeatedly cycling the single member', t => {
  const f = fixture(t, [1, 3]); f.act('hiddenGoalGuess', {}, 'c1'); f.wrong();
  const order = [];
  for (let i = 0; i < 5; i++) {
    order.push(f.room.turn); f.play();
    assert.equal(f.room.roundNumber, 1); assert.equal(f.snapshot('c1').hiddenGoal.canGuess, false);
  }
  order.push(f.room.turn); f.play();
  assert.deepEqual(order, ['a1', 'b1', 'a1', 'b2', 'a1', 'b3']);
  assert.equal(f.room.roundNumber, 2); assert.equal(f.snapshot('c1').hiddenGoal.canGuess, true);
});

test('a delayed previous-round verdict cannot judge the new round guess', t => {
  const f = fixture(t); f.act('hiddenGoalGuess', {}, 'c1');
  const oldId = f.room.hiddenGoalGuess.id; f.wrong(); f.play(); f.play();
  f.act('hiddenGoalGuess', {}, 'c1');
  assert.notEqual(f.room.hiddenGoalGuess.id, oldId);
  const before = structuredClone(f.room);
  assert.throws(() => f.act('hiddenGoalJudge', { guessId: oldId, correct: true }), /已結束/);
  assert.deepEqual(f.room, before);
  f.wrong(); assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
});
