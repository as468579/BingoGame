const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const game = require('../src/games/teambingo');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { remainingTime, overtimeState, syncTeamClock } = require('../src/games/teambingo/team-clock');
const { PAGE_COUNT } = require('../src/games/teambingo/introduction');
const { drawForNumber } = require('../src/games/teambingo/card-actions');

function fixture(t, start = true) {
  let now = 0; t.mock.method(Date, 'now', () => now);
  const room = { ...game.initializeRoom(), gameType: 'teambingo', code: 'INTRO', host: 'host', phase: 'lobby', revision: 0,
    captains: { 'team-1': 'c1', 'team-2': 'c2' }, players: [
      { id: 'host', name: 'Host', teamId: null, hand: [], ready: false },
      ...[['c1', 'team-1'], ['a', 'team-1'], ['c2', 'team-2'], ['b', 'team-2']].map(([id, teamId]) => ({ id, name: id, teamId, hand: [], ready: true }))
    ] };
  const act = (kind, data = {}, id = 'host') => applyGameAction(room, room.players.find(player => player.id === id), { kind, ...data }, { isOnline: () => true }, now);
  room.players.forEach(player => { player.token = randomUUID(); player.requests = []; });
  if (start) {
    act('start');
    for (const id of ['c1', 'c2']) for (const goalId of ['four-corners', 'consecutive-numbers']) act('hiddenGoal', { goalId }, id);
  }
  return { room, act, time: value => { now = value; }, tick: () => game.tick(room, now),
    snapshot: id => game.snapshot(room, { isOnline: () => true }, id || 'host'),
    open: (page = 0) => act('introduction', { open: true, page }),
    page: page => act('introduction', { open: true, page, sessionId: room.introduction.id }),
    close: () => act('introduction', { open: false, sessionId: room.introduction.id }) };
}

test('host opening, paging and closing introduction pauses and resumes team time without game history', t => {
  const f = fixture(t), turn = f.room.turn, historyLength = f.room.history.length;
  f.time(10000); f.open(1);
  const paused = remainingTime(f.room, 'team-1'), pausedAt = f.room.introduction.pausedAt;
  assert.equal(paused, 470000); assert.equal(f.room.teamClock.activeTeamId, null);
  f.time(200000); assert.equal(f.tick(), false); f.page(4);
  assert.equal(remainingTime(f.room, 'team-1'), paused);
  assert.equal(f.room.introduction.pausedAt, pausedAt);
  for (const viewer of ['host', 'c1', 'a', 'b']) {
    assert.deepEqual(f.snapshot(viewer).introduction, { id: f.room.introduction.id, version: 2, open: true, page: 4 });
    assert.equal(f.snapshot(viewer).teams[0].clockRunning, false);
    assert.equal(f.snapshot(viewer).introduction.pausedAt, undefined);
  }
  f.close(); assert.equal(f.room.turn, turn); assert.equal(f.room.history.length, historyLength);
  f.time(205000); assert.equal(remainingTime(f.room, 'team-1'), paused - 5000);
});

test('only host can share and invalid pages or stale sessions cannot mutate the presentation', t => {
  const f = fixture(t);
  for (const id of ['a', 'b', 'c1', 'c2']) assert.throws(() => f.act('introduction', { open: true, page: 0 }, id), error => error.status === 403);
  for (const page of [-1, PAGE_COUNT, 0.5, '1', null, NaN]) assert.throws(() => f.open(page), /頁面/);
  assert.equal(f.room.introduction, undefined);
  f.open(); const id = f.room.introduction.id; f.close(); f.open(2);
  assert.notEqual(f.room.introduction.id, id);
  const before = structuredClone(f.room);
  for (const open of [true, false]) assert.throws(() => f.act('introduction', { open, page: 0, sessionId: id }), error => error.status === 409);
  assert.throws(() => f.act('introduction', { open: true, page: 1 }), error => error.status === 409);
  assert.deepEqual(f.room, before);
});

test('shared presentation rejects game actions even when the player closes their local guide', t => {
  const f = fixture(t); f.open();
  for (const kind of ['call', 'cardUse', 'cardAnswer', 'cardJudge', 'cardNextQuestion', 'cardFinish', 'captainHint', 'hiddenGoalGuess', 'hiddenGoalJudge', 'undo', 'settings', 'board', 'ready', 'rerollPrizes']) {
    const before = structuredClone(f.room);
    assert.throws(() => f.act(kind, { number: 1 }, kind === 'call' ? 'a' : 'host'), /介紹/);
    assert.deepEqual(f.room, before);
  }
  assert.equal(f.snapshot('c1').canHint, false);
  f.close(); f.act('call', { number: 1 }, 'a'); assert.equal(f.room.cells.find(cell => cell.number === 1).teamId, 'team-1');
});

test('host presentation freezes the unused fraction of a three-second overtime turn', t => {
  const f = fixture(t); f.room.teamClock.remaining['team-1'] = 0; syncTeamClock(f.room, 0);
  f.time(1000); f.open(); assert.equal(overtimeState(f.room).remainingMs, 2000);
  f.time(60000); f.tick(); assert.equal(overtimeState(f.room).remainingMs, 2000); assert.equal(overtimeState(f.room).running, false);
  f.close(); f.time(61999); assert.equal(f.tick(), false);
  f.time(62000); assert.equal(f.tick(), true); assert.equal(f.room.turn, 'b');
});

