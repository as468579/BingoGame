const { test } = require('node:test');
// Keep rule fixtures deterministic by limiting their bank; production cards allow all difficulties.
const fixtureQuestions = require('../src/games/teambingo/question-bank').questions;
const configuredFixtureQuestions = fixtureQuestions.slice();
test.beforeEach(() => { fixtureQuestions.splice(0, fixtureQuestions.length, ...configuredFixtureQuestions.filter(question => question.difficulty === '簡單' && question.type === 'multiple-choice' && Number.isInteger(question.answer))); });
test.afterEach(() => { fixtureQuestions.splice(0, fixtureQuestions.length, ...configuredFixtureQuestions); });
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const game = require('../src/games/teambingo');
const { createBoard, createCells } = require('../src/games/teambingo/board');
const { createLinePrizes } = require('../src/games/teambingo/prizes');
const { advanceTurn } = require('../src/games/teambingo/turns');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { TEAM_TIME_MS, initializeTeamClock, remainingTime, syncTeamClock, expireTeamClock } = require('../src/games/teambingo/team-clock');
const { createApplication } = require('../src/app');
const { drawForNumber } = require('../src/games/teambingo/card-actions');
const { prepareCaptains, completeGoalSelection, separateHost, hostAction, HOST_ACTIONS } = require('../scripts/test-support/team-goal-setup.cjs');

function roomAt(now = 0) {
  const room = { ...game.initializeRoom({ teamTimeMinutes: 10 }), size: 3, phase: 'playing', revision: 0, host: 'a', turn: 'a', board: createBoard(3),
    cells: createCells(createBoard(3)), linePrizes: createLinePrizes(3), players: ['a', 'b', 'c', 'd'].map((id, index) =>
      ({ id, teamId: index < 2 ? 'team-1' : 'team-2', ready: true, hand: [], usedDemoCards: [] })) };
  separateHost(room);
  initializeTeamClock(room, now);
  return room;
}
const act = (room, data, now, player = room.players[0]) => {
  if (data.kind === 'start') prepareCaptains(room);
  applyGameAction(room, hostAction(room, player, data.kind), data, { isOnline: () => false }, now);
  if (data.kind === 'start') completeGoalSelection(room, (captain, goalId) => act(room, { kind: 'hiddenGoal', goalId }, now, captain));
};

test('configured ten-minute teams spend only the active team budget', () => {
  const room = roomAt();
  assert.equal(TEAM_TIME_MS, 480000);
  assert.equal(remainingTime(room, 'team-1', 120000), 480000);
  assert.equal(remainingTime(room, 'team-2', 120000), 600000);
  assert.equal(remainingTime(room, 'team-1', -1000), 600000);
});

test('interleaved teammates share their team budget across intervening opponent turns', () => {
  const room = roomAt();
  advanceTurn(room); syncTeamClock(room, 100000);
  assert.equal(room.turn, 'c'); assert.equal(remainingTime(room, 'team-1', 150000), 500000);
  advanceTurn(room); syncTeamClock(room, 150000);
  assert.equal(room.turn, 'b'); assert.equal(remainingTime(room, 'team-1', 250000), 400000);
  assert.equal(remainingTime(room, 'team-2', 250000), 550000);
});

test('a visible card question pauses all clock spending and resuming does not charge the paused interval', () => {
  const room = roomAt(); room.activeCard = { id: 'question' }; syncTeamClock(room, 60000);
  assert.equal(remainingTime(room, 'team-1', 9000000), 540000);
  assert.equal(expireTeamClock(room, 9000000), false);
  room.activeCard = null; syncTeamClock(room, 10000000);
  assert.equal(remainingTime(room, 'team-1', 10060000), 480000);
});

test('expiration skips every member of the timed-out team exactly at the deadline', () => {
  const room = roomAt();
  assert.equal(expireTeamClock(room, 599999), false);
  assert.equal(expireTeamClock(room, 600000), true);
  assert.equal(room.turn, 'c'); assert.equal(room.phase, 'playing');
  assert.equal(remainingTime(room, 'team-1', 600000), 0);
  advanceTurn(room); syncTeamClock(room, 610000);
  assert.equal(room.turn, 'd');
  advanceTurn(room); syncTeamClock(room, 620000);
  assert.equal(room.turn, 'c');
});

test('delayed scheduler ticks account for the next team from the actual previous deadline', () => {
  const room = roomAt(); expireTeamClock(room, 900000);
  assert.equal(room.turn, 'c'); assert.equal(room.teamClock.startedAt, 600000);
  assert.equal(remainingTime(room, 'team-2', 900000), 300000);
});

