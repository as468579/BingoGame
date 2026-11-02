const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApplication } = require('../src/app');
const { coloredDeck, legalPlacements, lineCount, beginBridgeRound } = require('../src/games/bridge/game');

function fixture({ size = 3, p = 2, t = 2, directory } = {}) {
  const rooms = new Map();
  const repository = { get: code => rooms.get(code), all: () => [...rooms.values()], add: room => rooms.set(room.code, room), save() {} };
  const app = createApplication(directory ? { dataDirectory: directory } : { repository });
  const hostToken = randomUUID();
  const host = app.service.execute({ kind: 'create', gameType: 'bridge-bingo', name: 'Host', token: hostToken, requestId: randomUUID() });
  const code = host.room.code;
  const send = (kind, token = hostToken, data = {}) => app.service.execute({ kind, code, token, requestId: randomUUID(), ...data });
  send('bridgeSettings', hostToken, { teamCount: t, playersPerTeam: p, size });
  for (let i = 1; i < t * p; i++) send('join', randomUUID(), { name: `Player ${i}` });
  const room = app.repository.get(code);
  const start = () => { room.players.forEach(player => send('bridgeReady', player.token, { ready: true })); return send('bridgeStart'); };
  const play = (team, card, target, data = {}) => {
    const player = room.players.find(member => member.id === team.order[team.cursor]);
    return send('bridgePlay', player.token, { cardNumber: card, targetNumber: target, round: room.bridge.round, ...data });
  };
  return { ...app, room, host, hostToken, code, send, start, play };
}

test('host lobby scan removes only disconnected players and frees their team slots', t => {
  const f = fixture(), [host, online, offline, unassigned] = f.room.players;
  const closeOnline = f.connections.subscribe(online.id, { write() {} });
  t.after(closeOnline);
  online.ready = true; unassigned.teamId = null;
  const teamId = online.teamId, original = [...f.room.players];
  assert.equal(f.room.players.length, 4, 'offline players remain before an explicit scan');
  assert.throws(() => f.send('bridgeScan', online.token), /只有房主/);
  assert.deepEqual(f.room.players, original);
  const result = f.send('bridgeScan');
  assert.deepEqual(f.room.players.map(p => p.id), [host.id, online.id]);
  assert.equal(online.teamId, teamId); assert.equal(online.ready, true);
  assert.equal(result.room.lastScanRemovedCount, 2);
  assert.ok(result.room.lastScanAt);
  assert.deepEqual(result.room.bridge.teams.flatMap(team => team.playerIds), [host.id, online.id]);
  assert.throws(() => f.service.authenticate(f.code, offline.token), /尚未加入/);
  f.send('bridgeScan');
  assert.equal(f.room.lastScanRemovedCount, 0, 'repeat scan keeps connected players');
  const rejoined = f.send('join', offline.token, { name: offline.name });
  assert.ok(rejoined.room.players.some(p => p.name === offline.name && !p.ready));
});

test('Bridge scan rejects playing and finished phases without touching the roster', () => {
  const f = fixture(); f.start();
  for (const phase of ['playing', 'finished']) {
    f.room.phase = phase;
    const before = structuredClone(f.room);
    assert.throws(() => f.send('bridgeScan'), /準備階段/);
    assert.deepEqual(f.room, before);
  }
});

test('balanced three-color decks contain every number exactly once at every supported board size', () => {
  for (let size = 3; size <= 9; size++) {
    const deck = coloredDeck(size);
    assert.deepEqual(deck.map(card => card.number), Array.from({ length: size ** 2 }, (_, i) => i + 1));
    const counts = ['red', 'yellow', 'blue'].map(color => deck.filter(card => card.color === color).length);
    assert.equal(counts.reduce((a, b) => a + b), size ** 2);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  }
});

test('teams share one arrangement and color map but each receives a complete independently dealt deck', () => {
  const f = fixture({ size: 5, p: 3 }); f.start();
  const game = f.room.bridge;
  for (const team of game.teams) {
    assert.deepEqual(team.cells.map(cell => cell.number), game.board);
    assert.ok(team.cells.every(cell => cell.card === null));
    const cards = team.playerIds.flatMap(id => game.hands[id]);
    assert.deepEqual(cards.sort((a, b) => a.number - b.number), game.deck);
    const counts = team.playerIds.map(id => game.hands[id].length);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
    assert.deepEqual(team.order, team.playerIds);
  }
});

