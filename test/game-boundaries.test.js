const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createApplication } = require('../src/app');
const { createRoom, joinRoom } = require('../src/domain/room');
const { getGame } = require('../src/games');
const { migrateRoom } = require('../src/domain/room-migration');

test('game modules create only their own room and member state', () => {
  const bingo = createRoom('BINGO', 'create', 'bingo');
  const bridge = createRoom('BRIDGE', 'create', 'bridge-bingo');
  const a = joinRoom(bingo, 'Host', randomUUID()), b = joinRoom(bridge, 'Host', randomUUID());
  assert.ok(bingo.linePrizes.length && Array.isArray(a.cells) && Array.isArray(a.hand));
  assert.equal(bingo.bridge, undefined); assert.equal(a.teamId, undefined);
  for (const key of ['called', 'history', 'linePrizes', 'pending', 'activeCard']) assert.equal(key in bridge, false, key);
  for (const key of ['board', 'cells', 'hand', 'usedDemoCards']) assert.equal(key in b, false, key);
  assert.equal(b.teamId, 'team-1');
  assert.equal(getGame().id, 'bingo');
  assert.throws(() => getGame('missing'), /有效的遊戲/);
});

test('mixed game rooms progress independently and reject the other game commands without side effects', () => {
  const rooms = new Map();
  const app = createApplication({ repository: { get: code => rooms.get(code), all: () => [...rooms.values()], add: room => rooms.set(room.code, room), save() {} } });
  const token = randomUUID(), other = randomUUID();
  const send = (kind, code, extra = {}) => app.service.execute({ kind, code, token, requestId: randomUUID(), ...extra });
  const bingo = send('create', null, { name: 'Host', gameType: 'bingo' });
  const bridge = send('create', null, { name: 'Host', gameType: 'bridge-bingo' });
  send('join', bingo.room.code, { name: 'Guest', token: other });
  send('bridgeSettings', bridge.room.code, { teamCount: 2, playersPerTeam: 1, size: 3 });
  send('join', bridge.room.code, { name: 'Guest', token: other });
  const bingoRoom = rooms.get(bingo.room.code), bridgeRoom = rooms.get(bridge.room.code);
  for (const p of bingoRoom.players) send('board', bingo.room.code, { token: p.token, board: p.board, ready: true });
  send('start', bingo.room.code);
  for (const p of bridgeRoom.players) send('bridgeReady', bridge.room.code, { token: p.token, ready: true });
  send('bridgeStart', bridge.room.code);
  const bridgeBefore = structuredClone(bridgeRoom);
  send('call', bingo.room.code, { number: 1 });
  send('approve', bingo.room.code, { pendingId: bingoRoom.pending.id });
  assert.deepEqual(bridgeRoom, bridgeBefore);
  const bingoBefore = structuredClone(bingoRoom);
  const card = bridgeRoom.bridge.hands[bridge.playerId][0];
  send('bridgePlay', bridge.room.code, { round: 1, cardNumber: card.number, targetNumber: card.number });
  assert.deepEqual(bingoRoom, bingoBefore);
  for (const [room, kind] of [[bingoRoom, 'bridgePlay'], [bridgeRoom, 'call']]) {
    const before = structuredClone(room);
    assert.throws(() => send(kind, room.code, { number: 2 }), /不支援/);
    assert.deepEqual(room, before);
  }
  const view = app.service.snapshot(bridgeRoom, bridge.playerId);
  assert.equal('called' in view, false);
  assert.equal('board' in view.players[0], false);
  assert.equal('linePrizes' in view, false);
});

test('legacy migration dispatches to the correct game and leaves valid Bridge state untouched', () => {
  const bingo = createRoom('OLD', 'create'); joinRoom(bingo, 'Host', randomUUID());
  delete bingo.gameType; delete bingo.players[0].cells;
  migrateRoom(bingo);
  assert.equal(bingo.players[0].cells.length, 25);
  const bridge = createRoom('BRIDGE', 'create', 'bridge-bingo'); joinRoom(bridge, 'Host', randomUUID());
  const before = structuredClone(bridge);
  migrateRoom(bridge);
  assert.deepEqual(bridge, before);
  delete bridge.bridge;
  migrateRoom(bridge);
  assert.ok(bridge.bridge);
  assert.equal(bridge.linePrizes, undefined);
  assert.equal(bridge.players[0].cells, undefined);
});

