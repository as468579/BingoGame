const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { separateHost, hostAction, setGoalOffers } = require('../scripts/test-support/team-goal-setup.cjs');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { remainingTime, initializeTeamClock } = require('../src/games/teambingo/team-clock');
const { hintUses, addHintUses } = require('../src/games/teambingo/captain-hint');
const { drawForNumber } = require('../src/games/teambingo/card-actions');
const { advanceTurn } = require('../src/games/teambingo/turns');

function fixture(t, start = true) {
  let now = 0; t.mock.method(Date, 'now', () => now);
  const room = { ...game.initializeRoom(), code: 'HINT', gameType: 'teambingo', phase: 'lobby', host: 'captain-a', revision: 0,
    captains: { 'team-1': 'captain-a', 'team-2': 'captain-b' }, players:
      [['captain-a', 'team-1', true], ['a', 'team-1', true], ['captain-b', 'team-2', true], ['b', 'team-2', true]]
        .map(([id, teamId, ready]) => ({ id, name: id, teamId, ready, hand: [] })) };
  separateHost(room);
  const act = (kind, playerId = 'captain-a', data = {}) => { applyGameAction(room, hostAction(room, room.players.find(player => player.id === playerId), kind), { kind, ...data }, { isOnline: () => true }, now); if (kind === 'start') setGoalOffers(room); };
  const begin = () => { act('start'); act('hiddenGoal', 'captain-a', { goalId: 'anticipate-opponent' }); act('hiddenGoal', 'captain-b', { goalId: 'anticipate-opponent' }); };
  if (start) begin();
  return { room, act, begin, time: value => { now = value; }, snapshot: id => game.snapshot(room, { isOnline: () => true }, id) };
}

test('ready spectating captains stay out of the team member turn cycle', t => {
  const f = fixture(t);
  assert.equal(f.room.turn, 'a');
  assert.equal(f.snapshot('captain-a').players[0].spectating, true);
  assert.equal(f.snapshot('captain-a').players[0].participating, false);
  const order = [];
  for (let index = 0; index < 6; index++) { order.push(f.room.turn); advanceTurn(f.room); }
  assert.deepEqual(order, ['a', 'b', 'a', 'b', 'a', 'b']);
});

test('every captain must ready before starting while the host remains unready', t => {
  const f = fixture(t, false);
  f.room.players.find(player => player.id === 'captain-a').ready = false;
  assert.throws(() => f.act('start'), /準備/);
  f.act('ready', 'captain-a', { ready: true });
  f.act('ready', 'captain-b', { ready: false });
  assert.throws(() => f.act('start'), /準備/);
  f.act('ready', 'captain-b', { ready: true });
  assert.equal(f.room.players.find(player => player.id === f.room.host).ready, false);
  f.begin();
  assert.equal(f.room.phase, 'playing'); assert.equal(f.room.turn, 'a');
});

test('a captain-only team cannot start and a captain cannot forge a number or card action', t => {
  const f = fixture(t, false);
  f.room.players = f.room.players.filter(player => player.id !== 'b');
  const before = structuredClone(f.room);
  assert.throws(() => f.act('start'), /除了隊長/); assert.deepEqual(f.room, before);
  f.room.phase = 'playing'; f.room.turn = 'captain-a';
  const held = drawForNumber({ hand: f.room.teamHands['team-1'] ||= [] });
  assert.throws(() => f.act('call', 'captain-a', { number: 1 }), /觀戰/);
  assert.throws(() => f.act('cardUse', 'captain-a', { cardId: held.id }), /觀戰/);
  assert.equal(f.room.teamHands['team-1'].length, 1); assert.equal(f.room.called.length, 0);
  initializeTeamClock(f.room, 0);
  assert.equal(f.room.turn, 'a');
});

test('only the active team captain may start a hint and every viewer receives the same countdown', t => {
  const f = fixture(t), before = structuredClone(f.room);
  assert.throws(() => f.act('captainHint', 'a'), /只有隊長/);
  assert.throws(() => f.act('captainHint', 'captain-b'), /自己隊伍/);
  assert.deepEqual(f.room, before);
  assert.equal(f.snapshot('captain-a').canHint, true); assert.equal(f.snapshot('captain-b').canHint, false);
  f.time(10000); f.act('captainHint');
  assert.equal(remainingTime(f.room, 'team-1'), 470000);
  assert.equal(f.room.teamClock.activeTeamId, null); assert.equal(hintUses(f.room, 'team-1'), 2);
  const hint = f.snapshot('captain-a').hint;
  assert.equal(hint.remainingMs, 30000); assert.equal(hint.teamName, '隊伍 1');
  for (const player of f.room.players) assert.deepEqual(f.snapshot(player.id).hint, hint);
  assert.throws(() => f.act('captainHint'), /提示中/);
  assert.equal(hintUses(f.room, 'team-1'), 2);
});

