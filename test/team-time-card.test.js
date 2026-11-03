const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createApplication } = require('../src/app');
const game = require('../src/games/teambingo');
const { cards } = require('../src/games/teambingo/card-catalog');
const { drawForNumber } = require('../src/games/teambingo/card-actions');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { remainingTime } = require('../src/games/teambingo/team-clock');

function fixture(t) {
  let now = 0; t.mock.method(Date, 'now', () => now);
  const rooms = new Map(), app = createApplication({ repository: { all: () => [...rooms.values()], get: code => rooms.get(code), add: room => rooms.set(room.code, room), save() {} } });
  const token = randomUUID(), created = app.service.execute({ kind: 'create', gameType: 'teambingo', teamTimeMinutes: 10, name: 'Host', token, requestId: randomUUID() });
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
  assert.equal(alarm.name, '加時');
  assert.equal(alarm.symbol, 'pocket-watch'); assert.equal(alarm.questionDifficulty, '簡單'); assert.equal(alarm.enabled, true);
  assert.equal(require('../src/games/bingo/card-catalog').cards.some(card => card.id === alarm.id), false);
  assert.equal(require('../src/games/bridge/card-catalog').cards.some(card => card.id === alarm.id), false);
});

test('retired pending cards are removed from saved hands and undo history while time cards stay usable', t => {
  const f = fixture(t);
  const timeCard = { ...f.held, name: '加時鬧鐘', symbol: '⏰' };
  const oldCards = ['star', 'shield', 'moon'].map(id => ({ id, definitionId: id }));
  f.room.teamHands['team-1'] = [...oldCards, timeCard];
  f.room.history = [{ teamHands: { 'team-1': structuredClone(f.room.teamHands['team-1']) } }];
  f.room.activeCard = { id: 'old-question', cardId: 'star', playerId: f.room.host, stage: 'question' };
  game.migrate(f.room);
  assert.deepEqual(f.room.teamHands['team-1'], [timeCard]);
  assert.deepEqual(f.room.history[0].teamHands['team-1'], [timeCard]);
  assert.equal(f.room.activeCard, null);
  assert.equal(f.room.turn, f.room.host);
  assert.equal(f.room.teamClock.activeTeamId, 'team-1');
  const visible = f.service.snapshot(f.room, f.room.host).players[0].hand[0];
  assert.equal(visible.name, '加時'); assert.equal(visible.symbol, 'pocket-watch');
  assert.deepEqual(cards.map(card => card.id), ['team-time-plus-2m']);
});

test('legacy personal hands migrate once, remove retired cards and preserve a valid paused question', t => {
  const f = fixture(t), activeId = f.room.activeCard.id;
  const old = { id: 'retired', definitionId: 'moon' };
  delete f.room.teamHands;
  f.room.players[0].hand = [old, f.held];
  f.room.history = [{ playerStates: [{ id: f.room.host, hand: [old, f.held] }], activeCard: { cardId: 'shield' } }];
  game.migrate(f.room);
  assert.deepEqual(f.room.teamHands['team-1'], [f.held]);
  assert.deepEqual(f.room.players[0].hand, []);
  assert.deepEqual(f.room.history[0].teamHands['team-1'], [f.held]);
  assert.equal(f.room.history[0].activeCard, null);
  assert.equal(f.room.activeCard.id, activeId);
  assert.equal(f.room.teamClock.activeTeamId, null);
  const migrated = structuredClone(f.room);
  game.migrate(f.room); assert.deepEqual(f.room, migrated);
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

test('every card definition rejects effects after an incorrect verdict without changing game state', () => {
  const { applyCardEffect } = require('../src/games/teambingo/card-effects');
  for (const definition of cards) {
    const room = { teamClock: { remaining: { 'team-1': 480000 }, bonuses: {} } };
    const active = { stage: 'result', correct: false, teamId: 'team-1', cardId: definition.id };
    const before = structuredClone({ room, active });
    assert.equal(applyCardEffect(room, active, definition, 0), false);
    assert.equal(applyCardEffect(room, active, definition, 60000), false);
    assert.deepEqual({ room, active }, before);
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
