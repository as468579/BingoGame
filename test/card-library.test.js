const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { parseCards, chooseCard, publicCard } = require('../src/shared/card-library');
const { createApplication } = require('../src/app');

test('each game owns independent card definitions even when it reuses an ID', () => {
  const bingo = require('../src/games/bingo/card-catalog'), next = require('../src/games/teambingo/card-catalog');
  const bridge = require('../src/games/bridge/card-catalog');
  assert.notEqual(bingo.cards, next.cards); assert.notEqual(bingo.cards[0], next.cards[0]);
  assert.ok(bingo.cards[0].question); assert.equal(next.cards[0].question, undefined);
  assert.deepEqual(next.cards.map(card => card.id), ['team-time-plus-2m']); assert.deepEqual(bridge.cards, []);
  const { getGame } = require('../src/games');
  assert.equal(getGame('bingo').cardLibrary, bingo.cards);
  assert.equal(getGame('teambingo').cardLibrary, next.cards);
  assert.equal(getGame('bridge-bingo').cardLibrary, bridge.cards);
  const source = [{ id: 'same', name: '卡片', options: ['甲', '乙'] }];
  const first = parseCards(source), second = parseCards(source);
  first[0].options[0] = '修改'; assert.equal(second[0].options[0], '甲'); assert.equal(source[0].options[0], '甲');
});

test('card file validation rejects malformed IDs, names, metadata and difficulty requirements', () => {
  assert.throws(() => parseCards({}), /JSON 陣列/);
  for (const invalid of [null, { id: '' }, { name: ' ' }, { enabled: 'yes' }, { effect: {} }, { questionDifficulty: 'hard' }]) {
    assert.throws(() => parseCards([invalid === null ? null : { id: 'one', name: '卡片', ...invalid }]), /第 1 張/);
  }
  assert.throws(() => parseCards([{ id: 'a', name: '甲' }, { id: ' a ', name: '乙' }]), /第 2 張.*重複/);
  assert.deepEqual(parseCards([]), []);
});

test('card selection includes enabled definitions only and allows an empty reserved library', () => {
  const cards = parseCards([{ id: 'a', name: '甲' }, { id: 'off', name: '停用', enabled: false }, { id: 'b', name: '乙' }]);
  assert.equal(chooseCard(cards, count => { assert.equal(count, 2); return 0; }).id, 'a');
  assert.equal(chooseCard(cards, () => 1).id, 'b');
  assert.throws(() => chooseCard([]), /沒有啟用/);
  assert.throws(() => chooseCard([cards[1]]), /沒有啟用/);
});

test('public card faces omit reference answers, difficulty and library control fields', () => {
  const card = { id: 'power', name: '強力卡', effect: '能力待定', answer: 1, correctAnswer: 'B', questionDifficulty: '困難', difficulty: '困難', enabled: true };
  assert.deepEqual(publicCard(card), { id: 'power', name: '強力卡', effect: '能力待定' });
  assert.equal(card.questionDifficulty, '困難');
});

for (const gameType of ['bingo', 'teambingo']) {
  test(`${gameType} cannot partially claim a number or consume a turn when its draw library is disabled`, t => {
    const catalog = require(`../src/games/${gameType === 'bingo' ? 'bingo' : 'teambingo'}/card-catalog`);
    const enabled = catalog.cards.map(card => card.enabled);
    t.after(() => catalog.cards.forEach((card, index) => { card.enabled = enabled[index]; }));
    const rooms = new Map();
    const app = createApplication({ repository: { all: () => [...rooms.values()], get: id => rooms.get(id), add: room => rooms.set(room.code, room), save() {} } });
    const token = randomUUID(), created = app.service.execute({ kind: 'create', name: 'Host', gameType, token, requestId: randomUUID() });
    const room = rooms.get(created.room.code); room.phase = 'playing'; room.turn = room.host;
    const send = data => app.service.execute({ code: room.code, token, requestId: randomUUID(), ...data });
    let data;
    if (gameType === 'bingo') { send({ kind: 'call', number: 1 }); data = { kind: 'approve', pendingId: room.pending.id }; }
    else { room.cells[0].isSpecial = true; data = { kind: 'call', number: 1 }; }
    catalog.cards.forEach(card => { card.enabled = false; });
    const before = structuredClone(room);
    assert.throws(() => send(data), /沒有啟用/);
    assert.deepEqual(room, before);
  });
}
