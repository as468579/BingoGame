const { test } = require('node:test');
const assert = require('node:assert/strict');
const { COLORS, shuffle, createBridgeState, assignBridgePlayer, coloredDeck,
  beginBridgeRound, legalPlacements, lineCount } = require('../src/games/bridge/game');
const { bridgeSnapshot } = require('../src/games/bridge/snapshot');

function position(hand, leadColor = 'yellow') {
  const team = { id: 'team-1', name: 'Team 1', playerIds: ['a', 'b'], order: ['a', 'b'], cursor: 0, done: false,
    leadColor, cells: Array.from({ length: 9 }, (_, i) => ({ number: i + 1, card: null })) };
  const game = { ...createBridgeState({ size: 3 }), round: 1, hands: { a: hand, b: [] }, teams: [team] };
  return { team, game };
}

test('Bridge state instances have independent boards, hands and result collections', () => {
  const first = createBridgeState(), second = createBridgeState();
  first.board.reverse(); first.hands.a = [{ number: 1, color: 'red' }]; first.winners.push('team-1');
  assert.deepEqual(second.board, Array.from({ length: 25 }, (_, i) => i + 1));
  assert.deepEqual(second.hands, {}); assert.deepEqual(second.winners, []);
  assert.equal(second.round, 0); assert.equal(second.teamCount, 2); assert.equal(second.playersPerTeam, 2);
});

test('shuffle preserves its input and supports deterministic random choices including empty decks', () => {
  const original = Object.freeze([1, 2, 3, 4]);
  const bounds = [];
  const shuffled = shuffle(original, limit => { bounds.push(limit); return 0; });
  assert.deepEqual(shuffled, [2, 3, 4, 1]);
  assert.deepEqual(original, [1, 2, 3, 4]);
  assert.deepEqual(bounds, [4, 3, 2]);
  assert.deepEqual(shuffle([], () => assert.fail('no randomness is needed')), []);
  assert.deepEqual(shuffle([1], () => assert.fail('no randomness is needed')), [1]);
});

test('number-color allocation is reproducible and balanced without requiring a lucky random sample', () => {
  for (let size = 3; size <= 9; size++) {
    for (const pick of [() => 0, limit => limit - 1]) {
      const deck = coloredDeck(size, pick);
      assert.deepEqual(deck, coloredDeck(size, pick));
      assert.equal(new Set(deck.map(card => card.number)).size, size ** 2);
      assert.ok(deck.every(card => card.number >= 1 && card.number <= size ** 2 && COLORS.includes(card.color)));
      const counts = COLORS.map(color => deck.filter(card => card.color === color).length);
      assert.ok(counts.every(count => count === Math.floor(size ** 2 / 3) || count === Math.ceil(size ** 2 / 3)));
      assert.equal(counts.reduce((a, b) => a + b), size ** 2);
    }
  }
  assert.deepEqual(COLORS, ['red', 'yellow', 'blue']);
});

test('automatic assignment fills available teams without moving assigned or active-game players', () => {
  const room = { phase: 'lobby', bridge: createBridgeState(), players: [] };
  for (let i = 0; i < 5; i++) {
    const player = { id: String(i), teamId: null }; room.players.push(player); assignBridgePlayer(room, player);
  }
  assert.deepEqual(room.players.map(player => player.teamId), ['team-1', 'team-1', 'team-2', 'team-2', null]);
  room.players[0].teamId = null;
  assignBridgePlayer(room, room.players[4]);
  assert.equal(room.players[4].teamId, 'team-1');
  assignBridgePlayer(room, room.players[2]);
  assert.equal(room.players[2].teamId, 'team-2');
  room.phase = 'playing'; assignBridgePlayer(room, room.players[0]);
  assert.equal(room.players[0].teamId, null);
});

test('round leaders rotate through the fixed roster and wrap without changing hand contents', () => {
  const { game, team } = position([]);
  team.playerIds = ['a', 'b', 'c', 'd'];
  game.hands = Object.fromEntries(team.playerIds.map((id, i) => [id, [{ number: i + 1, color: 'blue' }]]));
  const hands = structuredClone(game.hands);
  const expected = [['a', 'b', 'c', 'd'], ['b', 'c', 'd', 'a'], ['c', 'd', 'a', 'b'], ['d', 'a', 'b', 'c'], ['a', 'b', 'c', 'd']];
  expected.forEach((order, i) => {
    game.round = i + 1; team.cursor = 2; team.done = true; team.leadColor = 'yellow';
    beginBridgeRound(game);
    assert.deepEqual(team.order, order); assert.equal(team.cursor, 0);
    assert.equal(team.leadColor, null); assert.equal(team.done, false);
  });
  assert.deepEqual(game.hands, hands);
  assert.deepEqual(team.playerIds, ['a', 'b', 'c', 'd']);
});

