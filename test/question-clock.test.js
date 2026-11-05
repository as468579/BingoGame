const { test } = require('node:test');
// Keep rule fixtures deterministic by limiting their bank; production cards allow all difficulties.
const fixtureQuestions = require('../src/games/teambingo/question-bank').questions;
const configuredFixtureQuestions = fixtureQuestions.slice();
test.beforeEach(() => { fixtureQuestions.splice(0, fixtureQuestions.length, ...configuredFixtureQuestions.filter(question => question.difficulty === '簡單' && question.type === 'multiple-choice' && Number.isInteger(question.answer))); });
test.afterEach(() => { fixtureQuestions.splice(0, fixtureQuestions.length, ...configuredFixtureQuestions); });
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { answerTimeMs, ensureQuestionDeadline, expireQuestion } = require('../src/games/teambingo/question-clock');
const { createApplication } = require('../src/app');
const { drawForNumber } = require('../src/games/teambingo/card-actions');
const { remainingTime } = require('../src/games/teambingo/team-clock');
const game = require('../src/games/teambingo');
const { prepareCaptains, completeGoalSelection, separateHost, hostAction, HOST_ACTIONS } = require('../scripts/test-support/team-goal-setup.cjs');

test('legacy questions default to normal duration once without refreshing an existing deadline', () => {
  const room = { activeCard: { stage: 'question' } };
  assert.equal(answerTimeMs(), 20000);
  ensureQuestionDeadline(room, 1000); assert.equal(room.activeCard.answerDeadlineAt, 21000);
  ensureQuestionDeadline(room, 50000); assert.equal(room.activeCard.answerDeadlineAt, 21000);
});

for (const [difficulty, duration] of [['簡單', 10000], ['普通', 20000], ['困難', 30000]]) {
  test(`${difficulty} questions receive ${duration / 1000} seconds and expire at the exact boundary`, () => {
    const room = { activeCard: { stage: 'question', question: { difficulty } } };
    assert.equal(answerTimeMs(room.activeCard.question), duration);
    ensureQuestionDeadline(room, 1000);
    assert.equal(room.activeCard.answerDeadlineAt, 1000 + duration);
    room.activeCard.question.difficulty = '普通';
    ensureQuestionDeadline(room, 9000);
    assert.equal(room.activeCard.answerDeadlineAt, 1000 + duration);
    assert.equal(expireQuestion(room, 999 + duration), false);
    assert.equal(expireQuestion(room, 1000 + duration), true);
    assert.equal(room.activeCard.stage, 'review');
    assert.equal(room.activeCard.correct, undefined);
  });
}

test('timeout at the exact deadline locks the question for host review without deciding correctness', () => {
  const room = { activeCard: { id: 'session', stage: 'question', answerDeadlineAt: 30000 } };
  assert.equal(expireQuestion(room, 29999), false);
  assert.equal(expireQuestion(room, 30000), true);
  assert.equal(room.activeCard.stage, 'review'); assert.equal(room.activeCard.timedOut, true);
  assert.equal(room.activeCard.correct, undefined); assert.equal(room.activeCard.choice, undefined);
  assert.equal(room.activeCard.id, 'session'); assert.equal(expireQuestion(room, 90000), false);
});

test('submitted answers, results and closed questions never time out retroactively', () => {
  for (const stage of ['review', 'result']) {
    const room = { activeCard: { stage, choice: 0, answerDeadlineAt: 30000 } }, before = structuredClone(room);
    assert.equal(expireQuestion(room, 90000), false); assert.deepEqual(room, before);
  }
  assert.equal(expireQuestion({ activeCard: null }, 90000), false);
});

function fixture(t) {
  let now = 0; t.mock.method(Date, 'now', () => now);
  const rooms = new Map(), repository = { all: () => [...rooms.values()], get: code => rooms.get(code), add: room => rooms.set(room.code, room), save() {} };
  const app = createApplication({ repository }), token = randomUUID();
  const created = app.service.execute({ kind: 'create', name: 'Host', gameType: 'teambingo', teamTimeMinutes: 10, token, requestId: randomUUID() });
  const room = rooms.get(created.room.code);
  const manager = separateHost(room);
  const send = (kind, data = {}, who = token) => app.service.execute({ kind, code: room.code, token: who === token && (HOST_ACTIONS.has(kind) || kind === 'cardFinish') ? manager.token : who, requestId: randomUUID(), ...data });
  send('settings', { size: 3, teamCount: 2, playersPerTeam: 1 }); send('join', { name: 'Guest' }, randomUUID());
  room.players.push(...room.players.splice(room.players.indexOf(manager), 1));
  room.players.filter(player => player.id !== room.host).forEach(player => send('ready', { ready: true }, player.token));
  prepareCaptains(room); send('start');
  completeGoalSelection(room, (captain, goalId) => send('hiddenGoal', { goalId }, captain.token));
  now = 1000; send('call', { number: 1 });
  const owner = room.players[1], card = drawForNumber({ hand: room.teamHands['team-2'] ||= [] });
  now = 2000; send('cardUse', { cardId: card.id }, owner.token);
  return { ...app, room, owner, card, send, setTime: value => { now = value; }, sessionId: room.activeCard.id };
}

