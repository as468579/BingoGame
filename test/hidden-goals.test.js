const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { separateHost, hostAction, setGoalOffers } = require('../scripts/test-support/team-goal-setup.cjs');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { remainingTime } = require('../src/games/teambingo/team-clock');
const { hasHiddenVictory } = require('../src/games/teambingo/victory');

function fixture(t) {
  let now = 0; t.mock.method(Date, 'now', () => now);
  const room = { ...game.initializeRoom(), code: 'GOALS', gameType: 'teambingo', phase: 'lobby', revision: 0, host: 'host', players:
    [['host', 'team-1'], ['member', 'team-1'], ['captain2', 'team-2'], ['member2', 'team-2']]
      .map(([id, teamId]) => ({ id, name: id, teamId, ready: true, hand: [] })) };
  separateHost(room);
  const act = (kind, playerId = 'host', data = {}) => { applyGameAction(room, hostAction(room, room.players.find(player => player.id === playerId), kind), { kind, ...data }, { isOnline: () => true }, now); if (kind === 'start') setGoalOffers(room); };
  const captains = () => {
    act('captain', 'host', { teamId: 'team-1', playerId: 'host' });
    act('captain', 'host', { teamId: 'team-2', playerId: 'captain2' });
  };
  const start = () => { captains(); act('start'); };
  const snapshot = id => game.snapshot(room, { isOnline: () => true }, id);
  return { room, act, captains, start, snapshot, time: value => { now = value; } };
}

test('hidden-goal setup requires a valid captain for every team without partially starting', t => {
  const f = fixture(t), before = structuredClone(f.room);
  assert.throws(() => f.act('start'), /每隊指定隊長/);
  assert.deepEqual(f.room, before);
  f.captains(); f.room.captains['team-2'] = 'member';
  assert.throws(() => f.act('start'), /每隊指定隊長/);
  assert.equal(f.room.phase, 'lobby'); assert.equal(f.room.hiddenGoals, null);
});

test('the opening selection pauses every action and all team clocks until everyone chooses', t => {
  const f = fixture(t); f.start(); f.time(900000);
  assert.equal(f.room.phase, 'choosing-goal'); assert.equal(f.room.turn, null);
  assert.equal(f.snapshot('member').goalsRemaining, 2);
  for (const kind of ['call', 'cardUse', 'skip', 'undo', 'settings', 'captain', 'start']) {
    const before = structuredClone(f.room);
    assert.throws(() => f.act(kind, 'host', { number: 1 }), /等待所有隊長/);
    assert.deepEqual(f.room, before);
  }
  assert.equal(game.tick(f.room, 900000), false);
  assert.equal(remainingTime(f.room, 'team-1'), 480000);
  assert.equal(remainingTime(f.room, 'team-2'), 480000);
});

test('only each team captain receives three selectable cards or their own chosen condition', t => {
  const f = fixture(t); f.start();
  for (const id of ['host', 'captain2']) {
    const visible = f.snapshot(id);
    assert.deepEqual(visible.hiddenGoal.options.map(card => card.id), ['anticipate-opponent', 'mathematician', 'almost-bingo']);
    assert.deepEqual(visible.hiddenGoal.options.map(card => card.name), ['料敵機先', '數學家', '就差一點點']);
    assert.equal(visible.hiddenGoals, undefined);
  }
  for (const id of ['member', 'member2']) assert.equal(f.snapshot(id).hiddenGoal, undefined);
  f.act('hiddenGoal', 'captain2', { goalId: 'anticipate-opponent' });
  assert.equal(f.snapshot('captain2').hiddenGoal.selected.id, 'anticipate-opponent');
  assert.deepEqual(f.snapshot('captain2').hiddenGoal.options, []);
  assert.equal(f.snapshot('host').hiddenGoal.selected, null);
  assert.equal(f.snapshot('member2').hiddenGoal, undefined);
  for (const id of ['host', 'member', 'captain2', 'member2']) {
    const visible = f.snapshot(id);
    assert.equal(visible.hiddenGoals, undefined);
    assert.ok(visible.teams.every(team => team.choices === undefined && team.offers === undefined));
  }
});

test('noncaptains, invalid choices and changing a completed choice are rejected atomically', t => {
  const f = fixture(t); f.start();
  for (const [id, data, error] of [
    ['member', { goalId: 'mathematician', playerId: 'host', teamId: 'team-1' }, /只有該隊隊長/],
    ['host', { goalId: 'unknown' }, /有效的隱藏/]
  ]) {
    const before = structuredClone(f.room);
    assert.throws(() => f.act('hiddenGoal', id, data), error); assert.deepEqual(f.room, before);
  }
  f.act('hiddenGoal', 'host', { goalId: 'mathematician', teamId: 'team-2' });
  assert.deepEqual(f.room.hiddenGoals.choices, { 'team-1': 'mathematician' });
  assert.throws(() => f.act('hiddenGoal', 'host', { goalId: 'anticipate-opponent' }), /無法更換/);
});

