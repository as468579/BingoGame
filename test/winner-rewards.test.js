const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { applyGameAction } = require('../src/games/teambingo/actions');
function fixture() {
  const room = { ...game.initializeRoom(), code: 'WINNER', host: 'host', phase: 'playing', revision: 0,
    turn: 'a', captains: { 'team-1': 'c1', 'team-2': 'c2' },
    players: [['host', null], ['c1', 'team-1'], ['a', 'team-1'], ['c2', 'team-2'], ['b', 'team-2']].map(([id, teamId]) => ({ id, name: id, teamId, hand: [] })) };
  room.board = Array.from({ length: 36 }, (_, i) => i + 1);
  room.cells = room.board.map(number => ({ number, isCovered: number <= 5, ...(number <= 5 ? { teamId: 'team-1' } : {}), isSpecial: false }));
  room.called = [1, 2, 3, 4, 5];
  const act = (kind, data = {}, id = 'host') => applyGameAction(room, room.players.find(p => p.id === id), { kind, ...data }, { isOnline: () => true }, 0);
  const snapshot = id => game.snapshot(room, { isOnline: () => true }, id);
  const win = () => act('call', { number: 6 }, 'a');
  return { room, act, snapshot, win };
}
test('only a winning captain can select exactly one valid reward in the current settlement', () => {
  const f = fixture();
  assert.throws(() => f.act('winnerReward', { item: '龍王項鍊' }, 'c1'), /獲勝隊伍/);
  f.win();
  const sessionId = f.room.winnerRewardSessionId;
  assert.equal(f.snapshot('c1').teams[0].winnerReward.canChoose, true);
  for (const id of ['host', 'a', 'c2', 'b']) {
    assert.equal(f.snapshot(id).teams[0].winnerReward.canChoose, false);
    const before = structuredClone(f.room);
    assert.throws(() => f.act('winnerReward', { item: '龍王項鍊', sessionId }, id), /隊長|獲勝隊伍/);
    assert.deepEqual(f.room, before);
  }
  assert.throws(() => f.act('winnerReward', { item: '龍王項鍊', sessionId: 'old' }, 'c1'), /結算已更新/);
  assert.throws(() => f.act('winnerReward', { item: '超級藥水', sessionId }, 'c1'), /請選擇/);
  f.act('winnerReward', { item: '龍王項鍊', sessionId, quantity: 999, teamId: 'team-2' }, 'c1');
  for (const id of ['host', 'c1', 'a', 'c2']) {
    assert.deepEqual(f.snapshot(id).teams[0].bonusRewards, [{ item: '龍王項鍊', quantity: 1 }]);
    assert.equal(f.snapshot(id).teams[0].winnerReward.canChoose, false);
  }
  assert.throws(() => f.act('winnerReward', { item: '楓葉祝福20', sessionId }, 'c1'), /已選擇/);
});
test('both options persist through reconnect and undo clears them and invalidates the old settlement', () => {
  for (const item of ['龍王項鍊', '楓葉祝福20']) {
    const f = fixture(); f.win(); const sessionId = f.room.winnerRewardSessionId;
    f.act('winnerReward', { item, sessionId }, 'c1');
    const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
    assert.deepEqual(game.snapshot(saved, { isOnline: () => true }, 'c1').teams[0].winnerReward.selected, { item, quantity: 1 });
    f.act('undo', { revision: 0 });
    assert.deepEqual(f.room.winnerRewards, {}); assert.equal(f.room.winnerRewardSessionId, null);
    assert.equal(f.snapshot('c1').teams[0].winnerReward, null);
    f.win(); assert.notEqual(f.room.winnerRewardSessionId, sessionId);
    assert.throws(() => f.act('winnerReward', { item, sessionId }, 'c1'), /結算已更新/);
    f.act('reset'); assert.deepEqual(f.room.winnerRewards, {}); assert.equal(f.room.winnerRewardSessionId, null);
  }
});
test('tied winning teams choose independently and draws have no winner reward', () => {
  const f = fixture(); f.win(); f.room.winners.push('team-2');
  const sessionId = f.room.winnerRewardSessionId;
  f.act('winnerReward', { item: '龍王項鍊', sessionId }, 'c1');
  f.act('winnerReward', { item: '楓葉祝福20', sessionId }, 'c2');
  assert.deepEqual(f.room.winnerRewards, { 'team-1': '龍王項鍊', 'team-2': '楓葉祝福20' });
  f.room.winners = []; f.room.endReason = 'board-full-draw';
  assert.ok(f.snapshot('host').teams.every(team => team.winnerReward === null && !team.bonusRewards.length));
});
test('winning reward remains additive to line prizes and completed hidden rewards', () => {
  const f = fixture();
  f.room.hiddenGoals = { requiredCount: 1, choices: { 'team-1': 'consecutive-numbers' }, offers: {}, completed: { 'team-1': { 'consecutive-numbers': true } } };
  f.win();
  f.act('winnerReward', { item: '楓葉祝福20', sessionId: f.room.winnerRewardSessionId }, 'c1');
  const rewards = f.snapshot('host').teams[0].bonusRewards;
  assert.deepEqual(rewards, [{ item: '楓葉祝福20', quantity: 1 }, { item: '楓葉祝福20', quantity: 1 }]);
  assert.ok(f.snapshot('host').teams[0].rewards.length > 0);
});