test('all budgets exhausted ends without a winner or an infinite turn loop', () => {
  const room = roomAt(); assert.equal(expireTeamClock(room, 3000000), true);
  assert.equal(room.phase, 'finished'); assert.equal(room.turn, null);
  assert.equal(room.endReason, 'time-exhausted'); assert.deepEqual(room.winners, []);
  assert.equal(room.teamClock.activeTeamId, null);
  assert.equal(expireTeamClock(room, 4000000), false);
});

test('an already achieved victory takes precedence over timeout exclusion', () => {
  const room = roomAt();
  room.cells.slice(0, 3).forEach(cell => Object.assign(cell, { isCovered: true, teamId: 'team-1' }));
  expireTeamClock(room, 600000);
  assert.equal(room.phase, 'finished'); assert.deepEqual(room.winners, ['team-1']);
  assert.notEqual(room.endReason, 'time-exhausted');
});

test('undo restores the action but does not refund either teammate clock spending', () => {
  const room = roomAt(); act(room, { kind: 'call', number: 1 }, 100000);
  assert.equal(room.turn, 'c');
  act(room, { kind: 'undo', revision: 0 }, 150000);
  assert.equal(room.turn, 'a'); assert.equal(room.cells[0].isCovered, false);
  assert.equal(remainingTime(room, 'team-1', 150000), 500000);
  assert.equal(remainingTime(room, 'team-2', 150000), 550000);
});

test('reset clears clocks and a new start grants fresh budgets', () => {
  const room = roomAt(); expireTeamClock(room, 600000);
  act(room, { kind: 'reset' }, 600000);
  assert.equal(room.teamClock, null);
  room.players.forEach(player => { player.ready = true; });
  act(room, { kind: 'start' }, 700000);
  assert.equal(remainingTime(room, 'team-1', 700000), 600000);
  assert.equal(remainingTime(room, 'team-2', 700000), 600000);
});

test('persisted clocks survive migration and continue from their saved deadline', () => {
  const room = roomAt(); syncTeamClock(room, 50000);
  const saved = JSON.parse(JSON.stringify(room)); game.migrate(saved);
  assert.equal(remainingTime(saved, 'team-1', 200000), 400000);
  expireTeamClock(saved, 600000); assert.equal(saved.turn, 'c');
});

function serviceFixture(t, teamTimeMinutes = 10) {
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  const rooms = new Map(); let saves = 0;
  const repository = { all: () => [...rooms.values()], get: code => rooms.get(code), add: room => rooms.set(room.code, room), save: () => { saves++; } };
  const app = createApplication({ repository });
  const token = randomUUID();
  const created = app.service.execute({ kind: 'create', gameType: 'teambingo', teamTimeMinutes, name: 'Host', token, requestId: randomUUID() });
  const code = created.room.code, room = rooms.get(code);
  const manager = separateHost(room);
  const send = (kind, data = {}, who = token) => {
    if (kind === 'start') prepareCaptains(room);
    const result = app.service.execute({ kind, code, token: who === token && (HOST_ACTIONS.has(kind) || kind === 'cardFinish') ? manager.token : who, requestId: randomUUID(), ...data });
    if (kind === 'start') {
      completeGoalSelection(room, (captain, goalId) => send('hiddenGoal', { goalId }, captain.token));
      result.room = app.service.snapshot(room, result.playerId);
    }
    return result;
  };
  send('settings', { size: 3, teamCount: 2, playersPerTeam: 1 });
  send('join', { name: 'Guest' }, randomUUID());
  room.players.push(...room.players.splice(room.players.indexOf(manager), 1));
  room.players.filter(player => player.id !== room.host).forEach(player => send('ready', { ready: true }, player.token)); send('start');
  return { ...app, room, send, setTime: value => { now = value; }, saves: () => saves };
}

test('new Team Bingo rooms default to eight equal minutes for every team', () => {
  const room = { ...game.initializeRoom(), phase: 'playing', turn: 'a', players: [{ id: 'a', teamId: 'team-1' }] };
  assert.equal(room.teamTimeMinutes, 8);
  initializeTeamClock(room, 0);
  assert.deepEqual(Object.values(room.teamClock.remaining), [480000, 480000]);
});