test('host reviews every selected team goal while captains and members cannot see other teams', t => {
  const f = fixture(t); f.start();
  const hostId = f.room.host;
  assert.deepEqual(f.snapshot(hostId).hostHiddenGoals.map(team => team.selected), [null, null]);
  f.act('hiddenGoal', 'host', { goalId: 'mathematician' });
  let goals = f.snapshot(hostId).hostHiddenGoals;
  assert.equal(goals[0].teamName, '隊伍 1'); assert.equal(goals[0].selected.id, 'mathematician');
  assert.equal(goals[1].selected, null);
  assert.ok(goals.every(team => !Object.hasOwn(team, 'options')));
  assert.throws(() => f.act('hiddenGoal', hostId, { goalId: 'mathematician' }), /只有該隊隊長/);
  f.act('hiddenGoal', 'captain2', { goalId: 'anticipate-opponent' });
  goals = f.snapshot(hostId).hostHiddenGoals;
  assert.deepEqual(goals.map(team => team.selected.id), ['mathematician', 'anticipate-opponent']);
  for (const id of ['host', 'captain2', 'member', 'member2']) assert.equal(f.snapshot(id).hostHiddenGoals, undefined);
  f.act('reset'); assert.equal(f.snapshot(hostId).hostHiddenGoals, undefined);
});

test('the last captain starts interleaved play with full budgets and no completed hidden condition', t => {
  const f = fixture(t); f.start(); f.time(500000);
  f.act('hiddenGoal', 'host', { goalId: 'mathematician' });
  assert.equal(f.room.phase, 'choosing-goal'); assert.equal(f.snapshot('host').goalsRemaining, 1);
  f.time(900000); f.act('hiddenGoal', 'captain2', { goalId: 'mathematician' });
  assert.equal(f.room.phase, 'playing'); assert.equal(f.room.turn, 'member');
  assert.equal(f.room.teamClock.startedAt, 900000);
  assert.equal(remainingTime(f.room, 'team-1'), 480000);
  assert.equal(remainingTime(f.room, 'team-2'), 480000);
  assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
  assert.equal(hasHiddenVictory(f.room, 'team-2'), false);
  f.act('call', 'member', { number: 1 }); assert.equal(f.room.turn, 'member2');
  f.act('undo', 'host', { revision: f.room.revision });
  assert.equal(f.room.turn, 'member');
  assert.deepEqual(f.room.hiddenGoals.choices, { 'team-1': 'mathematician', 'team-2': 'mathematician' });
});

test('save migration keeps captain choices and reset removes them without affecting existing games', t => {
  const f = fixture(t); f.start();
  f.act('hiddenGoal', 'host', { goalId: 'mathematician' });
  const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
  assert.deepEqual(saved.hiddenGoals.choices, f.room.hiddenGoals.choices);
  assert.deepEqual(saved.hiddenGoals.offers['team-1'], f.room.hiddenGoals.offers['team-1']);
  assert.equal(saved.hiddenGoals.offers['team-2'].length, 12);
  assert.equal(saved.phase, 'choosing-goal'); assert.equal(saved.teamClock.activeTeamId, null);
  assert.equal(game.snapshot(saved, { isOnline: () => true }, 'host').hiddenGoal.selected.id, 'mathematician');
  assert.equal(game.snapshot(saved, { isOnline: () => true }, 'member').hiddenGoal, undefined);
  f.act('reset'); assert.equal(f.room.hiddenGoals, null); assert.equal(f.room.phase, 'lobby');
  assert.deepEqual(f.room.captains, { 'team-1': 'host', 'team-2': 'captain2' });
  const legacy = { ...f.room, phase: 'playing', turn: 'host', teamClock: null };
  delete legacy.hiddenGoals; game.migrate(legacy);
  assert.equal(legacy.phase, 'playing'); assert.equal(legacy.hiddenGoals, undefined);
});

test('pending and unknown conditions never win even with achieved flags or six owned prime cells', t => {
  const f = fixture(t); f.start();
  [2, 3, 5, 7, 11, 13].forEach(number => Object.assign(f.room.cells.find(cell => cell.number === number), { isCovered: true, teamId: 'team-1' }));
  f.room.hiddenGoals.achieved['team-1'] = true;
  for (const id of ['pending-1', 'pending-2', 'unknown']) {
    f.room.hiddenGoals.choices['team-1'] = id;
    assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
  }
});

test('legacy pending cards also use the shared line icon without changing their saved choices', t => {
  const f = fixture(t); f.start();
  f.room.hiddenGoals.offers['team-1'].push({ id: 'pending-3', name: '待定', symbol: '?', effect: '舊條件說明' });
  f.room.hiddenGoals.choices['team-1'] = 'pending-3';
  assert.equal(f.snapshot('host').hiddenGoal.selected.symbol, 'question-mark');
  assert.equal(f.snapshot(f.room.host).hostHiddenGoals[0].selected.symbol, 'question-mark');
  assert.equal(f.room.hiddenGoals.choices['team-1'], 'pending-3');
});