test('card use sets deadlines from the selected question difficulty and exposes only remaining time', t => {
  const { questions } = require('../src/games/teambingo/question-bank');
  for (const [difficulty, duration] of [['簡單', 10000], ['普通', 20000], ['困難', 30000]]) {
    questions.splice(0, questions.length, configuredFixtureQuestions.find(question => question.difficulty === difficulty && question.type === 'multiple-choice'));
    const f = fixture(t);
    assert.equal(f.room.activeCard.question.difficulty, difficulty);
    assert.equal(f.room.activeCard.answerDeadlineAt, 2000 + duration);
    for (const player of f.room.players) {
      const active = f.service.snapshot(f.room, player.id).activeCard;
      assert.equal(active.answerRemainingMs, duration);
      assert.equal(active.card.difficulty, undefined);
      assert.equal(active.card.questionDifficulty, undefined);
    }
  }
});

test('late API submissions expire before validation even without a prior scheduler tick', t => {
  const f = fixture(t); f.setTime(12000);
  assert.throws(() => f.send('cardAnswer', { cardSessionId: f.sessionId, choice: 0 }, f.owner.token), /作答時間已結束/);
  assert.equal(f.room.activeCard.stage, 'review'); assert.equal(f.room.activeCard.timedOut, true);
  assert.equal(f.room.turn, f.owner.id); assert.equal(f.room.activeCard.correct, undefined);
  assert.equal(remainingTime(f.room, 'team-2'), 599000);
  assert.equal(f.service.snapshot(f.room, f.owner.id).activeCard.referenceAnswer, undefined);
  assert.ok(Object.hasOwn(f.service.snapshot(f.room, f.room.host).activeCard, 'referenceAnswer'));
});

test('answers submitted just before the deadline remain valid through a long host decision', t => {
  const f = fixture(t); f.setTime(11999);
  f.send('cardAnswer', { cardSessionId: f.sessionId, choice: 0 }, f.owner.token);
  f.setTime(900000); f.service.tick();
  assert.equal(f.room.activeCard.stage, 'review'); assert.equal(f.room.activeCard.choice, 0);
  assert.equal(f.room.activeCard.timedOut, undefined);
  assert.equal(remainingTime(f.room, 'team-2'), 599000);
});

test('the host can judge a timed-out question either way and completion consumes the card and turn', t => {
  for (const correct of [true, false]) {
    const f = fixture(t); f.setTime(12000); f.service.tick();
    assert.throws(() => f.send('cardJudge', { cardSessionId: f.sessionId, correct }, f.owner.token), /只有房主/);
    f.send('cardJudge', { cardSessionId: f.sessionId, correct });
    assert.equal(f.room.activeCard.correct, correct);
    f.send('cardFinish', { cardSessionId: f.sessionId }, f.owner.token);
    assert.equal(f.room.activeCard, null); assert.equal(f.room.turn, f.room.players[0].id);
    assert.equal(f.room.teamHands['team-2'].length, 0);
  }
});

test('cancellation is rejected both before the deadline and after timeout without refunding a card', t => {
  const f = fixture(t); f.setTime(11999);
  const before = structuredClone(f.room);
  assert.throws(() => f.send('cardCancel', { cardSessionId: f.sessionId }, f.owner.token), /無法取消/);
  assert.deepEqual(f.room, before);
  assert.equal(f.room.turn, f.owner.id);
  const id = f.room.activeCard.id, deadline = f.room.activeCard.answerDeadlineAt;
  f.setTime(deadline);
  assert.throws(() => f.send('cardCancel', { cardSessionId: id }, f.owner.token), /作答時間已結束/);
  assert.equal(f.room.teamHands['team-2'].length, 0);
});

test('reconnect and serialized migration preserve the original remaining answer time', t => {
  const f = fixture(t); f.setTime(7000);
  f.send('join', { name: f.owner.name }, randomUUID());
  assert.equal(f.room.activeCard.answerDeadlineAt, 12000);
  assert.equal(f.service.snapshot(f.room, f.owner.id).activeCard.answerRemainingMs, 5000);
  const restored = JSON.parse(JSON.stringify(f.room)); game.migrate(restored);
  assert.equal(restored.activeCard.answerDeadlineAt, 12000);
  game.tick(restored, 12000); assert.equal(restored.activeCard.timedOut, true);
});

test('invalid answer submissions cannot renew the difficulty-based deadline', t => {
  const f = fixture(t), deadline = f.room.activeCard.answerDeadlineAt;
  f.setTime(5000);
  assert.throws(() => f.send('cardAnswer', { cardSessionId: f.sessionId, choice: 99 }, f.owner.token), /有效的答案/);
  f.setTime(deadline - 1);
  assert.throws(() => f.send('cardAnswer', { cardSessionId: f.sessionId, choice: -1 }, f.owner.token), /有效的答案/);
  assert.equal(f.room.activeCard.answerDeadlineAt, deadline);
  f.setTime(deadline); f.service.tick();
  assert.equal(f.room.activeCard.timedOut, true); assert.equal(f.room.activeCard.stage, 'review');
});
