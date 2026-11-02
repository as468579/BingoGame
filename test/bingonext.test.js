const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApplication } = require('../src/app');
const { prizeLines, teamLines, awardLinePrizes, createLinePrizes } = require('../src/games/bingonext/prizes');
function fixture(options = {}) {
  const rooms = new Map(), repository = { get: c => rooms.get(c), all: () => [...rooms.values()], add: r => rooms.set(r.code, r), save() {} };
  const app = createApplication(options.directory ? { dataDirectory: options.directory } : { repository });
  const token = randomUUID(), result = app.service.execute({ kind: 'create', gameType: 'bingo-next', name: 'Host', token, requestId: randomUUID() });
  const code = result.room.code;
  const send = (kind, data = {}, who = token) => app.service.execute({ kind, code, token: who, requestId: randomUUID(), ...data });
  send('settings', { size: options.size || 3, teamCount: options.t || 2, playersPerTeam: options.p || 1 });
  const room = app.repository.get(code);
  for (let i = 1; i < (options.members ?? room.teamCount * room.playersPerTeam); i++) send('join', { name: `P${i}` }, randomUUID());
  const start = () => { room.players.forEach(p => send('ready', { ready: true }, p.token)); return send('start'); };
  const play = number => send('call', { number }, room.players.find(p => p.id === room.turn).token);
  return { ...app, token, send, play, room, code, start };
}
test('BingoNext registers as a separate game with team identities and one authoritative board', () => {
  const f = fixture({ p: 2 });
  const snapshot = f.service.snapshot(f.room, f.room.host);
  assert.equal(snapshot.gameType, 'bingo-next');
  assert.deepEqual(snapshot.teams.map(t => t.playerIds.length), [2, 2]);
  assert.ok(snapshot.players.every(p => JSON.stringify(p.board) === JSON.stringify(snapshot.board)));
  assert.ok(f.room.players.every(p => !('board' in p) && !('cells' in p)));
  const original = f.send('create', { name: 'Classic', gameType: 'bingo' }, randomUUID()).room;
  assert.equal(original.gameType, 'bingo'); assert.equal(original.teams, undefined);
  assert.equal(f.room.gameType, 'bingo-next');
});
test('only the host edits the shared board and a changed layout cancels readiness', () => {
  const f = fixture(), other = f.room.players[1];
  f.send('ready', { ready: true }, other.token);
  assert.throws(() => f.send('board', { board: f.room.board, boardVersion: f.room.boardVersion }, other.token), /只有房主/);
  assert.throws(() => f.send('settings', { teamCount: 1 }), /至少 2 隊/);
  const board = [...f.room.board].reverse(), version = f.room.boardVersion;
  f.send('board', { board, boardVersion: version, ready: true });
  assert.deepEqual(f.room.board, board); assert.equal(other.ready, false); assert.equal(f.room.players[0].ready, true);
  assert.throws(() => f.send('board', { board, boardVersion: version }), /已更新/);
  assert.throws(() => f.send('board', { board: Array(9).fill(1), boardVersion: f.room.boardVersion }), /每個數字/);
});
test('team configuration, assignments and full-team readiness are validated', () => {
  const f = fixture({ p: 2 }), guest = f.room.players[1];
  assert.throws(() => f.send('start'), /準備/);
  assert.throws(() => f.send('team', { teamId: 'team-2' }), /已滿/);
  assert.throws(() => f.send('team', { playerId: f.room.host, teamId: null }, guest.token), /分配/);
  f.send('team', { teamId: null });
  assert.throws(() => f.send('ready', { ready: true }), /加入隊伍/);
  f.send('team', { teamId: 'team-1' }); f.start();
  assert.throws(() => f.send('team', { teamId: null }), /開始後/);
});
test('partially filled and unequal teams can start when every team is represented and all members are ready', () => {
  const f = fixture({ t: 3, p: 3, members: 4 });
  f.room.players.forEach(player => f.send('ready', { ready: true }, player.token));
  const before = structuredClone(f.room);
  assert.throws(() => f.send('start'), /每隊至少需要 1 位/);
  assert.deepEqual(f.room, before);
  f.send('team', { playerId: f.room.players[2].id, teamId: 'team-3' });
  assert.throws(() => f.send('start'), /準備/);
  f.send('ready', { ready: true }, f.room.players[2].token);
  assert.throws(() => f.send('start', {}, f.room.players[1].token), /只有房主/);
  const snapshot = f.send('start').room;
  assert.equal(snapshot.phase, 'playing'); assert.deepEqual(snapshot.teams.map(team => team.playerIds.length), [2, 1, 1]);
  assert.equal(f.room.players.length, 4); assert.equal(f.room.playersPerTeam, 3);
  f.play(1); assert.equal(f.room.cells[0].teamId, 'team-1');
  assert.equal(f.room.turn, f.room.players[1].id);
});

