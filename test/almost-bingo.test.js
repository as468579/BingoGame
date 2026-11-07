const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { setGoalOffers } = require('../scripts/test-support/team-goal-setup.cjs');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { hasHiddenVictory, bestOwnedLine } = require('../src/games/teambingo/victory');
const { prizeLines, teamLines } = require('../src/games/teambingo/prizes');

function fixture(size = 6) {
  const room = { ...game.initializeRoom(), code: 'ALMOST', phase: 'lobby', host: 'host', revision: 0, players: [
    { id: 'host', teamId: null, ready: false, hand: [] },
    ...[['c1', 'team-1'], ['a1', 'team-1'], ['c2', 'team-2'], ['b1', 'team-2']].map(([id, teamId]) => ({ id, name: id, teamId, ready: true, hand: [] }))
  ] };
  const act = (kind, data = {}, id = 'host') => applyGameAction(room, room.players.find(player => player.id === id), { kind, ...data }, { isOnline: () => true });
  if (size !== 6) act('settings', { size, teamCount: 2, playersPerTeam: 2 });
  const start = () => {
    room.players.forEach(player => { if (player.id !== room.host) player.ready = true; });
    act('captain', { teamId: 'team-1', playerId: 'c1' }); act('captain', { teamId: 'team-2', playerId: 'c2' });
    act('start'); setGoalOffers(room);
  };
  start();
  const snapshot = viewer => game.snapshot(room, { isOnline: () => true }, viewer);
  const choose = () => {
    act('hiddenGoal', { goalId: 'almost-bingo' }, 'c1');
    act('hiddenGoal', { goalId: 'anticipate-opponent' }, 'c2');
    room.cells.forEach(cell => { cell.isSpecial = false; });
  };
  const cover = (number, teamId = 'team-1') => Object.assign(room.cells.find(cell => cell.number === number), { isCovered: true, teamId, playerId: teamId === 'team-1' ? 'a1' : 'b1' });
  return { room, act, snapshot, choose, cover, start };
}

test('all board sizes show the actual n minus one target in offered, selected and host-reviewed cards', () => {
  for (let size = 3; size <= 9; size++) {
    const f = fixture(size), options = f.snapshot('c1').hiddenGoal.options;
    assert.equal(options.length, 3);
    const card = options.find(card => card.id === 'almost-bingo');
    assert.equal(card.name, '就差一點點'); assert.equal(card.symbol, 'near-line');
    assert.ok(card.effect.includes(`至少${size - 1}個數字格`)); assert.ok(!card.effect.includes('(n-1)'));
    f.choose();
    assert.equal(f.snapshot('c1').hiddenGoal.selected.effect, card.effect);
    assert.equal(f.snapshot('host').hostHiddenGoals[0].selected.effect, card.effect);
    assert.deepEqual(f.snapshot('c1').hiddenGoal.progress, { current: 0, target: size - 1 });
  }
});

test('every line wins only with consecutive n minus one cells from either end at all sizes', () => {
  for (let size = 3; size <= 9; size++) for (const line of prizeLines(size)) for (const offset of [0, 1]) {
    const f = fixture(size); f.choose();
    line.indices.slice(offset, offset + size - 2).forEach(index => f.cover(f.room.cells[index].number));
    assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
    const number = f.room.cells[line.indices[offset + size - 2]].number;
    f.act('call', { number }, 'a1');
    assert.equal(teamLines(f.room, 'team-1'), 0);
    assert.equal(f.room.phase, 'finished'); assert.deepEqual(f.room.winners, ['team-1']);
    assert.equal(f.room.endReason, 'hidden-goal');
  }
});

test('scattered cells and gaps within a line never combine into consecutive progress', () => {
  const f = fixture(); f.choose(); [1, 9, 17, 25, 33].forEach(number => f.cover(number));
  assert.equal(bestOwnedLine(f.room, 'team-1'), 1);
  assert.equal(hasHiddenVictory(f.room, 'team-1'), false);
  for (let size = 3; size <= 9; size++) for (const line of prizeLines(size)) {
    for (let gap = 1; gap < size - 1; gap++) for (const opposing of [false, true]) {
      const broken = fixture(size); broken.choose();
      line.indices.forEach((index, position) => {
        if (position !== gap) broken.cover(broken.room.cells[index].number);
        else if (opposing) broken.cover(broken.room.cells[index].number, 'team-2');
      });
      const longest = Math.max(gap, size - gap - 1);
      assert.equal(bestOwnedLine(broken.room, 'team-1'), longest);
      assert.equal(hasHiddenVictory(broken.room, 'team-1'), false);
      assert.deepEqual(broken.snapshot('c1').hiddenGoal.progress, { current: longest, target: size - 1 });
    }
  }
});

