const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { startTurn, advanceTurn } = require('../src/games/teambingo/turns');
const { completeTurn } = require('../src/games/teambingo/rounds');
const { captureGameState, undoGame } = require('../src/games/teambingo/history');
function fixture(counts) {
  const room = { ...game.initializeRoom(), phase: 'playing', revision: 0, host: 'host', teamCount: counts.length,
    players: [{ id: 'host', teamId: null, hand: [] }], captains: {} };
  counts.forEach((count, index) => {
    const teamId = `team-${index + 1}`, captain = `captain-${index + 1}`;
    room.captains[teamId] = captain; room.players.push({ id: captain, teamId, hand: [] });
    for (let seat = 1; seat <= count; seat++) room.players.push({ id: `${teamId}-${seat}`, teamId, hand: [] });
  });
  startTurn(room); return room;
}
for (const counts of [[3, 2], [2, 3], [1, 3], [3, 1], [2, 2], [3, 1, 2]]) {
  test(`teams ${counts.join('/')} each receive the largest team's action count in every round`, () => {
    const room = fixture(counts), perRound = Math.max(...counts) * counts.length;
    for (let action = 0; action < perRound * 4; action++) {
      const teamIndex = action % counts.length;
      assert.equal(room.turn, `team-${teamIndex + 1}-${Math.floor(action / counts.length) % counts[teamIndex] + 1}`);
      assert.equal(room.roundNumber, Math.floor(action / perRound) + 1);
      advanceTurn(room);
      assert.equal(room.roundNumber, Math.floor((action + 1) / perRound) + 1);
      if ((action + 1) % perRound === 0) {
        assert.deepEqual(room.roundActionCounts, {});
        assert.equal(room.lastRoundEnd.round, Math.floor((action + 1) / perRound));
      }
    }
  });
}
test('undo and save restoration retain repeated actions by the smaller team', () => {
  const room = fixture([3, 2]);
  for (let action = 0; action < 5; action++) advanceTurn(room);
  assert.deepEqual(room.roundActionCounts, { 'team-1': 3, 'team-2': 2 });
  room.history = [captureGameState(room)];
  const saved = JSON.parse(JSON.stringify(room));
  advanceTurn(saved); assert.equal(saved.roundNumber, 2);
  const eventId = saved.lastRoundEnd.id;
  undoGame(saved, 0);
  assert.equal(saved.roundNumber, 1);
  assert.deepEqual(saved.roundActionCounts, { 'team-1': 3, 'team-2': 2 });
  advanceTurn(saved); assert.equal(saved.roundNumber, 2); assert.notEqual(saved.lastRoundEnd.id, eventId);
});
test('legacy round metadata can seed team counts while captains and host actions are ignored', () => {
  const room = fixture([3, 2]);
  delete room.roundActionCounts;
  room.roundActedIds = ['team-1-1', 'team-2-1', 'team-1-2', 'team-2-2', 'team-1-3'];
  for (const id of ['host', 'captain-1', 'captain-2']) {
    room.turn = id; completeTurn(room); assert.equal(room.roundNumber, 1);
  }
  room.turn = 'team-2-1'; completeTurn(room);
  assert.equal(room.roundNumber, 2); assert.deepEqual(room.roundActionCounts, {});
});
