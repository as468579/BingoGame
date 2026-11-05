const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { questions, chooseQuestion } = require('../src/games/teambingo/question-bank');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { drawForNumber } = require('../src/games/teambingo/card-actions');
const { initializeTeamClock } = require('../src/games/teambingo/team-clock');
const fixtureCards = require('../src/games/teambingo/card-catalog').cards;
const configuredFixtureQuestions = questions.slice();
const { separateHost, hostAction } = require('../scripts/test-support/team-goal-setup.cjs');

test('real gift cards with difficulty arrays still follow unrestricted draws and next-question rules', t => {
  const definitions = fixtureCards.filter(card => Array.isArray(card.questionDifficulty));
  assert.equal(definitions.length, 2);
  for (const definition of definitions) {
    const f = fixture(t);
    const hard = configuredFixtureQuestions.filter(question => question.difficulty === '困難').slice(0, 2);
    questions.splice(0, questions.length, ...hard);
    const held = drawForNumber({ hand: f.room.teamHands['team-1'] ||= [] }, definition);
    f.act('cardUse', { cardId: held.id });
    const previous = structuredClone(f.room.activeCard);
    assert.equal(previous.question.difficulty, '困難'); assert.equal(previous.answerDeadlineAt, 30000);
    f.act('cardNextQuestion', { cardSessionId: previous.id }, 'a');
    assert.notEqual(f.room.activeCard.id, previous.id);
    assert.notEqual(f.room.activeCard.questionId, previous.questionId);
    assert.equal(f.room.activeCard.question.difficulty, '困難');
    assert.equal(f.room.activeCard.answerDeadlineAt, 30000);
    const snapshot = game.snapshot(f.room, { isOnline: () => true }, 'a');
    assert.equal(snapshot.activeCard.card.questionDifficulty, undefined);
  }
});

function fixture(t) {
  t.after(() => { questions.splice(0, questions.length, ...configuredFixtureQuestions); });
  questions.splice(0, questions.length, ...configuredFixtureQuestions.filter(question => question.difficulty === '簡單' && question.type === 'multiple-choice'));
  let now = 0; t.mock.method(Date, 'now', () => now);
  const room = { ...game.initializeRoom(), code: 'UNIQUE', gameType: 'teambingo', phase: 'playing', turn: 'a', host: 'a', revision: 0,
    players: [{ id: 'a', name: 'A', teamId: 'team-1', hand: [] }, { id: 'b', name: 'B', teamId: 'team-2', hand: [] }] };
  separateHost(room);
  initializeTeamClock(room, 0);
  const act = (kind, data = {}, playerId = room.turn) => applyGameAction(room, hostAction(room, room.players.find(player => player.id === playerId), kind), { kind, ...data }, { isOnline: () => true }, now);
  const give = () => {
    const player = room.players.find(member => member.id === room.turn);
    return drawForNumber({ hand: room.teamHands[player.teamId] ||= [] });
  };
  const use = () => { const card = give(); act('cardUse', { cardId: card.id }); return card; };
  const finish = outcome => {
    const active = room.activeCard, cardSessionId = active.id;
    if (outcome === 'timeout') { now = active.answerDeadlineAt; game.tick(room, now); }
    if (outcome === 'wrong') act('cardAnswer', { cardSessionId, choice: 0 }, active.playerId);
    if (outcome !== 'abort') act('cardJudge', { cardSessionId, correct: false }, 'a');
    act('cardFinish', { cardSessionId }, 'a');
  };
  return { room, act, give, use, finish, time: value => { now = value; } };
}

test('every card type ignores its configured difficulty and can draw all question levels', t => {
  const original = questions.slice();
  const originalCards = fixtureCards.slice();
  t.after(() => { questions.splice(0, questions.length, ...original); fixtureCards.splice(0, fixtureCards.length, ...originalCards); });
  const definitions = ['簡單', '普通', '困難'].map((difficulty, index) => ({ ...originalCards[0], id: `test-card-${index}`, questionDifficulty: difficulty }));
  fixtureCards.splice(0, fixtureCards.length, ...definitions);
  for (const definition of definitions) {
  for (const [difficulty, type, duration] of [['簡單', 'multiple-choice', 10000], ['普通', 'oral', 20000], ['困難', 'multiple-choice', 30000]]) {
    const question = original.find(candidate => candidate.difficulty === difficulty && candidate.type === type);
    questions.splice(0, questions.length, question);
    const room = { ...game.initializeRoom(), code: 'ANY', phase: 'playing', host: 'manager', turn: 'owner', players: [{ id: 'owner', teamId: 'team-1', hand: [] }] };
    const held = drawForNumber({ hand: room.teamHands['team-1'] ||= [] }, definition);
    applyGameAction(room, room.players[0], { kind: 'cardUse', cardId: held.id }, { isOnline: () => true }, 5000);
    assert.equal(room.activeCard.questionId, question.id);
    assert.equal(room.activeCard.question.difficulty, difficulty);
    assert.equal(room.activeCard.answerDeadlineAt, 5000 + duration);
    assert.equal(room.activeCard.question.type, type);
    assert.deepEqual(room.usedQuestionIds, [question.id]);
  }
  }
});