test('empty hands are skipped even for the nominal leader; an empty team has no active turn', () => {
  const { game, team } = position([]);
  game.hands.b = [{ number: 7, color: 'blue' }];
  beginBridgeRound(game);
  assert.deepEqual(team.order, ['b']); assert.equal(team.done, false);
  game.hands.b = [];
  beginBridgeRound(game);
  assert.deepEqual(team.order, []); assert.equal(team.done, true);
  assert.deepEqual(legalPlacements(game, team, 'a', 1), []);
});

test('leader placement requires a matching number until the original number has been occupied', () => {
  const { game, team } = position([{ number: 3, color: 'red' }], null);
  assert.deepEqual(legalPlacements(game, team, 'a', 3), [3]);
  team.cells[2].card = { number: 8, color: 'blue' };
  assert.deepEqual(legalPlacements(game, team, 'a', 3), [1, 2, 4, 5, 6, 7, 8, 9]);
});

test('a same-suit free card remains available alongside normal cards and a wrong-suit free card stays forbidden', () => {
  for (const occupantColor of COLORS) {
    const { game, team } = position([{ number: 3, color: 'yellow' }, { number: 7, color: 'yellow' }, { number: 8, color: 'red' }]);
    team.cells[2].card = { number: 9, color: occupantColor };
    team.cells[7].card = { number: 1, color: occupantColor };
    assert.deepEqual(legalPlacements(game, team, 'a', 3), [1, 2, 4, 5, 6, 7, 9]);
    assert.deepEqual(legalPlacements(game, team, 'a', 7), [7]);
    assert.deepEqual(legalPlacements(game, team, 'a', 8), []);
  }
});

test('missing the designated suit frees every held color while occupied destinations stay unavailable', () => {
  const { game, team } = position([{ number: 3, color: 'red' }, { number: 7, color: 'blue' }]);
  team.cells[0].card = { number: 8, color: 'yellow' };
  for (const card of game.hands.a) assert.deepEqual(legalPlacements(game, team, 'a', card.number), [2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(team.cells[2].card, null, 'original empty number does not restrict a missing-suit card');
});

test('last-slot moves are valid without overwriting cards and legality checks never mutate state', () => {
  const { game, team } = position([{ number: 3, color: 'yellow' }]);
  team.cells.forEach(cell => { if (cell.number !== 9) cell.card = { number: cell.number, color: 'red' }; });
  const before = structuredClone(game);
  assert.deepEqual(legalPlacements(game, team, 'a', 3), [9]);
  assert.deepEqual(legalPlacements(game, team, 'a', 99), []);
  assert.deepEqual(legalPlacements(game, team, 'b', 3), []);
  assert.deepEqual(legalPlacements(game, team, 'unknown', 3), []);
  assert.deepEqual(game, before);
  team.cells[8].card = { number: 9, color: 'blue' };
  assert.deepEqual(legalPlacements(game, team, 'a', 3), []);
});

test('all rows, columns and both diagonals score using occupancy rather than played card numbers', () => {
  for (let size = 3; size <= 9; size++) {
    const groups = [];
    for (let i = 0; i < size; i++) {
      groups.push(Array.from({ length: size }, (_, j) => i * size + j));
      groups.push(Array.from({ length: size }, (_, j) => j * size + i));
    }
    groups.push(Array.from({ length: size }, (_, i) => i * (size + 1)));
    groups.push(Array.from({ length: size }, (_, i) => (i + 1) * (size - 1)));
    for (const group of groups) {
      const team = { cells: Array.from({ length: size ** 2 }, (_, i) => ({ number: i + 1,
        card: group.includes(i) ? { number: size ** 2 - i, color: 'blue' } : null })) };
      assert.equal(lineCount(team, size), 1);
      team.cells[group[0]].card = null;
      assert.equal(lineCount(team, size), 0);
    }
  }
});

test('snapshot units hide teammates hands and block legal moves for spectators and finished games', () => {
  const { game, team } = position([{ number: 3, color: 'yellow' }]);
  game.hands.b = [{ number: 7, color: 'red' }];
  const room = { code: 'TEST', gameType: 'bridge-bingo', phase: 'playing', host: 'a', revision: 1, bridge: game,
    players: [{ id: 'a', name: 'A', teamId: team.id }, { id: 'b', name: 'B', teamId: team.id }] };
  const presence = { isOnline: () => true };
  const snapshot = bridgeSnapshot(room, presence, 'a');
  assert.deepEqual(snapshot.bridge.legalMoves, [{ cardNumber: 3, targets: [3] }]);
  assert.equal(snapshot.players[1].hand, undefined); assert.equal(snapshot.players[1].handCount, 1);
  assert.equal(snapshot.bridge.deck, undefined); assert.equal(snapshot.bridge.hands, undefined);
  const spectator = bridgeSnapshot(room, presence, 'outsider');
  assert.ok(spectator.players.every(player => player.hand === undefined));
  assert.deepEqual(spectator.bridge.legalMoves, []);
  room.phase = 'finished';
  assert.deepEqual(bridgeSnapshot(room, presence, 'a').bridge.legalMoves, []);
});
