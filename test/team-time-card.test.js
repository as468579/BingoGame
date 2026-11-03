const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createApplication } = require('../src/app');
const game = require('../src/games/bingonext');
const { cards } = require('../src/games/bingonext/card-catalog');
const { drawForNumber } = require('../src/games/bingonext/card-actions');
const { applyGameAction } = require('../src/games/bingonext/actions');
const { remainingTime } = require('../src/games/bingonext/team-clock');

function fixture(t) {
  let now = 0; t.mock.method(Date, 'now', () => now);
  const rooms = new Map(), app = createApplication({ repository: { all: () => [...rooms.values()], get: code => rooms.get(code), add: room => rooms.set(room.code, room), save() {} } });
  const token = randomUUID(), created = app.service.execute({ kind: 'create', gameType: 'bingo-next', teamTimeMinutes: 10, name: 'Host', token, requestId: randomUUID() });
  const room = rooms.get(created.room.code);
  const send = (kind, data = {}) => app.service.execute({ kind, code: room.code, token, requestId: randomUUID(), ...data });
  send('settings', { size: 3, teamCount: 2, playersPerTeam: 1 });
  app.service.execute({ kind: 'join', code: room.code, name: 'Guest', token: randomUUID(), requestId: randomUUID() });
  room.players.forEach(player => { player.ready = true; }); send('start');
  const held = drawForNumber({ hand: room.teamHands['team-1'] ||= [] }, cards.find(card => card.id === 'team-time-plus-2m'));
  now = 10000; send('cardUse', { cardId: held.id });
  const cardSessionId = room.activeCard.id;
  const answer = () => send('cardAnswer', { cardSessionId, choice: 0 });
  return { ...app, room, held, send, answer, cardSessionId, setTime: value => { now = value; } };
}

test('alarm card belongs only to Team Bingo and requires an easy question', () => {
  const alarm = cards.find(card => card.id === 'team-time-plus-2m');
  assert.equal(alarm.symbol, '⏰'); assert.equal(alarm.questionDifficulty, '簡單'); assert.equal(alarm.enabled, true);
  assert.equal(require('../src/games/bingo/card-catalog').cards.some(card => card.id === alarm.id), false);
  assert.equal(require('../src/games/bridge/card-catalog').cards.some(card => card.id === alarm.id), false);
});

test('correct host verdict grants exactly two minutes once, even across finish retries', t => {
  const f = fixture(t);
  assert.equal(f.room.activeCard.question.difficulty, '簡單');
  assert.equal(f.held.questionDifficulty, undefined); assert.equal(f.held.effectId, undefined);
  assert.equal(remainingTime(f.room, 'team-1'), 590000);
  f.answer(); f.send('cardJudge', { cardSessionId: f.cardSessionId, correct: true });
  assert.equal(remainingTime(f.room, 'team-1'), 710000);
  assert.equal(remainingTime(f.room, 'team-2'), 600000);
  assert.equal(f.room.teamClock.bonuses['team-1'], 120000);
  assert.throws(() => f.send('cardJudge', { cardSessionId: f.cardSessionId, correct: true }), /等待判定/);
  const requestId = randomUUID();
  f.send('cardFinish', { cardSessionId: f.cardSessionId, requestId });
  f.send('cardFinish', { cardSessionId: f.cardSessionId, requestId });
  assert.equal(remainingTime(f.room, 'team-1'), 710000);
  assert.equal(f.room.teamHands['team-1'].length, 0); assert.equal(f.room.turn, f.room.players[1].id);
});

test('wrong answers, cancellations and host-aborted questions never grant bonus time', t => {
  for (const outcome of ['wrong', 'cancel', 'abort']) {
    const f = fixture(t);
    if (outcome === 'cancel') f.send('cardCancel', { cardSessionId: f.cardSessionId });
    else {
      if (outcome === 'wrong') { f.answer(); f.send('cardJudge', { cardSessionId: f.cardSessionId, correct: false }); }
      f.send('cardFinish', { cardSessionId: f.cardSessionId });
    }
    assert.equal(remainingTime(f.room, 'team-1'), 590000);
    assert.equal(f.room.teamClock.bonuses['team-1'], undefined);
    assert.equal(f.room.teamHands['team-1'].length, outcome === 'cancel' ? 1 : 0);
  }
});

test('undo refunds the shared card and removes earned bonus without refunding elapsed action time', t => {
  const f = fixture(t); f.answer();
  f.send('cardJudge', { cardSessionId: f.cardSessionId, correct: true });
  f.send('cardFinish', { cardSessionId: f.cardSessionId });
  f.setTime(20000); f.send('undo', { revision: f.room.revision });
  assert.equal(f.room.teamHands['team-1'][0].id, f.held.id);
  assert.equal(remainingTime(f.room, 'team-1'), 590000);
  assert.equal(remainingTime(f.room, 'team-2'), 590000);
  assert.equal(f.room.teamClock.bonuses['team-1'], undefined);
  assert.equal(f.room.turn, f.room.host);
});

test('saved result sessions retain applied bonus and cannot apply it again after migration', t => {
  const f = fixture(t); f.answer();
  f.send('cardJudge', { cardSessionId: f.cardSessionId, correct: true });
  const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
  assert.equal(saved.activeCard.effectApplied, true);
  applyGameAction(saved, saved.players[0], { kind: 'cardFinish', cardSessionId: f.cardSessionId }, { isOnline: () => true }, 10000);
  assert.equal(saved.teamClock.remaining['team-1'], 710000);
  assert.equal(saved.teamClock.bonuses['team-1'], 120000);
});

test('older saved clocks without a bonus ledger can receive the alarm effect safely', t => {
  const f = fixture(t); delete f.room.teamClock.bonuses;
  f.answer(); f.send('cardJudge', { cardSessionId: f.cardSessionId, correct: true });
  assert.equal(remainingTime(f.room, 'team-1'), 710000);
  assert.equal(f.room.teamClock.bonuses['team-1'], 120000);
});
