const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { drawForNumber } = require('../src/games/teambingo/card-actions');
const { settleVictory, hasHiddenVictory } = require('../src/games/teambingo/victory');

function fixture(t) {
  t.mock.method(Date, 'now', () => 0);
  const room = { ...game.initializeRoom(), code: 'SAGE', phase: 'lobby', revision: 0, host: 'host',
    players: [{ id: 'host', teamId: null, hand: [] }, ...[['c1', 'team-1'], ['a', 'team-1'], ['c2', 'team-2'], ['b', 'team-2']]
      .map(([id, teamId]) => ({ id, teamId, ready: true, hand: [] }))] };
  const act = (kind, data = {}, id = 'host') => applyGameAction(room, room.players.find(p => p.id === id), { kind, ...data }, { isOnline: () => true }, 0);
  act('captain', { teamId: 'team-1', playerId: 'c1' }); act('captain', { teamId: 'team-2', playerId: 'c2' }); act('start');
  // Explicit three-condition fixtures retain coverage for larger selection counts.
  room.hiddenGoals.requiredCount = 3;
  for (const teamId of Object.keys(room.hiddenGoals.offers)) room.hiddenGoals.offers[teamId] = require('../src/games/teambingo/hidden-goal-offers').createOffers(room.size, 3);
  for (const captain of ['c1', 'c2']) for (const goalId of ['sage', 'four-corners', 'quick-finish']) act('hiddenGoal', { goalId }, captain);
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

test('sage offers a book card with a private four-answer progress target', t => {
  const f = fixture(t), card = f.snapshot('c1').hiddenGoal.selections.find(c => c.id === 'sage');
  assert.equal(card.name, '智者'); assert.equal(card.symbol, 'book');
  assert.deepEqual(card.progress, { current: 0, target: 4 });
  assert.equal(f.snapshot('a').hiddenGoal, undefined);
  assert.equal(f.snapshot('a').teamCorrectAnswers, undefined);
});

test('the fourth correct judgment immediately completes sage and the three-condition victory', t => {
  const f = fixture(t); f.coverCorners();
  for (let i = 0; i < 4; i++) {
    f.answer(true);
    assert.equal(f.room.teamCorrectAnswers['team-1'], i + 1);
    if (i < 3) {
      assert.equal(f.room.phase, 'playing'); assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
      f.act('call', { number: [10, 20, 30][i] }, 'b');
    }
  }
  assert.equal(f.room.phase, 'finished'); assert.deepEqual(f.room.winners, ['team-1']);
  assert.equal(f.snapshot('c1').hiddenGoal.selections.find(c => c.id === 'sage').completed, true);
});

test('wrong judgments and opponent correct answers do not increase this team total', t => {
  const f = fixture(t); f.answer(false);
  assert.equal(f.room.teamCorrectAnswers['team-1'], undefined);
  f.answer(true);
  assert.equal(f.room.teamCorrectAnswers['team-2'], 1);
  assert.deepEqual(f.snapshot('c1').hiddenGoal.selections.find(c => c.id === 'sage').progress, { current: 0, target: 4 });
});

test('correct answers from different teammates aggregate under the same team', t => {
  const f = fixture(t); f.answer(true); f.act('call', { number: 10 }, 'b');
  f.room.players.push({ id: 'a2', teamId: 'team-1', hand: [], ready: true }); f.room.turn = 'a2';
  f.answer(true);
  assert.equal(f.room.teamCorrectAnswers['team-1'], 2);
});

test('answer submission and changing questions do not count before a correct host judgment', t => {
  const f = fixture(t); f.begin(); f.submit();
  assert.deepEqual(f.room.teamCorrectAnswers, {});
  f.act('cardNextQuestion', { cardSessionId: f.room.activeCard.id });
  assert.deepEqual(f.room.teamCorrectAnswers, {});
  f.submit(); f.act('cardJudge', { cardSessionId: f.room.activeCard.id, correct: true });
  assert.equal(f.room.teamCorrectAnswers['team-1'], 1);
});

test('duplicate judgments and finishing a card cannot count the same answer twice', t => {
  const f = fixture(t); const cardSessionId = f.begin(); f.submit();
  assert.throws(() => f.act('cardJudge', { cardSessionId, correct: true }, 'a'), /只有房主/);
  f.act('cardJudge', { cardSessionId, correct: true });
  assert.throws(() => f.act('cardJudge', { cardSessionId, correct: true }), /等待判定/);
  f.act('cardFinish', { cardSessionId }, 'a');
  assert.equal(f.room.teamCorrectAnswers['team-1'], 1);
});

test('undo restores the previous answer count and retracts a sage victory', t => {
  const f = fixture(t); f.coverCorners(); f.room.teamCorrectAnswers['team-1'] = 3;
  settleVictory(f.room); f.answer(true);
  assert.equal(f.room.phase, 'finished');
  f.act('undo', { revision: f.room.revision });
  assert.equal(f.room.phase, 'playing'); assert.deepEqual(f.room.winners, []);
  assert.equal(f.room.teamCorrectAnswers['team-1'], 3);
  assert.equal(f.room.hiddenGoals.completed['team-1'].sage, undefined);
});

test('saved answer totals and completion survive migration and reset for the next game', t => {
  const f = fixture(t); f.room.teamCorrectAnswers['team-1'] = 4; settleVictory(f.room);
  assert.equal(f.room.phase, 'playing');
  const saved = structuredClone(f.room); game.migrate(saved);
  assert.equal(saved.teamCorrectAnswers['team-1'], 4);
  assert.equal(game.snapshot(saved, { isOnline: () => true }, 'host').hostHiddenGoals[0].selections.find(c => c.id === 'sage').completed, true);
  f.act('reset'); assert.deepEqual(f.room.teamCorrectAnswers, {});
  delete saved.teamCorrectAnswers; game.migrate(saved); assert.deepEqual(saved.teamCorrectAnswers, {});
});

test('more than four correct answers qualifies only if sage was selected and other goals are met', t => {
  const f = fixture(t); f.room.teamCorrectAnswers['team-1'] = 5;
  assert.equal(settleVictory(f.room), false); f.coverCorners();
  assert.equal(settleVictory(f.room), true);
  assert.deepEqual(f.room.winners, ['team-1']);
});

test('a high answer count cannot win through sage when that condition was not selected', t => {
  const f = fixture(t); f.room.teamCorrectAnswers['team-1'] = 10; f.coverCorners();
  f.room.hiddenGoals.choices['team-1'] = ['round-66', 'four-corners', 'quick-finish'];
  assert.equal(settleVictory(f.room), false); assert.deepEqual(f.room.winners, []);
  assert.ok(f.snapshot('c1').hiddenGoal.selections.every(card => card.id !== 'sage'));
});

test('invalid host verdicts leave the answer session and totals unchanged', t => {
  const f = fixture(t); f.begin(); f.submit();
  const before = structuredClone(f.room);
  assert.throws(() => f.act('cardJudge', { cardSessionId: f.room.activeCard.id, correct: 'true' }), /正確或回答錯誤/);
  assert.deepEqual(f.room, before);
});

for (const type of ['oral', 'multiple-choice']) test(`correct host judgments count ${type} questions once`, t => {
  const f = fixture(t); const cardSessionId = f.begin();
  f.room.activeCard.question = { ...f.room.activeCard.question, type, options: ['A', 'B'] };
  f.submit(); f.act('cardJudge', { cardSessionId, correct: true });
  assert.equal(f.room.teamCorrectAnswers['team-1'], 1);
  assert.equal(f.room.activeCard.stage, 'result');
});

test('a timed-out question counts only when the host subsequently judges it correct', t => {
  const f = fixture(t); const cardSessionId = f.begin();
  Object.assign(f.room.activeCard, { timedOut: true, stage: 'review' });
  assert.equal(f.room.teamCorrectAnswers['team-1'], undefined);
  f.act('cardJudge', { cardSessionId, correct: true });
  assert.equal(f.room.teamCorrectAnswers['team-1'], 1);
});

test('undoing an older history entry without answer totals restores zero safely', t => {
  const f = fixture(t); f.answer(true);
  delete f.room.history.at(-1).teamCorrectAnswers;
  f.act('undo', { revision: f.room.revision });
  assert.deepEqual(f.room.teamCorrectAnswers, {}); assert.equal(f.room.phase, 'playing');
});
