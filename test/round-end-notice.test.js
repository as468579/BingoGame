const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { completeTurn } = require('../src/games/teambingo/rounds');
const { initializeTeamClock, remainingTime } = require('../src/games/teambingo/team-clock');
function fixture() {
  const room = { ...game.initializeRoom(), code: 'ROUND', host: 'host', phase: 'playing', revision: 0, turn: 'a',
    captains: { 'team-1': 'c1', 'team-2': 'c2' }, players: [['host', null], ['c1', 'team-1'], ['a', 'team-1'], ['c2', 'team-2'], ['b', 'team-2']]
      .map(([id, teamId]) => ({ id, name: id, teamId, hand: [] })), roundNumber: 1, roundActedIds: [] };
  room.board = Array.from({ length: 36 }, (_, i) => i + 1);
  room.cells = room.board.map(number => ({ number, isCovered: false, isSpecial: false }));
  initializeTeamClock(room, 0);
  const act = (kind, data = {}, id = 'host', now = 0) => applyGameAction(room, room.players.find(p => p.id === id), { kind, ...data }, { isOnline: () => true }, now);
  return { room, act, snapshot: id => game.snapshot(room, { isOnline: () => true }, id) };
}
test('round end broadcasts one event to every viewer and the next team clock keeps running', t => {
  t.mock.method(Date, 'now', () => 2000);
  const f = fixture();
  f.act('call', { number: 1 }, 'a', 1000); assert.equal(f.room.lastRoundEnd, undefined);
  f.act('call', { number: 2 }, 'b', 2000);
  assert.equal(f.room.roundNumber, 2); assert.equal(f.room.turn, 'a');
  const event = f.room.lastRoundEnd;
  assert.ok(event.id); assert.equal(event.round, 1); assert.equal(event.nextRound, 2);
  for (const viewer of ['host', 'c1', 'a', 'c2', 'b']) assert.deepEqual(f.snapshot(viewer).roundEnd, event);
  assert.equal(remainingTime(f.room, 'team-1', 3000), 478000);
  assert.equal(f.room.phase, 'playing');
  const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
  assert.deepEqual(game.snapshot(saved, { isOnline: () => true }, 'a').roundEnd, event);
  f.act('undo', { revision: 0 }); assert.equal(f.room.roundNumber, 1); assert.equal(f.room.lastRoundEnd, null);
  f.act('call', { number: 2 }, 'b', 2000); assert.notEqual(f.room.lastRoundEnd.id, event.id);
  f.act('reset'); assert.equal(f.room.lastRoundEnd, null);
});
test('unequal team sizes and captains never end the round before every active member acts', () => {
  const f = fixture();
  f.room.players.push({ id: 'a2', teamId: 'team-1' }, { id: 'a3', teamId: 'team-1' }, { id: 'b2', teamId: 'team-2' });
  for (const id of ['a', 'b', 'a2', 'b2', 'a']) { f.room.turn = id; completeTurn(f.room); assert.equal(f.room.lastRoundEnd, undefined); }
  f.room.turn = 'a3'; completeTurn(f.room);
  assert.equal(f.room.lastRoundEnd.round, 1); assert.equal(f.room.roundNumber, 2);
});
test('winning on the final member action prioritizes game settlement over round notifications', () => {
  const f = fixture();
  f.room.turn = 'b'; f.room.roundActedIds = ['a'];
  f.room.cells.slice(0, 5).forEach(cell => Object.assign(cell, { isCovered: true, teamId: 'team-2' }));
  f.act('call', { number: 6 }, 'b');
  assert.equal(f.room.phase, 'finished'); assert.equal(f.room.lastRoundEnd, undefined);
});
