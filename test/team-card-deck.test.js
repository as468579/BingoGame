const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { cards } = require('../src/games/teambingo/card-catalog');
const poolSize = cards.reduce((sum, card) => sum + card.copiesPerGame, 0);
const { drawRoomCard, migrateDrawCounts } = require('../src/games/teambingo/card-deck');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { publicCard, parseCards } = require('../src/shared/card-library');
const { drawForNumber } = require('../src/games/teambingo/card-actions');

function fixture() {
  return { ...game.initializeRoom(), phase: 'playing', host: 'host', turn: 'a', revision: 0, players: [
    { id: 'host', teamId: null, hand: [] }, { id: 'a', teamId: 'team-1', hand: [] }, { id: 'b', teamId: 'team-2', hand: [] }
  ] };
}
const act = (room, kind, data = {}, id = room.turn) => applyGameAction(room, room.players.find(player => player.id === id), { kind, ...data }, { isOnline: () => true });

test('each Team Bingo card has two copies and copy metadata is validated and kept private', () => {
  assert.equal(cards.length, 5); assert.ok(cards.every(card => card.copiesPerGame === 2));
  assert.ok(cards.every(card => publicCard(card).copiesPerGame === undefined));
  for (const value of [-1, 1.5, '2', null]) assert.throws(() => parseCards([{ id: 'bad', name: 'Bad', copiesPerGame: value }]), /copiesPerGame/);
  assert.equal(parseCards([{ id: 'zero', name: 'Zero', copiesPerGame: 0 }])[0].copiesPerGame, 0);
});

test('one shared finite card pool draws without replacement and returns no card when exhausted', () => {
  const room = fixture(), drawn = [], sizes = [];
  for (let i = 0; i < poolSize; i++) drawn.push(drawRoomCard(room, size => { sizes.push(size); return 0; }).id);
  assert.deepEqual(sizes, Array.from({ length: poolSize }, (_, i) => poolSize - i));
  assert.deepEqual(drawn, cards.flatMap(card => [card.id, card.id]));
  const before = structuredClone(room);
  assert.equal(drawRoomCard(room, () => { throw Error('empty pool must not sample'); }), null);
  assert.deepEqual(room, before);
});

test('teams share quotas and exhausted special cells still occupy, advance and do not award another card', () => {
  const room = fixture(); room.cells.slice(0, poolSize + 1).forEach(cell => { cell.isSpecial = true; });
  for (let number = 1; number <= poolSize + 1; number++) act(room, 'call', { number });
  assert.equal(Object.values(room.cardDrawCounts).reduce((a, b) => a + b, 0), poolSize);
  assert.ok(Object.values(room.cardDrawCounts).every(count => count === 2));
  assert.equal(Object.values(room.teamHands).flat().length, poolSize);
  assert.equal(room.lastDecision.drawnCardId, null);
  assert.equal(room.cells[poolSize].isCovered, true); assert.equal(room.cells[poolSize].teamId, 'team-1');
  assert.equal(room.turn, 'b'); assert.equal(room.called.length, poolSize + 1);
  assert.equal(game.snapshot(room, { isOnline: () => true }, 'host').lastDraw, null);
});

test('undo restores the card quota and hand together, including undo after exhaustion', () => {
  const room = fixture(); room.cells.slice(0, 2).forEach(cell => { cell.isSpecial = true; });
  room.cardDrawCounts = Object.fromEntries(cards.map(card => [card.id, 2]));
  room.cardDrawCounts[cards[2].id] = 1;
  act(room, 'call', { number: 1 });
  assert.equal(room.teamHands['team-1'][0].definitionId, cards[2].id);
  act(room, 'call', { number: 2 }); assert.equal(room.lastDecision.drawnCardId, null);
  act(room, 'undo', { revision: room.revision }, 'host');
  assert.equal(room.cardDrawCounts[cards[2].id], 2);
  act(room, 'undo', { revision: room.revision }, 'host');
  assert.equal(room.cardDrawCounts[cards[2].id], 1); assert.deepEqual(room.teamHands, {});
  assert.equal(room.cells[0].isCovered, false);
  act(room, 'call', { number: 1 }); assert.equal(room.cardDrawCounts[cards[2].id], 2);
});

