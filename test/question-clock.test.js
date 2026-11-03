const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { ANSWER_TIME_MS, ensureQuestionDeadline, expireQuestion } = require('../src/games/bingonext/question-clock');
const { createApplication } = require('../src/app');
const { drawForNumber } = require('../src/games/bingonext/card-actions');
const { remainingTime } = require('../src/games/bingonext/team-clock');
const game = require('../src/games/bingonext');

test('question deadlines grant sixty seconds once and never refresh an existing deadline', () => {
  const room = { activeCard: { stage: 'question' } };
  assert.equal(ANSWER_TIME_MS, 60000);
  ensureQuestionDeadline(room, 1000); assert.equal(room.activeCard.answerDeadlineAt, 61000);
  ensureQuestionDeadline(room, 50000); assert.equal(room.activeCard.answerDeadlineAt, 61000);
});

test('timeout at the exact deadline locks the question for host review without deciding correctness', () => {
  const room = { activeCard: { id: 'session', stage: 'question', answerDeadlineAt: 60000 } };
  assert.equal(expireQuestion(room, 59999), false);
  assert.equal(expireQuestion(room, 60000), true);
  assert.equal(room.activeCard.stage, 'review'); assert.equal(room.activeCard.timedOut, true);
  assert.equal(room.activeCard.correct, undefined); assert.equal(room.activeCard.choice, undefined);
  assert.equal(room.activeCard.id, 'session'); assert.equal(expireQuestion(room, 90000), false);
});

test('submitted answers, results and closed questions never time out retroactively', () => {
  for (const stage of ['review', 'result']) {
    const room = { activeCard: { stage, choice: 0, answerDeadlineAt: 60000 } }, before = structuredClone(room);
    assert.equal(expireQuestion(room, 90000), false); assert.deepEqual(room, before);
  }
  assert.equal(expireQuestion({ activeCard: null }, 90000), false);
});

function fixture(t) {
  let now = 0; t.mock.method(Date, 'now', () => now);
  const rooms = new Map(), repository = { all: () => [...rooms.values()], get: code => rooms.get(code), add: room => rooms.set(room.code, room), save() {} };
  const app = createApplication({ repository }), token = randomUUID();
  const created = app.service.execute({ kind: 'create', name: 'Host', gameType: 'bingo-next', teamTimeMinutes: 10, token, requestId: randomUUID() });
  const room = rooms.get(created.room.code);
  const send = (kind, data = {}, who = token) => app.service.execute({ kind, code: room.code, token: who, requestId: randomUUID(), ...data });
  send('settings', { size: 3, teamCount: 2, playersPerTeam: 1 }); send('join', { name: 'Guest' }, randomUUID());
  room.players.forEach(player => send('ready', { ready: true }, player.token)); send('start');
  now = 1000; send('call', { number: 1 });
  const owner = room.players[1], card = drawForNumber({ hand: room.teamHands['team-2'] ||= [] }, require('../src/games/bingonext/card-catalog').cards.find(card => card.id === 'star'));
  now = 2000; send('cardUse', { cardId: card.id }, owner.token);
  return { ...app, room, owner, card, send, setTime: value => { now = value; }, sessionId: room.activeCard.id };
}

test('late API submissions expire before validation even without a prior scheduler tick', t => {
  const f = fixture(t); f.setTime(62000);
  assert.throws(() => f.send('cardAnswer', { cardSessionId: f.sessionId, choice: 0 }, f.owner.token), /作答時間已結束/);
  assert.equal(f.room.activeCard.stage, 'review'); assert.equal(f.room.activeCard.timedOut, true);
  assert.equal(f.room.turn, f.owner.id); assert.equal(f.room.activeCard.correct, undefined);
  assert.equal(remainingTime(f.room, 'team-2'), 599000);
  assert.equal(f.service.snapshot(f.room, f.owner.id).activeCard.referenceAnswer, undefined);
  assert.ok(Object.hasOwn(f.service.snapshot(f.room, f.room.host).activeCard, 'referenceAnswer'));
});

test('answers submitted just before the deadline remain valid through a long host decision', t => {
  const f = fixture(t); f.setTime(61999);
  f.send('cardAnswer', { cardSessionId: f.sessionId, choice: 0 }, f.owner.token);
  f.setTime(900000); f.service.tick();
  assert.equal(f.room.activeCard.stage, 'review'); assert.equal(f.room.activeCard.choice, 0);
  assert.equal(f.room.activeCard.timedOut, undefined);
  assert.equal(remainingTime(f.room, 'team-2'), 599000);
});

test('the host can judge a timed-out question either way and completion consumes the card and turn', t => {
  for (const correct of [true, false]) {
    const f = fixture(t); f.setTime(62000); f.service.tick();
    assert.throws(() => f.send('cardJudge', { cardSessionId: f.sessionId, correct }, f.owner.token), /只有房主/);
    f.send('cardJudge', { cardSessionId: f.sessionId, correct });
    assert.equal(f.room.activeCard.correct, correct);
    f.send('cardFinish', { cardSessionId: f.sessionId }, f.owner.token);
    assert.equal(f.room.activeCard, null); assert.equal(f.room.turn, f.room.host);
    assert.equal(f.room.teamHands['team-2'].length, 0);
  }
});

test('cancellation is allowed before the deadline but timeout cannot be used to refund a card', t => {
  const f = fixture(t); f.setTime(61999);
  f.send('cardCancel', { cardSessionId: f.sessionId }, f.owner.token);
  assert.equal(f.room.teamHands['team-2'][0].id, f.card.id); assert.equal(f.room.turn, f.owner.id);
  f.send('cardUse', { cardId: f.card.id }, f.owner.token);
  const id = f.room.activeCard.id, deadline = f.room.activeCard.answerDeadlineAt;
  f.setTime(deadline);
  assert.throws(() => f.send('cardCancel', { cardSessionId: id }, f.owner.token), /作答時間已結束/);
  assert.equal(f.room.teamHands['team-2'].length, 0);
});

test('reconnect and serialized migration preserve the original remaining answer time', t => {
  const f = fixture(t); f.setTime(32000);
  f.send('join', { name: f.owner.name }, randomUUID());
  assert.equal(f.room.activeCard.answerDeadlineAt, 62000);
  assert.equal(f.service.snapshot(f.room, f.owner.id).activeCard.answerRemainingMs, 30000);
  const restored = JSON.parse(JSON.stringify(f.room)); game.migrate(restored);
  assert.equal(restored.activeCard.answerDeadlineAt, 62000);
  game.tick(restored, 62000); assert.equal(restored.activeCard.timedOut, true);
});

test('invalid answer submissions cannot renew the one-minute deadline', t => {
  const f = fixture(t), deadline = f.room.activeCard.answerDeadlineAt;
  f.setTime(20000);
  assert.throws(() => f.send('cardAnswer', { cardSessionId: f.sessionId, choice: 99 }, f.owner.token), /有效的答案/);
  f.setTime(deadline - 1);
  assert.throws(() => f.send('cardAnswer', { cardSessionId: f.sessionId, choice: -1 }, f.owner.token), /有效的答案/);
  assert.equal(f.room.activeCard.answerDeadlineAt, deadline);
  f.setTime(deadline); f.service.tick();
  assert.equal(f.room.activeCard.timedOut, true); assert.equal(f.room.activeCard.stage, 'review');
});
