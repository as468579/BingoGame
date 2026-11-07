const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { drawForNumber } = require('../src/games/teambingo/card-actions');
const { settleVictory, hasHiddenVictory } = require('../src/games/teambingo/victory');

function fixture(t) {
  t.mock.method(Date, 'now', () => 0);
  const room = { ...game.initializeRoom(), code: 'RECKLESS', phase: 'lobby', revision: 0, host: 'host',
    players: [{ id: 'host', teamId: null, hand: [] }, ...[['c1', 'team-1'], ['a', 'team-1'], ['c2', 'team-2'], ['b', 'team-2']]
      .map(([id, teamId]) => ({ id, teamId, ready: true, hand: [] }))] };
  const act = (kind, data = {}, id = 'host') => applyGameAction(room, room.players.find(p => p.id === id), { kind, ...data }, { isOnline: () => true }, 0);
  act('captain', { teamId: 'team-1', playerId: 'c1' }); act('captain', { teamId: 'team-2', playerId: 'c2' }); act('start');
  // Explicit three-condition fixtures retain coverage for larger selection counts.
  room.hiddenGoals.requiredCount = 3;
  for (const teamId of Object.keys(room.hiddenGoals.offers)) room.hiddenGoals.offers[teamId] = require('../src/games/teambingo/hidden-goal-offers').createOffers(room.size, 3);
  for (const captain of ['c1', 'c2']) for (const goalId of ['reckless', 'four-corners', 'quick-finish']) act('hiddenGoal', { goalId }, captain);
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

test('reckless is a crossed-book card with a private three-wrong-answer target', t => {
  const f = fixture(t), card = f.snapshot('c1').hiddenGoal.selections.find(c => c.id === 'reckless');
  assert.equal(card.name, '莽夫'); assert.equal(card.symbol, 'book-cross');
  assert.deepEqual(card.progress, { current: 0, target: 3 });
  assert.equal(f.snapshot('a').hiddenGoal, undefined); assert.equal(f.snapshot('a').teamWrongAnswers, undefined);
});

test('the third wrong judgment completes reckless and can complete the three-condition victory', t => {
  const f = fixture(t); f.coverCorners();
  for (let i = 0; i < 3; i++) {
    f.answer(false);
    assert.equal(f.room.teamWrongAnswers['team-1'], i + 1);
    if (i < 2) {
      assert.equal(f.room.phase, 'playing'); assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
      f.act('call', { number: [10, 20][i] }, 'b');
    }
  }
  assert.equal(f.room.phase, 'finished'); assert.deepEqual(f.room.winners, ['team-1']);
  assert.equal(f.snapshot('c1').hiddenGoal.selections.find(c => c.id === 'reckless').completed, true);
  assert.deepEqual(f.room.teamBonusRewards, {});
});

test('correct judgments and opponent wrong answers do not increase this team wrong total', t => {
  const f = fixture(t); f.answer(true);
  assert.equal(f.room.teamWrongAnswers['team-1'], undefined);
  assert.equal(f.room.teamCorrectAnswers['team-1'], 1);
  f.answer(false); assert.equal(f.room.teamWrongAnswers['team-2'], 1);
  assert.deepEqual(f.snapshot('c1').hiddenGoal.selections.find(c => c.id === 'reckless').progress, { current: 0, target: 3 });
});

test('wrong answers by different teammates accumulate in the same team total', t => {
  const f = fixture(t); f.answer(false); f.act('call', { number: 10 }, 'b');
  f.room.players.push({ id: 'a2', teamId: 'team-1', hand: [], ready: true }); f.room.turn = 'a2';
  f.answer(false); assert.equal(f.room.teamWrongAnswers['team-1'], 2);
});

test('submitting or skipping a question is not a wrong answer without a host verdict', t => {
  const f = fixture(t); f.begin(); f.submit();
  assert.deepEqual(f.room.teamWrongAnswers, {});
  f.act('cardNextQuestion', { cardSessionId: f.room.activeCard.id });
  assert.deepEqual(f.room.teamWrongAnswers, {});
  f.submit(); f.act('cardJudge', { cardSessionId: f.room.activeCard.id, correct: false });
  assert.equal(f.room.teamWrongAnswers['team-1'], 1);
});

test('only a valid host verdict counts and repeating or finishing it does not count twice', t => {
  const f = fixture(t), cardSessionId = f.begin(); f.submit();
  assert.throws(() => f.act('cardJudge', { cardSessionId, correct: false }, 'a'), /只有房主/);
  assert.throws(() => f.act('cardJudge', { cardSessionId, correct: 'false' }), /正確或回答錯誤/);
  assert.deepEqual(f.room.teamWrongAnswers, {});
  f.act('cardJudge', { cardSessionId, correct: false });
  assert.throws(() => f.act('cardJudge', { cardSessionId, correct: false }), /等待判定/);
  f.act('cardFinish', { cardSessionId }, 'a');
  assert.equal(f.room.teamWrongAnswers['team-1'], 1);
});

test('undo retracts the third wrong answer and its hidden victory', t => {
  const f = fixture(t); f.coverCorners(); f.room.teamWrongAnswers['team-1'] = 2;
  assert.deepEqual(f.snapshot('a').teams[0].hiddenProgress.conditions[0].reward, { item: '突襲券', quantity: 7 });
  settleVictory(f.room); f.answer(false); assert.equal(f.room.phase, 'finished');
  assert.ok(f.snapshot('host').teams[0].bonusRewards.some(reward => reward.item === '突襲券' && reward.quantity === 7));
  const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
  assert.deepEqual(game.snapshot(saved, { isOnline: () => true }, 'host').teams[0].bonusRewards, f.snapshot('host').teams[0].bonusRewards);
  f.act('undo', { revision: f.room.revision });
  assert.deepEqual(f.snapshot('host').teams[0].bonusRewards, []);
  assert.equal(f.room.phase, 'playing'); assert.deepEqual(f.room.winners, []);
  assert.equal(f.room.teamWrongAnswers['team-1'], 2);
  assert.equal(f.room.hiddenGoals.completed['team-1'].reckless, undefined);
});

test('wrong-answer progress persists privately across migration and resets for the next game', t => {
  const f = fixture(t); f.room.teamWrongAnswers['team-1'] = 3; settleVictory(f.room);
  const saved = structuredClone(f.room); game.migrate(saved);
  assert.equal(saved.teamWrongAnswers['team-1'], 3);
  assert.equal(game.snapshot(saved, { isOnline: () => true }, 'host').hostHiddenGoals[0].selections.find(c => c.id === 'reckless').completed, true);
  f.act('reset'); assert.deepEqual(f.room.teamWrongAnswers, {});
  delete saved.teamWrongAnswers; game.migrate(saved); assert.deepEqual(saved.teamWrongAnswers, {});
});

test('more than three wrong answers qualifies only for a team that selected reckless', t => {
  const f = fixture(t); f.room.teamWrongAnswers['team-1'] = 4; f.coverCorners();
  assert.equal(hasHiddenVictory(f.room, 'team-1'), true);
  f.room.hiddenGoals.choices['team-1'] = ['sage', 'four-corners', 'quick-finish'];
  assert.equal(settleVictory(f.room), false); assert.deepEqual(f.room.winners, []);
});

test('timeout remains uncounted until the host judges the answer wrong', t => {
  const f = fixture(t), cardSessionId = f.begin();
  Object.assign(f.room.activeCard, { stage: 'review', timedOut: true });
  assert.deepEqual(f.room.teamWrongAnswers, {});
  f.act('cardJudge', { cardSessionId, correct: false });
  assert.equal(f.room.teamWrongAnswers['team-1'], 1);
});