test('selecting a number immediately claims a cell, draws exactly one private card and advances once', () => {
  const f = fixture(); f.start(); const id = randomUUID();
  const first = f.send('call', { number: 1, requestId: id }), again = f.send('call', { number: 1, requestId: id });
  assert.deepEqual(f.room.called, [1]); assert.equal(f.room.pending, null);
  assert.equal(f.room.cells[0].teamId, 'team-1'); assert.equal(f.room.cells[0].playerId, f.room.host);
  assert.equal(f.room.turn, f.room.players[1].id); assert.equal(f.room.players[0].hand.length, 1);
  assert.equal(first.room.lastDraw.id, again.room.lastDraw.id);
  const guest = f.service.snapshot(f.room, f.room.players[1].id);
  assert.equal(guest.players[0].hand, undefined); assert.equal(guest.lastDraw, null);
  assert.equal(guest.players[0].token, undefined); assert.equal(guest.history, undefined);
  assert.throws(() => f.send('approve'), /不支援/);
});
test('opponents cannot claim occupied numbers and invalid moves never change state', () => {
  const f = fixture(); f.start(); f.play(1);
  const before = structuredClone(f.room);
  assert.throws(() => f.play(1), /已被佔領/);
  assert.throws(() => f.send('call', { number: 3 }), /輪到/);
  assert.throws(() => f.play(99), /無效/);
  assert.deepEqual(f.room, before);
});
test('a fully covered line with different teams earns no prize', () => {
  const f = fixture(); f.start(); [1, 2, 3].forEach(f.play);
  assert.ok(f.room.cells.slice(0, 3).every(c => c.isCovered));
  assert.equal(teamLines(f.room, 'team-1'), 0); assert.equal(teamLines(f.room, 'team-2'), 0);
  assert.ok(f.room.linePrizes.every(p => p.claimedBy === null));
});
test('only a homogeneous team line receives its prize and can reach the victory goal', () => {
  const f = fixture(); f.start(); [1, 4, 2, 5, 3].forEach(f.play);
  assert.equal(f.room.phase, 'finished'); assert.deepEqual(f.room.winners, ['team-1']);
  const snapshot = f.service.snapshot(f.room, f.room.host);
  assert.equal(snapshot.teams[0].lines, 1); assert.equal(snapshot.teams[0].rewards.length, 1);
  assert.equal(snapshot.linePrizes.find(p => p.id === 'row-0').claimedBy, 'team-1');
  assert.equal(snapshot.teams[1].rewards.length, 0);
  assert.throws(() => f.play(9));
});
test('a full blocked board settles by team score including a zero-line tie', () => {
  const f = fixture(); f.start(); [1, 2, 3, 5, 4, 6, 8, 7, 9].forEach(f.play);
  assert.equal(f.room.called.length, 9); assert.equal(f.room.phase, 'finished'); assert.equal(f.room.turn, null);
  assert.deepEqual(f.room.winners, ['team-1', 'team-2']);
  assert.ok(f.room.linePrizes.every(p => !p.claimedBy));
});
test('a full board below the victory goal selects the team with the most lines', () => {
  const f = fixture({ size: 4 }); f.start();
  const ownership = [1, 1, 1, 1, 1, 2, 1, 2, 2, 1, 2, 2, 2, 2, 1, 1];
  f.room.cells.forEach((cell, i) => { if (i < 15) Object.assign(cell, { isCovered: true, teamId: `team-${ownership[i]}` }); });
  f.room.called = Array.from({ length: 15 }, (_, i) => i + 1);
  f.play(16);
  assert.equal(f.room.phase, 'finished'); assert.equal(teamLines(f.room, 'team-1'), 1);
  assert.deepEqual(f.room.winners, ['team-1']);
});