test('using or discarding an awarded card does not return its copy to the pool', () => {
  const room = fixture(), definition = drawRoomCard(room, () => 0);
  const held = drawForNumber({ hand: room.teamHands['team-1'] ||= [] }, definition);
  act(room, 'cardUse', { cardId: held.id });
  act(room, 'cardFinish', { cardSessionId: room.activeCard.id }, 'host');
  assert.equal(room.cardDrawCounts[definition.id], 1);
  assert.equal(room.teamHands['team-1'].length, 0);
  drawRoomCard(room, () => 0); assert.equal(room.cardDrawCounts[definition.id], 2);
  assert.notEqual(drawRoomCard(room, () => 0).id, definition.id);
});

test('legacy saves recover known used and held copies once and preserve counters across migration', () => {
  const room = fixture(); delete room.cardDrawCounts;
  const held = { id: 'instance', definitionId: cards[0].id };
  room.history = [{ teamHands: { 'team-1': [held] } }, { teamHands: {}, activeCard: { returnCard: held } }];
  room.teamHands = { 'team-2': [{ id: 'another', definitionId: cards[0].id }] };
  migrateDrawCounts(room);
  assert.equal(room.cardDrawCounts[cards[0].id], 2);
  assert.equal(room.history[0].cardDrawCounts[cards[0].id], 1);
  assert.notEqual(drawRoomCard(room, () => 0).id, cards[0].id);
  const saved = JSON.parse(JSON.stringify(room)); game.migrate(saved);
  assert.deepEqual(saved.cardDrawCounts, room.cardDrawCounts);
  const counts = structuredClone(saved.cardDrawCounts); game.migrate(saved);
  assert.deepEqual(saved.cardDrawCounts, counts);
});

test('reset and host settings refill the pool while other rooms remain independent', () => {
  const room = fixture(), other = fixture();
  for (let i = 0; i < poolSize; i++) drawRoomCard(room, () => 0);
  assert.deepEqual(other.cardDrawCounts, {});
  act(room, 'reset', {}, 'host'); assert.deepEqual(room.cardDrawCounts, {});
  for (let i = 0; i < poolSize; i++) drawRoomCard(room, () => 0);
  act(room, 'settings', { size: 8, teamCount: 2, playersPerTeam: 2 }, 'host');
  assert.deepEqual(room.cardDrawCounts, {}); assert.equal(drawRoomCard(room, () => 0).id, cards[0].id);
});

test('drawing the final available position respects each card quota until the whole pool is empty', () => {
  const room = fixture(), drawn = [];
  for (let i = 0; i < poolSize; i++) drawn.push(drawRoomCard(room, bound => bound - 1).id);
  assert.deepEqual(drawn, [...cards].reverse().flatMap(card => [card.id, card.id]));
  assert.equal(drawRoomCard(room), null);
  assert.ok(Object.values(room.cardDrawCounts).every(count => count === 2));
});

test('disabled, zero-copy and exhausted cards cannot occupy a remaining draw position', t => {
  const settings = cards.map(card => ({ enabled: card.enabled, copiesPerGame: card.copiesPerGame }));
  t.after(() => cards.forEach((card, index) => Object.assign(card, settings[index])));
  cards[1].enabled = false; cards[2].copiesPerGame = 0;
  const room = fixture(); room.cardDrawCounts = { [cards[3].id]: 2, [cards[4].id]: 1 };
  assert.equal(drawRoomCard(room, bound => { assert.equal(bound, 3); return bound - 1; }).id, cards[4].id);
  assert.equal(drawRoomCard(room, () => 0).id, cards[0].id);
  assert.equal(drawRoomCard(room, () => 0).id, cards[0].id);
  assert.equal(drawRoomCard(room), null);
  assert.equal(room.cardDrawCounts[cards[1].id], undefined);
  assert.equal(room.cardDrawCounts[cards[2].id], undefined);
});

test('invalid, unauthorized and occupied number requests cannot spend card quotas', () => {
  const room = fixture(); room.cells[0].isSpecial = true;
  for (const [number, player] of [[1, 'host'], [1, 'b'], [0, 'a'], [37, 'a']]) {
    const before = structuredClone(room);
    assert.throws(() => act(room, 'call', { number }, player));
    assert.deepEqual(room, before);
  }
  act(room, 'call', { number: 1 });
  const before = structuredClone(room);
  assert.throws(() => act(room, 'call', { number: 1 }), /已被佔領/);
  assert.deepEqual(room, before);
  assert.equal(Object.values(room.cardDrawCounts).reduce((sum, count) => sum + count, 0), 1);
  assert.equal(game.snapshot(room, { isOnline: () => true }, 'b').cardDrawCounts, undefined);
});