test('only the owner receives their hand or legal moves, including when the viewer is host', () => {
  const f = fixture(); f.start();
  for (const player of f.room.players) {
    const snapshot = f.service.snapshot(f.room, player.id);
    assert.equal(snapshot.bridge.hands, undefined);
    assert.equal(snapshot.bridge.deck, undefined);
    assert.equal(snapshot.linePrizes, undefined);
    assert.equal(snapshot.players.find(p => p.id === player.id).hand.length, f.room.bridge.hands[player.id].length);
    assert.ok(snapshot.players.filter(p => p.id !== player.id).every(p => !('hand' in p)));
    assert.ok(snapshot.bridge.legalMoves.every(move => f.room.bridge.hands[player.id].some(card => card.number === move.cardNumber)));
  }
});

function legalFixture(hand, leadColor = 'yellow') {
  const team = { order: ['me', 'next'], cursor: 0, done: false, leadColor,
    cells: Array.from({ length: 9 }, (_, i) => ({ number: i + 1, card: null })) };
  return { game: { hands: { me: hand } }, team };
}

test('following suit is mandatory; a normal card must land on its own unoccupied number', () => {
  const { game, team } = legalFixture([{ number: 3, color: 'yellow' }, { number: 7, color: 'red' }]);
  assert.deepEqual(legalPlacements(game, team, 'me', 3), [3]);
  assert.deepEqual(legalPlacements(game, team, 'me', 7), []);
  assert.deepEqual(legalPlacements(game, team, 'next', 3), []);
});

