const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { goalCompleted, hasHiddenVictory, settleVictory } = require('../src/games/teambingo/victory');
const { goalProgress, publishGoalProgress, publicGoalProgress } = require('../src/games/teambingo/goal-progress');
const { availableHiddenGoals } = require('../src/games/teambingo/hidden-goals');
const { captureGameState, undoGame } = require('../src/games/teambingo/history');
function fixture(size) {
  return { ...game.initializeRoom(), size, phase: 'playing', revision: 0, players: [],
    cells: Array.from({ length: size ** 2 }, (_, i) => ({ number: i + 1, isCovered: false })),
    hiddenGoals: { requiredCount: 2, choices: { 'team-1': ['multiples-of-six', 'sage'] }, completed: {}, offers: {} } };
}
test('multiples of six counts every required cell on each supported board and ignores other teams', () => {
  for (let size = 3; size <= 9; size++) {
    const room = fixture(size), target = Math.floor(size ** 2 / 6);
    const card = availableHiddenGoals(room).find(card => card.id === 'multiples-of-six');
    assert.equal(card.name, '6的倍數'); assert.equal(card.symbol, 'math-symbols');
    assert.deepEqual(goalProgress(room, 'team-1'), { current: 0, target });
    const required = room.cells.filter(cell => cell.number % 6 === 0);
    required.forEach(cell => Object.assign(cell, { isCovered: true, teamId: 'team-1' }));
    for (const cell of required) {
      cell.teamId = 'team-2'; assert.equal(goalCompleted(room, 'team-1', 'multiples-of-six'), false);
      cell.teamId = 'team-1'; cell.isCovered = false;
      assert.equal(goalCompleted(room, 'team-1', 'multiples-of-six'), false); cell.isCovered = true;
    }
    assert.equal(goalCompleted(room, 'team-1', 'multiples-of-six'), true);
    assert.equal(hasHiddenVictory(room, 'team-1'), false, 'Other selected goals are still required');
    room.teamCorrectAnswers = { 'team-1': 4 };
    assert.equal(hasHiddenVictory(room, 'team-1'), true);
  }
});
test('multiples progress is round-delayed, saved and restored by undo', () => {
  const room = fixture(6);
  publishGoalProgress(room);
  room.history = [captureGameState(room)];
  Object.assign(room.cells[5], { isCovered: true, teamId: 'team-1' });
  assert.equal(publicGoalProgress(room, 'team-1').conditions[0].percentage, 0);
  publishGoalProgress(room);
  assert.equal(publicGoalProgress(room, 'team-1').conditions[0].percentage, 16);
  assert.deepEqual(goalProgress(JSON.parse(JSON.stringify(room)), 'team-1'), { current: 1, target: 6 });
  undoGame(room, 0);
  assert.deepEqual(goalProgress(room, 'team-1'), { current: 0, target: 6 });
  assert.equal(publicGoalProgress(room, 'team-1').conditions[0].percentage, 0);
  room.cells.filter(cell => cell.number % 6 === 0).forEach(cell => Object.assign(cell, { isCovered: true, teamId: 'team-1' }));
  settleVictory(room);
  assert.equal(room.hiddenGoals.completed['team-1']['multiples-of-six'], true);
  publishGoalProgress(room);
  assert.equal(publicGoalProgress(room, 'team-1').conditions[0].percentage, 100);
});
test('multiples of seven uses its own divisor at all sizes and shares delayed reports and undo', () => {
  for (let size = 3; size <= 9; size++) {
    const room = fixture(size), id = 'multiples-of-seven', target = Math.floor(size ** 2 / 7);
    room.hiddenGoals.choices['team-1'] = [id, 'sage'];
    const card = availableHiddenGoals(room).find(card => card.id === id);
    assert.equal(card.name, '7的倍數'); assert.equal(card.symbol, 'math-symbols');
    assert.deepEqual(goalProgress(room, 'team-1'), { current: 0, target });
    publishGoalProgress(room); room.history = [captureGameState(room)];
    const required = room.cells.filter(cell => cell.number % 7 === 0);
    required.forEach(cell => Object.assign(cell, { isCovered: true, teamId: 'team-1' }));
    for (const cell of required) {
      cell.teamId = 'team-2'; assert.equal(goalCompleted(room, 'team-1', id), false);
      cell.teamId = 'team-1'; cell.isCovered = false; assert.equal(goalCompleted(room, 'team-1', id), false); cell.isCovered = true;
    }
    assert.equal(goalCompleted(room, 'team-1', id), true);
    assert.equal(hasHiddenVictory(room, 'team-1'), false);
    assert.equal(publicGoalProgress(room, 'team-1').conditions[0].percentage, 0);
    publishGoalProgress(room);
    assert.equal(publicGoalProgress(room, 'team-1').conditions[0].percentage, 100);
    assert.deepEqual(goalProgress(JSON.parse(JSON.stringify(room)), 'team-1'), { current: target, target });
    room.teamCorrectAnswers = { 'team-1': 4 };
    assert.equal(hasHiddenVictory(room, 'team-1'), true);
    undoGame(room, 0);
    assert.deepEqual(goalProgress(room, 'team-1'), { current: 0, target });
    assert.equal(publicGoalProgress(room, 'team-1').conditions[0].percentage, 0);
  }
});
for (const [divisor, size, id] of [[6, 7, 'multiples-of-six'], [7, 6, 'multiples-of-seven']]) {
  test(`${divisor} multiples win through real number actions without a line, then undo retracts the win`, t => {
    t.mock.method(Date, 'now', () => 0);
    const { applyGameAction } = require('../src/games/teambingo/actions');
    const { teamLines } = require('../src/games/teambingo/prizes');
    const room = { ...game.initializeRoom(), code: 'MULTIPLES', host: 'host', phase: 'lobby', revision: 0,
      players: ['host', 'c1', 'a', 'c2', 'b'].map(id => ({ id, name: id, hand: [], ready: false, teamId: null })) };
    const act = (kind, data = {}, playerId = 'host') => applyGameAction(room, room.players.find(p => p.id === playerId), { kind, ...data }, { isOnline: () => false }, 0);
    act('settings', { size, hiddenGoalCount: 2 });
    act('board', { board: Array.from({ length: size ** 2 }, (_, i) => i + 1), boardVersion: room.boardVersion });
    room.cells.forEach(cell => { cell.isSpecial = false; });
    room.players.forEach(p => { if (p.id !== 'host') p.ready = true; });
    act('captain', { teamId: 'team-1', playerId: 'c1' }); act('captain', { teamId: 'team-2', playerId: 'c2' });
    act('start');
    for (const captain of ['c1', 'c2']) for (const goalId of [id, 'sage']) act('hiddenGoal', { goalId }, captain);
    const snapshot = () => game.snapshot(room, { isOnline: () => true }, 'host');
    assert.deepEqual(snapshot().teams[0].hiddenProgress.conditions[0].reward, { item: '突襲券', quantity: 14 });
    assert.deepEqual(snapshot().teams[0].bonusRewards, []);
    room.teamCorrectAnswers['team-1'] = 4;
    for (let number = divisor; number <= size ** 2; number += divisor) {
      if (room.turn === 'b') act('skip');
      assert.equal(room.phase, 'playing');
      act('call', { number }, 'a');
    }
    assert.equal(teamLines(room, 'team-1'), 0);
    assert.equal(room.phase, 'finished'); assert.equal(room.endReason, 'hidden-goal');
    assert.deepEqual(room.winners, ['team-1']);
    const rewards = [{ item: '突襲券', quantity: 14 }, { item: '突襲券', quantity: 7 }];
    assert.deepEqual(snapshot().teams[0].bonusRewards, rewards);
    assert.deepEqual(snapshot().teams[0].bonusRewards, rewards);
    const saved = JSON.parse(JSON.stringify(room)); game.migrate(saved);
    assert.deepEqual(game.snapshot(saved, { isOnline: () => true }, 'host').teams[0].bonusRewards, rewards);
    act('undo', { revision: 0 });
    assert.deepEqual(snapshot().teams[0].bonusRewards, []);
    assert.equal(room.phase, 'playing'); assert.deepEqual(room.winners, []);
    assert.equal(goalCompleted(room, 'team-1', id), false);
    assert.equal(goalProgress(room, 'team-1').current, Math.floor(size ** 2 / divisor) - 1);
  });
}