test('hints freeze both clocks and resume the same member at the exact thirty-second boundary', t => {
  const f = fixture(t); f.time(10000); f.act('captainHint');
  f.time(39999); assert.equal(game.tick(f.room, 39999), false);
  assert.equal(remainingTime(f.room, 'team-1'), 470000); assert.equal(remainingTime(f.room, 'team-2'), 480000);
  f.time(40000); assert.equal(game.tick(f.room, 40000), true);
  assert.equal(f.room.hint, null); assert.equal(f.room.turn, 'a'); assert.equal(f.room.teamClock.startedAt, 40000);
  f.time(41000); assert.equal(remainingTime(f.room, 'team-1'), 469000);
});

test('delayed hint expiration charges only the time after the actual end of the countdown', t => {
  const f = fixture(t); f.time(10000); f.act('captainHint');
  f.time(50000); game.tick(f.room, 50000);
  assert.equal(f.room.teamClock.startedAt, 40000);
  assert.equal(remainingTime(f.room, 'team-1'), 460000);
});

test('each team starts with three hints and future card grants can increase only that team allowance', t => {
  const f = fixture(t);
  for (let index = 0; index < 3; index++) {
    f.time(index * 30000); f.act('captainHint');
    assert.equal(hintUses(f.room, 'team-1'), 2 - index);
    f.time((index + 1) * 30000); game.tick(f.room, (index + 1) * 30000);
  }
  const before = structuredClone(f.room);
  assert.throws(() => f.act('captainHint'), /次數已用完/); assert.deepEqual(f.room, before);
  addHintUses(f.room, 'team-1', 2); assert.equal(hintUses(f.room, 'team-1'), 2);
  assert.equal(hintUses(f.room, 'team-2'), 3);
  assert.throws(() => addHintUses(f.room, 'team-1', 0), /正整數/);
  assert.throws(() => addHintUses(f.room, 'missing-team', 1), /無效/);
  f.act('captainHint'); assert.equal(hintUses(f.room, 'team-1'), 1);
});

test('saved hints preserve their deadline and remaining uses across migration', t => {
  const f = fixture(t); f.time(10000); f.act('captainHint'); f.time(20000);
  const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
  assert.equal(saved.hint.endsAt, 40000); assert.equal(hintUses(saved, 'team-1'), 2);
  assert.equal(game.snapshot(saved, { isOnline: () => true }, 'a').hint.remainingMs, 20000);
  game.tick(saved, 40000);
  assert.equal(saved.hint, null); assert.equal(saved.turn, 'a'); assert.equal(saved.teamClock.startedAt, 40000);
});

test('hint pauses block all game actions and reset clears the hint and restores three uses', t => {
  const f = fixture(t); f.act('captainHint');
  for (const kind of ['call', 'cardUse', 'skip', 'undo', 'cardNextQuestion', 'cardFinish']) {
    const before = structuredClone(f.room);
    assert.throws(() => f.act(kind, 'a', { number: 1 }), /提示中/); assert.deepEqual(f.room, before);
  }
  f.act('reset'); assert.equal(f.room.hint, null); assert.equal(hintUses(f.room, 'team-1'), 3);
  f.room.players.filter(player => player.id !== f.room.host).forEach(player => { player.ready = true; });
  f.begin(); assert.equal(f.room.turn, 'a'); assert.equal(hintUses(f.room, 'team-1'), 3);
});

test('captains cannot start hints during card questions or outside active play', t => {
  const f = fixture(t, false);
  assert.throws(() => f.act('captainHint'), /遊戲進行中/);
  f.begin();
  const card = drawForNumber({ hand: f.room.teamHands['team-1'] ||= [] });
  f.act('cardUse', 'a', { cardId: card.id });
  const before = structuredClone(f.room);
  assert.throws(() => f.act('captainHint'), /作答期間/); assert.deepEqual(f.room, before);
  assert.equal(hintUses(f.room, 'team-1'), 3);
});