test('client game state switches without carrying Bingo editor state into Bridge', async () => {
  const { GameApp } = await import('../public/js/app.js');
  const { getClientGame } = await import('../public/js/games/index.js');
  const bingo = { code: 'A', gameType: 'bingo', revision: 1, boardVersion: 0, players: [{ id: 'me', board: [1, 2, 3] }] };
  const state = getClientGame('bingo').createState(); state.playerId = 'me'; state.selected = 'me'; state.connected = true;
  state.accept(bingo); state.editCell(0, 3);
  const app = { state, activeType: 'bingo', controllers: new Map(), render() {}, controller() { return {}; } };
  GameApp.prototype.update.call(app, { code: 'B', gameType: 'bridge-bingo', revision: 1, players: [{ id: 'me', teamId: 'team-1', hand: [] }] });
  assert.equal(app.state.playerId, 'me'); assert.equal(app.state.connected, true);
  assert.equal('draft' in app.state, false); assert.equal(app.state.editCell, undefined);
  assert.deepEqual(app.state.hand, []);
  GameApp.prototype.update.call(app, bingo);
  assert.deepEqual(app.state.draft, [1, 2, 3]); assert.equal(app.state.draftDirty, false);
});

test('common dialog dismissal checks backdrop hit testing and honors the supplied game policy', async () => {
  const { bindDialogDismiss } = await import('../public/js/views/dialog.js');
  const events = {}, closeButton = {};
  const dialog = { addEventListener: (name, handler) => { events[name] = handler; }, getBoundingClientRect: () => ({ left: 10, right: 100, top: 10, bottom: 100 }) };
  let enabled = true, dismissed = 0, prevented = 0;
  bindDialogDismiss({ dialog, closeButton, canDismiss: () => enabled, onDismiss: () => dismissed++ });
  events.click({ target: dialog, clientX: 20, clientY: 20 });
  events.click({ target: {}, clientX: 0, clientY: 0 });
  assert.equal(dismissed, 0);
  events.click({ target: dialog, clientX: 0, clientY: 0 }); closeButton.onclick();
  events.cancel({ preventDefault: () => prevented++ });
  assert.equal(dismissed, 3);
  enabled = false;
  events.click({ target: dialog, clientX: 101, clientY: 50 }); closeButton.onclick(); events.cancel({ preventDefault: () => prevented++ });
  assert.equal(dismissed, 3); assert.equal(prevented, 2);
});

test('Bingo controller owns editor and readiness commands while Bridge exposes only Bridge commands', async () => {
  const { BingoState } = await import('../public/js/games/bingo/state.js');
  const { BingoController } = await import('../public/js/games/bingo/controller.js');
  const { BridgeController } = await import('../public/js/games/bridge/controller.js');
  const state = new BingoState(); state.playerId = 'me';
  const board = Array.from({ length: 9 }, (_, i) => i + 1);
  state.accept({ code: 'ROOM', revision: 1, boardVersion: 0, players: [{ id: 'me', board, ready: false }] });
  const sent = []; let validated = 0;
  const app = { state, view: { gameView: { board: { validate() { validated++; } } } },
    perform: callback => callback(), update: snapshot => state.accept(snapshot),
    api: { async send(kind, data) {
      sent.push([kind, data]);
      return { room: { ...state.room, revision: 2, players: [{ id: 'me', board: data.board, ready: data.ready }] } };
    } }, command: (kind, data) => sent.push([kind, data]) };
  const actions = new BingoController(app).actions();
  actions.editCell(0, 9); assert.equal(validated, 1);
  state.draft = [...board].reverse();
  await actions.ready();
  assert.deepEqual(sent[0], ['board', { board: [...board].reverse(), ready: true, boardVersion: 0 }]);
  assert.equal(state.draftDirty, false); assert.equal(state.me.ready, true);
  const bridge = new BridgeController(app).actions();
  assert.deepEqual(Object.keys(bridge), ['bridge']);
  bridge.bridge('bridgeReady', { ready: true });
  assert.deepEqual(sent[1], ['bridgeReady', { ready: true }]);
});

function javascriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? javascriptFiles(path.join(directory, entry.name)) : entry.name.endsWith('.js') ? [path.join(directory, entry.name)] : []);
}

test('server and client game modules cannot import another game implementation', () => {
  const root = path.resolve(__dirname, '..');
  const gameNames = ['bingo', 'bridge', 'bingonext'];
  for (const location of ['src/games', 'public/js/games']) for (const game of gameNames) {
    const directory = path.join(root, location, game);
    const siblings = gameNames.filter(name => name !== game).map(name => path.join(root, location, name));
    for (const file of javascriptFiles(directory)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/(?:require\(|from\s+|import\()\s*['"](\.[^'"]+)['"]/g)) {
        const target = path.resolve(path.dirname(file), match[1]);
        assert.equal(siblings.some(sibling => target === sibling || target.startsWith(sibling + path.sep)), false, `${path.relative(root, file)} imports ${match[1]}`);
      }
    }
  }
  for (const file of javascriptFiles(path.join(root, 'src/shared'))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /require\(['"].*games\//);
  }
});