test('next question also ignores the difficulty configured on a different card type', t => {
  const f = fixture(t);
  const definition = { ...fixtureCards[0], id: 'other-card-type', questionDifficulty: '簡單' };
  fixtureCards.push(definition); t.after(() => { fixtureCards.splice(fixtureCards.indexOf(definition), 1); });
  const held = drawForNumber({ hand: f.room.teamHands['team-1'] ||= [] }, definition);
  f.act('cardUse', { cardId: held.id });
  const first = f.room.activeCard;
  const hard = configuredFixtureQuestions.find(question => question.difficulty === '困難');
  questions.splice(0, questions.length, hard);
  f.time(7000); f.act('cardNextQuestion', { cardSessionId: first.id }, 'a');
  assert.equal(f.room.activeCard.cardId, definition.id);
  assert.equal(f.room.activeCard.questionId, hard.id);
  assert.equal(f.room.activeCard.answerDeadlineAt, 37000);
  assert.equal(f.room.usedQuestionIds.length, 2);
});

test('question selection excludes used IDs without changing the bank or falling back to another difficulty', () => {
  const easy = questions.filter(question => question.enabled && question.difficulty === '簡單');
  const used = easy.slice(0, -1).map(question => question.id), before = structuredClone(questions);
  assert.equal(chooseQuestion(bound => { assert.equal(bound, 1); return 0; }, questions, '簡單', used).id, easy.at(-1).id);
  assert.throws(() => chooseQuestion(() => assert.fail('randomness must not run'), questions, '簡單', easy.map(question => question.id)), /尚未出過/);
  assert.deepEqual(questions, before);
});

test('all teams share unique question draws even after wrong answers, timeout and host abortion', t => {
  const f = fixture(t), seen = new Set(), owners = new Set();
  const count = questions.filter(question => question.enabled && question.difficulty === '簡單').length;
  for (let index = 0; index < count; index++) {
    f.use(); const active = f.room.activeCard;
    assert.equal(seen.has(active.questionId), false);
    seen.add(active.questionId); owners.add(active.playerId);
    f.finish(['wrong', 'timeout', 'abort'][index % 3]);
  }
  assert.equal(owners.size, 2); assert.equal(seen.size, count);
  assert.equal(f.room.usedQuestionIds.length, count);
  assert.equal(game.snapshot(f.room, { isOnline: () => true }, 'a').usedQuestionIds, undefined);
});

test('exhaustion preserves the card, turn, history and game state without serving an old question', t => {
  const f = fixture(t);
  f.room.usedQuestionIds = questions.filter(question => question.difficulty === '簡單').map(question => question.id);
  const card = f.give(), before = structuredClone(f.room);
  assert.throws(() => f.act('cardUse', { cardId: card.id }), /尚未出過/);
  assert.deepEqual(f.room, before);
  assert.equal(f.room.teamHands['team-1'][0].id, card.id);
  assert.equal(f.room.activeCard, undefined);
});

test('save migration and undo retain seen questions while returning the card for a different question', t => {
  const f = fixture(t), card = f.use(), questionId = f.room.activeCard.questionId;
  f.finish('wrong');
  const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
  assert.deepEqual(saved.usedQuestionIds, [questionId]);
  f.act('undo', { revision: f.room.revision }, 'a');
  assert.equal(f.room.turn, 'a'); assert.deepEqual(f.room.usedQuestionIds, [questionId]);
  assert.equal(f.room.teamHands['team-1'][0].id, card.id);
  f.act('cardUse', { cardId: card.id });
  assert.notEqual(f.room.activeCard.questionId, questionId);
});