test('creation configures one shared allowance, joins cannot change it and reset preserves the chosen duration', t => {
  const f = serviceFixture(t, 12);
  assert.equal(f.room.teamTimeMinutes, 12);
  assert.deepEqual(Object.values(f.room.teamClock.remaining), [720000, 720000]);
  f.send('join', { name: 'Guest', teamTimeMinutes: 1 }, f.room.players[1].token);
  assert.equal(f.room.teamTimeMinutes, 12);
  const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
  assert.equal(saved.teamTimeMinutes, 12);
  f.send('reset');
  f.room.players.filter(player => player.id !== f.room.host).forEach(player => f.send('ready', { ready: true }, player.token)); f.send('start');
  assert.deepEqual(Object.values(f.room.teamClock.remaining), [720000, 720000]);
});

test('invalid creation allowances are rejected before adding a room', t => {
  const f = serviceFixture(t), count = f.repository.all().length;
  for (const minutes of [0, -1, 121, 1.5, '8', null]) {
    assert.throws(() => f.send('create', { name: 'Host', gameType: 'teambingo', teamTimeMinutes: minutes }), /1～120/);
  }
  assert.equal(f.repository.all().length, count);
});

test('legacy clock migration sets the new default for future rounds without refilling active balances', () => {
  const room = roomAt(); syncTeamClock(room, 60000);
  delete room.teamTimeMinutes;
  game.migrate(room);
  assert.equal(room.teamTimeMinutes, 8);
  assert.equal(room.teamClock.remaining['team-1'], 540000);
});

test('service ticks expire inactive-browser turns and persist and broadcast the transition once', t => {
  const f = serviceFixture(t); let broadcasts = 0;
  t.mock.method(f.service, 'broadcast', () => { broadcasts++; });
  const saved = f.saves(), revision = f.room.revision;
  f.setTime(600000); f.service.tick();
  assert.equal(f.room.turn, f.room.players[1].id);
  assert.equal(f.room.revision, revision + 1); assert.equal(f.saves(), saved + 1); assert.equal(broadcasts, 1);
  f.service.tick(); assert.equal(broadcasts, 1);
});

test('the server lifecycle starts an automatic timeout poll and stops it on close', t => {
  const f = serviceFixture(t); let poll, cleared;
  const timer = { unref() {} };
  t.mock.method(globalThis, 'setInterval', (callback, delay) => { assert.equal(delay, 250); poll = callback; return timer; });
  t.mock.method(globalThis, 'clearInterval', handle => { cleared = handle; });
  f.server.emit('listening');
  f.setTime(600000); poll();
  assert.equal(f.room.turn, f.room.players[1].id);
  f.server.emit('close'); assert.equal(cleared, timer);
});

test('a stale action at an expired deadline cannot claim a number before the scheduler ticks', t => {
  const f = serviceFixture(t); f.setTime(600000);
  assert.throws(() => f.send('call', { number: 1 }), /輪到/);
  assert.deepEqual(f.room.called, []); assert.equal(f.room.teamClock.remaining['team-1'], 0);
});

test('failed actions do not restart the active team clock or extend its deadline', t => {
  const f = serviceFixture(t), startedAt = f.room.teamClock.startedAt;
  f.setTime(300000);
  assert.throws(() => f.send('call', { number: 99 }), /無效/);
  assert.equal(f.room.teamClock.startedAt, startedAt);
  assert.equal(remainingTime(f.room, 'team-1'), 300000);
  f.setTime(600000); f.service.tick();
  assert.equal(f.room.turn, f.room.players[1].id);
  assert.equal(f.room.teamClock.remaining['team-1'], 0);
});

test('real card use pauses clocks through submission and host judgment and restarts after finishing', t => {
  const f = serviceFixture(t);
  const held = drawForNumber({ hand: f.room.teamHands['team-1'] ||= [] }, require('../src/games/teambingo/card-catalog').cards.find(card => card.id === 'team-time-plus-2m'));
  f.setTime(100000); f.send('cardUse', { cardId: held.id });
  const cardSessionId = f.room.activeCard.id;
  f.setTime(105000); f.service.tick();
  assert.equal(remainingTime(f.room, 'team-1'), 500000);
  f.send('cardAnswer', { cardSessionId, choice: 0 });
  f.setTime(2000000); f.send('cardJudge', { cardSessionId, correct: true });
  assert.equal(remainingTime(f.room, 'team-1'), 620000);
  f.send('cardFinish', { cardSessionId });
  assert.equal(f.room.teamClock.activeTeamId, 'team-2');
  assert.equal(f.service.snapshot(f.room, f.room.host).teams[0].timeRemainingMs, 620000);
});