test('the final non-team square may be occupied by an opponent without blocking this condition', () => {
  const f = fixture(); f.choose(); [1, 2, 3, 4].forEach(number => f.cover(number));
  f.cover(6, 'team-2');
  f.act('call', { number: 5 }, 'a1');
  assert.equal(f.room.phase, 'finished'); assert.deepEqual(f.room.winners, ['team-1']);
  assert.equal(f.room.linePrizes[0].claimedBy, null);
  assert.equal(f.room.cells[5].teamId, 'team-2');
});

test('only the team selecting the condition benefits from its own near-complete lines', () => {
  const f = fixture(); f.choose(); [1, 2, 3, 4, 5].forEach(number => f.cover(number, 'team-2'));
  assert.equal(bestOwnedLine(f.room, 'team-1'), 0); assert.equal(bestOwnedLine(f.room, 'team-2'), 5);
  assert.equal(hasHiddenVictory(f.room, 'team-1'), false); assert.equal(hasHiddenVictory(f.room, 'team-2'), false);
});

test('undo removes a near-line victory and returns progress to the previous count', () => {
  const f = fixture(); f.choose(); [1, 2, 3, 4].forEach(number => f.cover(number));
  assert.deepEqual(f.snapshot('a1').teams[0].hiddenProgress.conditions[0].reward, { item: '飄雪結晶', quantity: 50 });
  assert.deepEqual(f.snapshot('a1').teams[0].bonusRewards, []);
  f.act('call', { number: 5 }, 'a1');
  const reward = [{ item: '飄雪結晶', quantity: 50 }];
  assert.deepEqual(f.snapshot('host').teams[0].bonusRewards, reward);
  assert.deepEqual(f.snapshot('a1').teams[0].bonusRewards, reward);
  const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
  assert.deepEqual(game.snapshot(saved, { isOnline: () => true }, 'a1').teams[0].bonusRewards, reward);
  f.act('undo', { revision: f.room.revision });
  assert.deepEqual(f.snapshot('host').teams[0].bonusRewards, []);
  assert.equal(f.room.phase, 'playing'); assert.deepEqual(f.room.winners, []);
  assert.equal(f.room.endReason, null); assert.equal(f.room.cells[4].isCovered, false);
  assert.deepEqual(f.snapshot('c1').hiddenGoal.progress, { current: 4, target: 5 });
});

test('saved dynamic descriptions and progress remain visible only to the captain and host', () => {
  const f = fixture(7); f.choose(); [1, 2, 3].forEach(number => f.cover(number));
  const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
  const own = game.snapshot(saved, { isOnline: () => true }, 'c1');
  assert.ok(own.hiddenGoal.selected.effect.includes('至少6個數字格'));
  assert.deepEqual(own.hiddenGoal.progress, { current: 3, target: 6 });
  assert.deepEqual(f.snapshot('host').hostHiddenGoals[0].progress, own.hiddenGoal.progress);
  for (const viewer of ['a1', 'b1']) {
    assert.equal(f.snapshot(viewer).hiddenGoal, undefined); assert.equal(f.snapshot(viewer).hostHiddenGoals, undefined);
  }
});

test('reset and a new board size rebuild the displayed target instead of keeping the previous number', () => {
  const f = fixture(); f.choose(); f.cover(1);
  f.act('reset'); f.act('settings', { size: 4, teamCount: 2, playersPerTeam: 2 }); f.start(); f.choose();
  assert.ok(f.snapshot('c1').hiddenGoal.selected.effect.includes('至少3個數字格'));
  assert.deepEqual(f.snapshot('c1').hiddenGoal.progress, { current: 0, target: 3 });
});