test('a new game clears used questions and separate rooms have independent records', t => {
  const f = fixture(t); f.use(); f.finish('abort');
  const other = game.initializeRoom();
  assert.deepEqual(other.usedQuestionIds, []); assert.equal(f.room.usedQuestionIds.length, 1);
  f.act('reset', {}, 'a');
  assert.deepEqual(f.room.usedQuestionIds, []); assert.equal(f.room.phase, 'lobby');
  assert.notEqual(f.room.usedQuestionIds, other.usedQuestionIds);
});

test('old saves retain known active and historical question IDs without changing their deadline', t => {
  const f = fixture(t); f.use();
  const id = f.room.activeCard.questionId, deadline = f.room.activeCard.answerDeadlineAt;
  delete f.room.usedQuestionIds;
  f.room.history.push({ activeCard: { questionId: 'previously-seen' }, teamHands: {} });
  game.migrate(f.room);
  assert.deepEqual(new Set(f.room.usedQuestionIds), new Set([id, 'previously-seen']));
  assert.equal(f.room.activeCard.answerDeadlineAt, deadline);
  const before = structuredClone(f.room); game.migrate(f.room); assert.deepEqual(f.room, before);
});

test('only the host can replace a question with a fresh deadline without consuming another card or turn', t => {
  const f = fixture(t); f.use();
  const original = structuredClone(f.room.activeCard), before = structuredClone(f.room);
  assert.throws(() => f.act('cardNextQuestion', { cardSessionId: original.id }, 'b'), /只有房主/);
  assert.deepEqual(f.room, before);
  f.time(9000); f.act('cardNextQuestion', { cardSessionId: original.id }, 'a');
  const next = f.room.activeCard;
  assert.notEqual(next.id, original.id); assert.notEqual(next.questionId, original.questionId);
  assert.equal(next.answerDeadlineAt, 19000); assert.equal(next.stage, 'question');
  assert.equal(f.room.turn, before.turn); assert.deepEqual(f.room.teamHands, before.teamHands);
  assert.equal(f.room.history.length, before.history.length);
  assert.deepEqual(new Set(f.room.usedQuestionIds), new Set([original.questionId, next.questionId]));
  assert.equal(f.room.teamClock.activeTeamId, null);
  assert.throws(() => f.act('cardAnswer', { cardSessionId: original.id, choice: 0 }), /已結束/);
  for (const player of f.room.players) {
    const active = game.snapshot(f.room, { isOnline: () => true }, player.id).activeCard;
    assert.equal(active.id, next.id); assert.equal(active.answerRemainingMs, 10000);
  }
});

test('replacing a submitted or expired question clears old answer state and persists the new deadline', t => {
  for (const stage of ['submitted', 'expired']) {
    const f = fixture(t); f.use(); const id = f.room.activeCard.id;
    if (stage === 'submitted') f.act('cardAnswer', { cardSessionId: id, choice: 0 });
    else { f.time(10000); game.tick(f.room, 10000); }
    f.time(15000); f.act('cardNextQuestion', { cardSessionId: id }, 'a');
    const active = f.room.activeCard;
    assert.equal(active.stage, 'question'); assert.equal(active.answerDeadlineAt, 25000);
    for (const field of ['choice', 'answered', 'timedOut', 'correct', 'effectApplied']) assert.equal(active[field], undefined);
    assert.equal(game.snapshot(f.room, { isOnline: () => true }, 'a').activeCard.referenceAnswer, undefined);
    const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
    assert.equal(saved.activeCard.answerDeadlineAt, 25000);
    assert.deepEqual(saved.usedQuestionIds, f.room.usedQuestionIds);
  }
});

test('next-question exhaustion and already judged answers leave the current question unchanged', t => {
  const f = fixture(t); f.use(); const id = f.room.activeCard.id;
  f.room.usedQuestionIds = questions.filter(question => question.difficulty === '簡單').map(question => question.id);
  let before = structuredClone(f.room);
  assert.throws(() => f.act('cardNextQuestion', { cardSessionId: id }, 'a'), /尚未出過/);
  assert.deepEqual(f.room, before);
  f.act('cardAnswer', { cardSessionId: id, choice: 0 });
  f.act('cardJudge', { cardSessionId: id, correct: false }, 'a');
  before = structuredClone(f.room);
  assert.throws(() => f.act('cardNextQuestion', { cardSessionId: id }, 'a'), /答案已判定/);
  assert.deepEqual(f.room, before);
});