test('a question opened before the introduction retains its remaining answer time after closing it', t => {
  const f = fixture(t);
  const definition = require('../src/games/teambingo/card-catalog').cards.find(card => card.id === 'team-time-plus-2m');
  const held = drawForNumber({ hand: f.room.teamHands['team-1'] ||= [] }, definition);
  f.act('cardUse', { cardId: held.id }, 'a'); f.time(1000);
  const deadline = f.room.activeCard.answerDeadlineAt, remaining = f.snapshot('a').activeCard.answerRemainingMs;
  f.open(); f.time(61000); assert.equal(f.tick(), false);
  assert.equal(f.room.activeCard.stage, 'question'); assert.equal(f.snapshot('a').activeCard.answerRemainingMs, remaining);
  f.close(); assert.equal(f.room.activeCard.answerDeadlineAt, deadline + 60000);
  f.time(deadline + 59999); assert.equal(f.tick(), false);
  f.time(deadline + 60000); assert.equal(f.tick(), true); assert.equal(f.room.activeCard.stage, 'review');
});

test('a captain hint timer is paused during the presentation and resumes without time loss', t => {
  const f = fixture(t); f.act('captainHint', {}, 'c1'); f.time(1000); f.open();
  f.time(61000); assert.equal(f.tick(), false); assert.equal(f.snapshot('a').hint.remainingMs, 29000);
  f.close(); assert.equal(f.room.hint.endsAt, 90000);
  f.time(89999); assert.equal(f.tick(), false); f.time(90000); assert.equal(f.tick(), true); assert.equal(f.room.hint, null);
});

test('a saved shared presentation restores for reconnecting players without charging paused time', t => {
  const f = fixture(t); f.time(10000); f.open(3);
  const saved = JSON.parse(JSON.stringify(f.room)); f.time(100000); game.migrate(saved);
  assert.deepEqual(game.snapshot(saved, { isOnline: () => true }, 'a').introduction, f.snapshot('a').introduction);
  assert.equal(remainingTime(saved, 'team-1'), 470000);
  applyGameAction(saved, saved.players[0], { kind: 'introduction', open: false, sessionId: saved.introduction.id }, {}, 100000);
  assert.equal(remainingTime(saved, 'team-1', 101000), 469000);
});

test('presentations work in preparation and goal selection; reset clears the shared state', t => {
  const f = fixture(t, false); f.open(2);
  assert.throws(() => f.act('start'), /介紹/); f.close(); f.act('start'); f.open(1);
  assert.equal(f.room.phase, 'choosing-goal');
  assert.throws(() => f.act('hiddenGoal', { goalId: 'four-corners' }, 'c1'), /介紹/);
  f.act('reset'); assert.equal(f.room.phase, 'lobby'); assert.equal(f.room.introduction, null);
});

test('shared introduction commands persist and broadcast to every viewer; retries and player requests cannot change the session', t => {
  const f = fixture(t), { createApplication } = require('../src/app');
  let saves = 0; const broadcasts = [];
  const repository = { all: () => [f.room], get: code => code === f.room.code ? f.room : null, save: () => { saves++; } };
  const { service } = createApplication({ repository });
  t.mock.method(service, 'broadcast', room => broadcasts.push(room.players.map(player => service.snapshot(room, player.id))));
  const send = (data, id = 'host') => service.execute({ kind: 'introduction', code: f.room.code,
    token: f.room.players.find(player => player.id === id).token, requestId: randomUUID(), ...data });
  const requestId = randomUUID(), opening = send({ open: true, page: 0, requestId, pausedAt: -999999, version: 999999 });
  assert.equal(saves, 1); assert.equal(broadcasts.length, 1); assert.equal(f.room.introduction.version, 1); assert.equal(f.room.introduction.pausedAt, 0);
  assert.ok(broadcasts[0].every(snapshot => snapshot.introduction.id === opening.room.introduction.id && snapshot.introduction.open));
  send({ open: true, page: 4, requestId }); assert.equal(saves, 1); assert.equal(f.room.introduction.page, 0);
  send({ open: true, page: 2, sessionId: f.room.introduction.id });
  assert.equal(saves, 2); assert.ok(broadcasts[1].every(snapshot => snapshot.introduction.page === 2));
  const before = structuredClone(f.room);
  assert.throws(() => send({ open: false, sessionId: f.room.introduction.id }, 'a'), error => error.status === 403);
  assert.deepEqual(f.room, before); assert.equal(saves, 2);
  service.connected(f.room, f.room.players.find(player => player.id === 'a'));
  assert.ok(broadcasts.at(-1).every(snapshot => snapshot.introduction.page === 2 && snapshot.introduction.open));
  send({ open: false, sessionId: f.room.introduction.id });
  assert.equal(saves, 3); assert.ok(broadcasts.at(-1).every(snapshot => snapshot.introduction.open === false));
});