test('every supported line direction awards only its owning team at sizes 3 through 9', () => {
  for (let size = 3; size <= 9; size++) for (const line of prizeLines(size)) {
    const room = { phase: 'playing', size, teamCount: 2, players: [],
      cells: Array.from({ length: size ** 2 }, (_, i) => ({ number: i + 1, isCovered: line.indices.includes(i), teamId: 'team-1' })), linePrizes: createLinePrizes(size) };
    awardLinePrizes(room);
    assert.equal(room.linePrizes.filter(p => p.claimedBy === 'team-1').length, 1);
    room.cells[line.indices[0]].teamId = 'team-2'; room.linePrizes = createLinePrizes(size); awardLinePrizes(room);
    assert.ok(room.linePrizes.every(p => !p.claimedBy));
  }
});
test('undo restores team ownership, prize ownership, hands and turn all the way to the beginning', () => {
  const f = fixture(); f.start(); [1, 4, 2, 5, 3].forEach(f.play);
  f.send('undo', { revision: f.room.revision });
  assert.equal(f.room.phase, 'playing'); assert.equal(f.room.cells[2].isCovered, false);
  assert.equal(f.room.linePrizes.find(p => p.id === 'row-0').claimedBy, null);
  assert.equal(f.room.players[0].hand.length, 2);
  while (f.room.history.length) f.send('undo', { revision: f.room.revision });
  assert.deepEqual(f.room.called, []); assert.equal(f.room.turn, f.room.host);
  assert.ok(f.room.cells.every(c => !c.isCovered && !c.teamId)); assert.ok(f.room.players.every(p => !p.hand.length));
});
test('card cancellation refunds without ending the turn; host judgment ends the turn without changing ownership', () => {
  const f = fixture(); f.start();
  f.send('cardUse', { cardId: 'star' });
  const turn = f.room.turn, session = f.room.activeCard.id;
  assert.throws(() => f.play(1), /暫停/);
  f.send('cardCancel', { cardSessionId: session }); assert.equal(f.room.turn, turn); assert.deepEqual(f.room.players[0].usedDemoCards, []);
  f.send('cardUse', { cardId: 'star' }); const id = f.room.activeCard.id;
  f.send('cardAnswer', { cardSessionId: id, choice: 0 });
  f.send('cardJudge', { cardSessionId: id, correct: false }); f.send('cardFinish', { cardSessionId: id });
  assert.equal(f.room.turn, f.room.players[1].id); assert.ok(f.room.cells.every(c => !c.isCovered));
});
test('host scan removes offline members only on request and reset preserves team settings', t => {
  const f = fixture({ p: 2 }), kept = f.room.players[1];
  const close = f.connections.subscribe(kept.id, { write() {} }); t.after(close);
  kept.ready = true; f.send('scan'); assert.equal(f.room.players.length, 2); assert.equal(kept.ready, true);
  assert.equal(f.room.lastScanRemovedCount, 2);
  const before = f.room.linePrizes.map(p => p.id); f.send('rerollPrizes'); assert.deepEqual(f.room.linePrizes.map(p => p.id), before);
  f.send('reset'); assert.equal(f.room.teamCount, 2); assert.equal(f.room.playersPerTeam, 2); assert.equal(kept.teamId, 'team-1');
  assert.ok(f.room.players.every(p => !p.ready));
});
test('shared ownership, private hands and undo survive a repository restart and same-ID rejoin', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-next-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const f = fixture({ directory }); f.start(); f.play(1);
  const restarted = createApplication({ dataDirectory: directory }), restored = restarted.repository.get(f.code);
  assert.deepEqual(restored, f.room);
  const joined = restarted.service.execute({ kind: 'join', code: f.code, name: 'Host', token: randomUUID(), requestId: randomUUID() });
  assert.equal(joined.playerId, f.room.host); assert.equal(joined.room.cells[0].teamId, 'team-1');
  restarted.service.execute({ kind: 'undo', code: f.code, token: f.token, revision: restored.revision, requestId: randomUUID() });
  assert.equal(restored.cells[0].isCovered, false);
});
