const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createApplication } = require('../src/app');
const game = require('../src/games/teambingo');
const { participants } = require('../src/games/teambingo/participants');
const { advanceTurn } = require('../src/games/teambingo/turns');

function fixture() {
  const rooms = new Map();
  const app = createApplication({ repository: { all: () => [...rooms.values()], get: id => rooms.get(id), add: room => rooms.set(room.code, room), save() {} } });
  const token = randomUUID();
  const created = app.service.execute({ kind: 'create', name: 'Host', gameType: 'teambingo', token, requestId: randomUUID() });
  const room = rooms.get(created.room.code);
  const send = (kind, data = {}, who = token) => app.service.execute({ kind, code: room.code, token: who, requestId: randomUUID(), ...data });
  const join = name => { const result = send('join', { name }, randomUUID()); return room.players.find(player => player.id === result.playerId); };
  return { ...app, room, send, join, token };
}

test('Team Bingo host occupies no team seat and a full roster can still join and reconnect', () => {
  const f = fixture();
  assert.equal(f.room.players[0].teamId, null);
  assert.equal(f.service.snapshot(f.room, f.room.host).participantCount, 0);
  const members = Array.from({ length: 4 }, (_, index) => f.join(`P${index}`));
  assert.deepEqual(members.map(player => player.teamId), ['team-1', 'team-1', 'team-2', 'team-2']);
  assert.throws(() => f.join('Overflow'), /最多可容納 4/);
  const rejoined = f.send('join', { name: 'Host' }, randomUUID());
  assert.equal(rejoined.playerId, f.room.host);
  assert.equal(rejoined.room.participantCount, 4);
  const host = rejoined.room.players.find(player => player.id === f.room.host);
  assert.equal(host.spectating, true); assert.equal(host.participating, false);
  assert.equal(host.teamId, null); assert.deepEqual(host.hand, []);
});

test('host cannot join a team, ready, become captain, claim a cell or use a card', () => {
  const f = fixture();
  for (const [kind, data, message] of [
    ['team', { teamId: 'team-1' }, /觀戰/], ['ready', { ready: true }, /觀戰/],
    ['captain', { teamId: 'team-1', playerId: f.room.host }, /該隊成員/],
    ['call', { number: 1 }, /觀戰/], ['cardUse', { cardId: 'forged' }, /觀戰/]
  ]) {
    const before = structuredClone(f.room);
    assert.throws(() => f.send(kind, data), message);
    assert.deepEqual(f.room, before);
  }
});

test('unassigned unready host does not block starting or enter the team turn cycle', () => {
  const f = fixture(), members = ['Captain A', 'A', 'Captain B', 'B'].map(f.join);
  f.send('captain', { teamId: 'team-1', playerId: members[0].id });
  f.send('captain', { teamId: 'team-2', playerId: members[2].id });
  for (const member of members) f.send('ready', { ready: true }, member.token);
  f.send('start'); require('../scripts/test-support/team-goal-setup.cjs').setGoalOffers(f.room);
  assert.equal(f.room.phase, 'choosing-goal');
  f.send('hiddenGoal', { goalId: 'anticipate-opponent' }, members[0].token);
  f.send('hiddenGoal', { goalId: 'anticipate-opponent' }, members[2].token);
  assert.deepEqual(participants(f.room).map(player => player.id), [members[1].id, members[3].id]);
  const order = [];
  for (let i = 0; i < 4; i++) { order.push(f.room.turn); advanceTurn(f.room); }
  assert.deepEqual(order, [members[1].id, members[3].id, members[1].id, members[3].id]);
  assert.equal(f.room.players[0].ready, false);
});

test('host retains board settings, scan and reset permissions outside the player roster', () => {
  const f = fixture();
  f.send('settings', { size: 8, teamCount: 2, playersPerTeam: 1 });
  assert.equal(f.room.players[0].teamId, null);
  const member = f.join('Member');
  f.send('board', { board: [...f.room.board].reverse(), boardVersion: f.room.boardVersion });
  assert.equal(f.room.board[0], 64);
  f.send('scan');
  assert.equal(f.room.players.length, 1); assert.equal(f.room.lastScanRemovedCount, 1);
  assert.notEqual(member.id, f.room.host);
  f.send('reset'); assert.equal(f.room.players[0].teamId, null);
});

test('saved host roles migrate without losing board ownership or transferring private captain goals', () => {
  const f = fixture(), host = f.room.players[0];
  host.teamId = 'team-1'; host.ready = true;
  f.room.captains['team-1'] = host.id;
  Object.assign(f.room.cells[0], { isCovered: true, teamId: 'team-1', playerId: host.id });
  const cells = structuredClone(f.room.cells);
  game.migrate(f.room);
  assert.equal(host.teamId, null); assert.equal(host.ready, false);
  assert.equal(f.room.captains['team-1'], undefined);
  assert.deepEqual(f.room.cells, cells);
  const saved = structuredClone(f.room); game.migrate(f.room);
  assert.deepEqual(f.room, saved);
});

test('host exclusion is specific to Team Bingo and other games retain their host players', () => {
  const { createRoom, joinRoom } = require('../src/domain/room');
  for (const gameType of ['bingo', 'bridge-bingo']) {
    const room = createRoom('OTHER', 'create', gameType);
    const host = joinRoom(room, 'Host', randomUUID());
    assert.equal(room.host, host.id);
    if (gameType === 'bridge-bingo') assert.equal(host.teamId, 'team-1');
    else assert.equal(host.board.length, 25);
  }
});

test('legacy captain-host selection returns to setup so a real team captain can be assigned', () => {
  const f = fixture();
  f.room.phase = 'choosing-goal'; f.room.players[0].teamId = 'team-1';
  f.room.captains['team-1'] = f.room.host;
  f.room.hiddenGoals = { choices: {}, offers: {} };
  game.migrate(f.room);
  assert.equal(f.room.phase, 'lobby'); assert.equal(f.room.hiddenGoals, null);
  assert.equal(f.room.teamClock, null); assert.equal(f.room.players[0].teamId, null);
});
