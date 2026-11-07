const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { publishGoalProgress, publicGoalProgress } = require('../src/games/teambingo/goal-progress');
const { completeTurn } = require('../src/games/teambingo/rounds');
const { captureGameState, undoGame } = require('../src/games/teambingo/history');

function fixture() {
  const room = { ...game.initializeRoom(), code: 'REPORT', host: 'host', phase: 'playing', revision: 0,
    players: ['a', 'b', 'c'].map((id, i) => ({ id, name: id, teamId: i === 1 ? 'team-2' : 'team-1', hand: [] })),
    roundNumber: 1, roundActedIds: [], turn: 'a' };
  room.hiddenGoals = { requiredCount: 2, choices: { 'team-1': ['mathematician', 'sage'], 'team-2': ['four-corners', 'round-44'] }, completed: {}, offers: {} };
  publishGoalProgress(room); room.hiddenGoals.publicProgressRound = 0;
  return room;
}
test('anonymous reports stay frozen until all participants finish, including unequal teams', () => {
  const room = fixture(), before = publicGoalProgress(room, 'team-1');
  room.cells.find(cell => cell.number === 2).isCovered = true;
  room.cells.find(cell => cell.number === 2).teamId = 'team-1';
  completeTurn(room);
  room.turn = 'b'; completeTurn(room);
  room.turn = 'a'; completeTurn(room);
  assert.deepEqual(publicGoalProgress(room, 'team-1'), before);
  room.turn = 'c'; completeTurn(room);
  assert.equal(room.roundNumber, 2);
  assert.equal(publicGoalProgress(room, 'team-1').round, 1);
  assert.equal(publicGoalProgress(room, 'team-1').conditions[0].percentage, 20);
  room.teamCorrectAnswers = { 'team-1': 2 };
  assert.equal(publicGoalProgress(room, 'team-1').conditions[1].percentage, 0);
});
test('round sums publish before resetting the round and completed conditions remain completed', () => {
  const room = fixture();
  Object.assign(room.cells[0], { isCovered: true, teamId: 'team-2', number: 30, claimedRound: 1 });
  Object.assign(room.cells[1], { isCovered: true, teamId: 'team-2', number: 14, claimedRound: 1 });
  room.roundActedIds = ['a', 'b']; room.turn = 'c'; completeTurn(room);
  assert.deepEqual(publicGoalProgress(room, 'team-2').conditions[1], { percentage: 100, reward: { item: '超級藥水', quantity: 1000 } });
  room.hiddenGoals.completed['team-2'] = { 'round-44': true };
  publishGoalProgress(room);
  assert.equal(publicGoalProgress(room, 'team-2').conditions[1].percentage, 100);
});
test('reports expose no condition identities and survive saves and undo', () => {
  const room = fixture();
  const report = publicGoalProgress(room, 'team-1');
  assert.doesNotMatch(JSON.stringify(report), /mathematician|sage|name|effect|symbol|current|target/);
  room.history = [captureGameState(room)];
  room.teamCorrectAnswers = { 'team-1': 3 }; publishGoalProgress(room);
  undoGame(room, 0);
  assert.deepEqual(publicGoalProgress(room, 'team-1'), report);
  assert.deepEqual(publicGoalProgress(JSON.parse(JSON.stringify(room)), 'team-1'), report);
  delete room.hiddenGoals.publicProgress;
  assert.ok(publicGoalProgress(room, 'team-1').conditions.every(item => item.percentage === 0));
});
test('all viewers receive the same anonymous reports for every team', () => {
  const room = fixture();
  const snapshot = id => game.snapshot(room, { isOnline: () => true }, id);
  const expected = snapshot('a').teams.map(team => team.hiddenProgress);
  for (const id of ['b', 'c', 'host']) assert.deepEqual(snapshot(id).teams.map(team => team.hiddenProgress), expected);
  room.phase = 'lobby';
  assert.equal(publicGoalProgress(room, 'team-1'), null);
});
test('public reports show integer percentages only and reserve 100 percent for completed conditions', () => {
  const room = fixture();
  room.hiddenGoals.publicProgress['team-1'] = [
    { current: 1, target: 3, completed: false },
    { current: 90, target: 66, completed: false }
  ];
  assert.deepEqual(publicGoalProgress(room, 'team-1').conditions, [{ percentage: 33, reward: { item: '突襲券', quantity: 14 } }, { percentage: 99, reward: { item: '突襲券', quantity: 7 } }]);
  room.hiddenGoals.publicProgress['team-1'][1].completed = true;
  assert.equal(publicGoalProgress(room, 'team-1').conditions[1].percentage, 100);
});
test('44, 55 and 66 use zero-of-one progress and old reports cannot reveal partial sums or live completions', () => {
  const { goalProgress } = require('../src/games/teambingo/goal-progress');
  for (const target of [44, 55, 66]) {
    const room = fixture(), id = `round-${target}`;
    room.hiddenGoals.choices['team-2'] = [id];
    Object.assign(room.cells[0], { isCovered: true, teamId: 'team-2', number: 11, claimedRound: 1 });
    assert.deepEqual(goalProgress(room, 'team-2', id), { current: 0, target: 1 });
    room.hiddenGoals.publicProgress['team-2'] = [{ current: 11, target, completed: false }];
    assert.equal(publicGoalProgress(room, 'team-2').conditions[0].percentage, 0);
    Object.assign(room.cells[1], { isCovered: true, teamId: 'team-2', number: target - 11, claimedRound: 1 });
    assert.deepEqual(goalProgress(room, 'team-2', id), { current: 1, target: 1 });
    assert.equal(publicGoalProgress(room, 'team-2').conditions[0].percentage, 0);
    publishGoalProgress(room);
    assert.equal(publicGoalProgress(room, 'team-2').conditions[0].percentage, 100);
  }
});