test('missing suit permits any color and any unoccupied destination even if the original cell is empty', () => {
  const { game, team } = legalFixture([{ number: 3, color: 'red' }, { number: 7, color: 'blue' }]);
  team.cells[0].card = { number: 8, color: 'yellow' };
  assert.deepEqual(legalPlacements(game, team, 'me', 3), [2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(legalPlacements(game, team, 'me', 7), [2, 3, 4, 5, 6, 7, 8, 9]);
});

test('an occupied original number creates a free card regardless of occupant color, without bypassing suit', () => {
  const { game, team } = legalFixture([{ number: 3, color: 'yellow' }, { number: 7, color: 'yellow' }, { number: 8, color: 'red' }]);
  team.cells[2].card = { number: 9, color: 'blue' };
  team.cells[7].card = { number: 1, color: 'yellow' };
  assert.deepEqual(legalPlacements(game, team, 'me', 3), [1, 2, 4, 5, 6, 7, 9]);
  assert.deepEqual(legalPlacements(game, team, 'me', 7), [7]);
  assert.deepEqual(legalPlacements(game, team, 'me', 8), []);
  team.leadColor = null;
  assert.ok(legalPlacements(game, team, 'me', 3).includes(7), 'a leader can also use a free card');
});

test('server validates ownership, turn, suit and position before changing any state; retries play once', () => {
  const f = fixture(); f.start();
  const g = f.room.bridge, team = g.teams[0], leader = team.order[0], follower = team.order[1];
  g.hands[leader] = [{ number: 1, color: 'yellow' }];
  g.hands[follower] = [{ number: 2, color: 'red' }, { number: 3, color: 'yellow' }];
  const token = f.room.players.find(p => p.id === follower).token;
  assert.throws(() => f.send('bridgePlay', token, { cardNumber: 2, targetNumber: 2, round: 1 }), /等待輪到你/);
  const requestId = randomUUID();
  const caller = f.room.players.find(p => p.id === leader).token;
  const data = { cardNumber: 1, targetNumber: 1, round: 1, requestId };
  f.send('bridgePlay', caller, data); f.send('bridgePlay', caller, data);
  assert.equal(team.cursor, 1); assert.equal(g.hands[leader].length, 0); assert.equal(team.leadColor, 'yellow');
  const before = structuredClone(g);
  for (const [cardNumber, targetNumber] of [[2, 2], [3, 4], [3, 1], [99, 3]]) {
    assert.throws(() => f.send('bridgePlay', token, { cardNumber, targetNumber, round: 1 }), /規則/);
    assert.deepEqual(g, before);
  }
  f.send('bridgePlay', token, { cardNumber: 3, targetNumber: 3, round: 1 });
  assert.equal(team.done, true);
  assert.equal(team.cells.find(cell => cell.number === 3).card.number, 3);
});

test('teams play top to bottom and only the active team can move or receive a public turn', () => {
  const f = fixture({ t: 3, p: 2, size: 4 }); f.start(); const g = f.room.bridge;
  for (const [index, team] of g.teams.entries()) {
    const snapshot = f.service.snapshot(f.room, team.order[0]);
    assert.equal(snapshot.bridge.activeTeamId, team.id);
    assert.deepEqual(snapshot.bridge.teams.filter(t => t.turn).map(t => t.id), [team.id]);
    for (const waiting of g.teams.slice(index + 1)) {
      const player = f.room.players.find(p => p.id === waiting.order[0]), card = g.hands[player.id][0];
      const before = structuredClone(f.room);
      assert.deepEqual(legalPlacements(g, waiting, player.id, card.number), []);
      assert.ok(f.service.snapshot(f.room, player.id).bridge.legalMoves.every(move => !move.targets.length));
      assert.throws(() => f.send('bridgePlay', player.token, { cardNumber: card.number, targetNumber: card.number, round: g.round }), error => error.status === 403 && /隊伍/.test(error.message));
      assert.deepEqual(f.room, before);
    }
    for (let i = 0; i < 2; i++) {
      const id = team.order[team.cursor];
      const move = g.hands[id].map(card => ({ card, targets: legalPlacements(g, team, id, card.number) })).find(move => move.targets.length);
      f.play(team, move.card.number, move.targets[0]);
      if (!i) assert.equal(f.service.snapshot(f.room, id).bridge.activeTeamId, team.id, 'finish every player before changing teams');
    }
  }
  assert.equal(g.round, 2);
  assert.equal(f.service.snapshot(f.room, f.host.playerId).bridge.activeTeamId, 'team-1');
  assert.ok(g.teams.every(team => team.order[0] === team.playerIds[1]), 'team-internal leaders still rotate');
});

test('a team with no remaining cards is skipped when choosing the next active team', () => {
  const f = fixture({ t: 3, p: 1 }); f.start(); const g = f.room.bridge;
  g.hands[g.teams[0].playerIds[0]] = [];
  beginBridgeRound(g);
  const snapshot = f.service.snapshot(f.room, f.host.playerId);
  assert.equal(snapshot.bridge.activeTeamId, 'team-2');
  assert.equal(snapshot.bridge.teams[0].done, true);
  assert.equal(snapshot.bridge.teams[0].turn, null);
  const later = g.teams[2], card = g.hands[later.order[0]][0];
  assert.deepEqual(legalPlacements(g, later, later.order[0], card.number), []);
});

test('all teams synchronize rounds; leaders rotate and players with no cards are skipped', () => {
  const f = fixture(); f.start(); const g = f.room.bridge;
  for (const [i, team] of g.teams.entries()) {
    g.hands[team.playerIds[0]] = [{ number: 1, color: 'red' }, { number: 3, color: 'red' }];
    g.hands[team.playerIds[1]] = [{ number: 2, color: 'red' }, { number: 4, color: 'red' }];
    f.play(team, 1, 1); f.play(team, 2, 2);
    if (i === 0) { assert.equal(g.round, 1); assert.equal(team.done, true); }
  }
  assert.equal(g.round, 2);
  for (const team of g.teams) { assert.equal(team.order[0], team.playerIds[1]); assert.equal(team.leadColor, null); }
  const team = g.teams[0]; g.hands[team.playerIds[1]] = [];
  beginBridgeRound(g);
  assert.deepEqual(team.order, [team.playerIds[0]]);
});

test('same-round winning teams tie only after every team finishes its full round', () => {
  const f = fixture(); f.start(); const g = f.room.bridge;
  for (const team of g.teams) {
    team.cells = Array.from({ length: 9 }, (_, i) => ({ number: i + 1, card: i < 2 ? { number: i + 1, color: 'red' } : null }));
    g.hands[team.playerIds[0]] = [{ number: 3, color: 'yellow' }];
    g.hands[team.playerIds[1]] = [{ number: 4, color: 'yellow' }];
  }
  f.play(g.teams[0], 3, 3);
  assert.equal(lineCount(g.teams[0], 3), 1); assert.equal(f.room.phase, 'playing');
  f.play(g.teams[0], 4, 4);
  assert.equal(f.room.phase, 'playing');
  f.play(g.teams[1], 3, 3); f.play(g.teams[1], 4, 4);
  assert.equal(f.room.phase, 'finished');
  assert.deepEqual(g.winners, ['team-1', 'team-2']);
  assert.throws(() => f.send('bridgePlay', f.hostToken, { cardNumber: 5, targetNumber: 5, round: 1 }), /出牌階段/);
});

test('team assignment, readiness and configuration are checked on the server', () => {
  const f = fixture();
  assert.throws(() => f.send('bridgeStart'), /準備/);
  assert.throws(() => f.send('bridgeSettings', f.room.players[1].token, { teamCount: 2, playersPerTeam: 2, size: 4 }), error => error.status === 403);
  assert.throws(() => f.send('bridgeTeam', f.room.players[1].token, { playerId: f.host.playerId, teamId: null }), error => error.status === 403);
  assert.throws(() => f.send('bridgeTeam', f.hostToken, { teamId: 'team-2' }), /已滿/);
  f.send('bridgeTeam', f.hostToken, { teamId: null });
  assert.throws(() => f.send('bridgeReady', f.hostToken, { ready: true }), /先加入/);
  f.send('bridgeTeam', f.hostToken, { teamId: 'team-1' });
  f.start();
  assert.throws(() => f.send('bridgeTeam', f.hostToken, { teamId: null }), /開始後/);
  assert.throws(() => f.send('call', f.hostToken, { number: 1 }), /不支援/);
  f.send('bridgeReset'); assert.equal(f.room.phase, 'lobby');
  assert.deepEqual(f.room.bridge.hands, {}); assert.ok(f.room.players.every(player => !player.ready));
});

test('active team hands, current suit, placements and turn survive an actual repository restart', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const f = fixture({ directory }); f.start();
  const team = f.room.bridge.teams[0], card = f.room.bridge.hands[team.order[0]][0];
  f.play(team, card.number, card.number);
  const restarted = createApplication({ dataDirectory: directory });
  const restored = restarted.repository.get(f.code);
  assert.deepEqual(restored.bridge, f.room.bridge);
  assert.equal(restarted.service.snapshot(restored, f.host.playerId).bridge.activeTeamId, 'team-1');
  const response = restarted.service.execute({ kind: 'join', code: f.code, token: randomUUID(), name: 'Host', requestId: randomUUID() });
  assert.equal(response.playerId, f.host.playerId);
  assert.deepEqual(response.room.players[0].hand, f.room.bridge.hands[f.host.playerId]);
});

test('all possible complete lines are counted from occupancy, even with mismatched card numbers', () => {
  const team = { cells: Array.from({ length: 25 }, (_, i) => ({ number: i + 1, card: { number: 25 - i, color: 'blue' } })) };
  assert.equal(lineCount(team, 5), 12);
});

test('complete games across board sizes preserve every card and cannot deadlock on suit or free placement', () => {
  for (const size of [3, 4, 5, 6, 7, 8, 9]) for (const p of [1, 2, 3, 8]) {
    const f = fixture({ size, p }); f.start(); const g = f.room.bridge;
    let plays = 0;
    while (f.room.phase === 'playing') {
      const team = g.teams.find(candidate => !candidate.done);
      assert.ok(team);
      const id = team.order[team.cursor];
      const move = g.hands[id].map(card => ({ card, targets: legalPlacements(g, team, id, card.number) })).find(move => move.targets.length);
      assert.ok(move, 'there must be a legal move whenever a player still has cards');
      f.play(team, move.card.number, move.targets[0]);
      assert.ok(++plays <= size ** 2 * 2);
      for (const current of g.teams) {
        const placed = current.cells.filter(cell => cell.card).map(cell => cell.card.number);
        const remaining = current.playerIds.flatMap(playerId => g.hands[playerId]).map(card => card.number);
        assert.equal(new Set([...placed, ...remaining]).size, size ** 2);
        assert.equal(placed.length + remaining.length, size ** 2);
      }
    }
    assert.ok(g.winners.length);
    assert.ok(g.teams.every(team => team.done));
  }
});

test('stale round requests and early next-round plays are rejected without consuming cards', () => {
  const f = fixture({ p: 1 }); f.start(); const g = f.room.bridge;
  const first = g.teams[0], next = g.teams[1];
  const card = g.hands[first.order[0]][0];
  f.play(first, card.number, card.number);
  const before = structuredClone(g);
  assert.throws(() => f.send('bridgePlay', f.hostToken, { cardNumber: card.number, targetNumber: 1, round: 1 }), /等待輪到你/);
  assert.deepEqual(g, before);
  const other = g.hands[next.order[0]][0]; f.play(next, other.number, other.number);
  assert.equal(g.round, 2);
  const current = structuredClone(g);
  assert.throws(() => f.send('bridgePlay', f.hostToken, { cardNumber: 2, targetNumber: 2, round: 1 }), /回合已更新/);
  assert.deepEqual(g, current);
});

test('three teams must all finish before the next round and configuration errors do not change the room', () => {
  const f = fixture({ t: 3, p: 1 });
  for (const options of [{ teamCount: 1, playersPerTeam: 3, size: 3 }, { teamCount: 3, playersPerTeam: 0, size: 3 },
    { teamCount: 3, playersPerTeam: 6, size: 3 }, { teamCount: 3, playersPerTeam: 1, size: 2 },
    { teamCount: 2.5, playersPerTeam: 1, size: 3 }]) {
    const previous = structuredClone(f.room.bridge);
    assert.throws(() => f.send('bridgeSettings', f.hostToken, options), /設定/);
    assert.deepEqual(f.room.bridge, previous);
  }
  f.start();
  f.room.bridge.teams.forEach((team, i) => {
    const card = f.room.bridge.hands[team.order[0]][0];
    f.play(team, card.number, card.number);
    assert.equal(f.room.bridge.round, i < 2 ? 1 : 2);
  });
});
