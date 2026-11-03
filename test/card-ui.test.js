const { test } = require('node:test');
const assert = require('node:assert/strict');

// Minimal DOM boundary for view unit tests. Layout and pointer hit testing remain browser checks.
function mount(t) {
  class Node {
    constructor(tag = 'div') {
      this.tagName = tag; this.children = []; this.attributes = {}; this.listeners = {};
      this.dataset = {}; this.hidden = false; this.open = false; this.textContent = '';
      const classes = new Set();
      this.classList = { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value),
        toggle: (value, enabled) => { if (enabled) classes.add(value); else classes.delete(value); } };
    }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this._text = ''; this.children = [...nodes]; }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
    emit(type, values = {}) {
      const event = { target: this, ...values };
      this[`on${type}`]?.(event);
      for (const callback of this.listeners[type] || []) callback(event);
    }
    click() { if (!this.disabled) this.emit('click'); }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
    getBoundingClientRect() { return { left: 20, right: 400, top: 100, bottom: 500 }; }
    focus() { this.focused = true; }
  }
  const ids = [
    'handCount', 'handEmpty', 'handList', 'handPanel', 'openHand', 'closeHand', 'handDock',
    'cardPreviewDialog', 'closePreviewCard', 'previewCardsEmpty', 'previewCardList',
    'previewCardTitle', 'previewCardStep', 'previewCardContent', 'previewCardAction',
    'sharedCardDialog', 'sharedCardTitle', 'sharedCardStatus', 'sharedCardQuestion', 'sharedCardOptions',
    'sharedCardResult', 'answerSharedCard', 'finishSharedCard', 'judgeCardCorrect', 'judgeCardWrong', 'cancelSharedCard',
    'sharedCardSymbol', 'sharedCardDescription', 'sharedCardEffect',
    'boardPrizeLayout', 'rowPrizes', 'columnPrizes', 'topLeftPrize', 'topRightPrize',
    'lineNotices',
    'boardSize', 'applySize', 'start', 'skip', 'reset', 'scan', 'rerollPrizes', 'undo',
    'settingsPanel', 'sizeHint', 'hostTools', 'scanHint', 'shuffle', 'ready', 'board',
    'boardTitle', 'lineCount', 'phaseText', 'boardLines', 'editTools', 'boardHint',
    'gameResultsDialog', 'gameResultsList', 'closeGameResults', 'viewGameResults', 'drawCardDisplay',
    'drawnCardDialog', 'drawnCardTitle', 'drawnCardContent', 'closeDrawnCard',
    'bridgeGame', 'bridgeRoomCode', 'bridgeCopyCode', 'welcome', 'game', 'leave', 'switchPlayer',
    'gameChoice', 'gameType', 'teamTimeSettings', 'entryTeamMinutes', 'code', 'name', 'create', 'join',
    'joinDivider', 'hostEntry', 'connection',
    'bridgeTeamCount', 'bridgePlayersPerTeam', 'bridgeSize', 'bridgeApplySettings', 'bridgeOwnTeam',
    'bridgeReady', 'bridgeStart', 'bridgeScan', 'bridgeScanHint', 'bridgeReset', 'bridgeCloseResults', 'bridgeViewResults', 'bridgeResultDialog',
    'bridgePlayerCount', 'bridgeSettingsPanel', 'bridgeJoinControls', 'bridgeBoardTitle', 'bridgeLineCount',
    'bridgeRound', 'bridgeLeadColor', 'bridgeStatus', 'bridgeResultTitle', 'bridgeResultText', 'bridgeResultScores',
    'bridgeTeams', 'bridgePresenceSummary', 'bridgeBoard', 'bridgeLines', 'bridgeMoveHint', 'bridgeHandCount', 'bridgeHand', 'bridgeHandEmpty',
    'bridgeCardChoiceDialog', 'bridgeCloseCardChoice', 'bridgeCancelCardChoice', 'bridgeConfirmCardChoice',
    'bridgeCardChoiceTitle', 'bridgeCardChoiceReason', 'bridgeCardChoiceCard'
  ];
  const nodes = Object.fromEntries(ids.map(id => [id, new Node()]));
  for (const id of [...ids, 'root', 'publicAddress', 'saveAddress', 'copy', 'copyInvite', 'invitePanel', 'inviteLink', 'inviteHint',
    'roomCode', 'rulesText', 'winner', 'players', 'playerCount', 'presenceSummary', 'teamCount', 'playersPerTeam', 'gameResultsTitle', 'joinControls', 'ownTeam']) nodes[`next-${id}`] = new Node();
  const original = globalThis.document;
  globalThis.document = { getElementById: id => {
    assert.ok(nodes[id], `Unexpected DOM dependency: ${id}`);
    return nodes[id];
  }, createElement: tag => new Node(tag), createElementNS: (_, tag) => new Node(tag), body: new Node('body') };
  t.after(() => { if (original === undefined) delete globalThis.document; else globalThis.document = original; });
  return nodes;
}

function state(overrides = {}) {
  return { room: { code: 'ROOM01', host: 'host', pending: null }, playerId: 'host', me: { id: 'host' }, hand: [], ...overrides };
}

function bridgeState(phase = 'lobby') {
  const cells = Array.from({ length: 9 }, (_, i) => ({ number: i + 1, card: null }));
  const me = { id: 'host', name: 'Host', teamId: 'team-1', hand: [], handCount: 0, online: true, ready: false };
  return { me, playerId: 'host', connected: true, busy: false, room: { code: 'BRIDGE', gameType: 'bridge-bingo', host: 'host', phase, size: 3, goal: 1, boardVersion: 0, players: [me], winners: [],
    bridge: { teamCount: 2, playersPerTeam: 1, round: 1, legalMoves: [], teams: [
      { id: 'team-1', name: '隊伍 1', playerIds: ['host'], cells, lines: 0, turn: 'host', leadColor: null },
      { id: 'team-2', name: '隊伍 2', playerIds: [], cells, lines: 0, turn: null, leadColor: null }
    ] } } };
}

test('TeamBingo renders only its own shared board, team roster, team rewards and card controls', async t => {
  const nodes = mount(t), originalLocation = globalThis.location;
  globalThis.location = { origin: 'http://localhost:3000' };
  t.after(() => { if (originalLocation === undefined) delete globalThis.location; else globalThis.location = originalLocation; });
  const { TeamBingoView } = await import('../public/js/games/teambingo/game-view.js');
  const { TeamBingoState } = await import('../public/js/games/teambingo/state.js');
  const s = new TeamBingoState(); s.playerId = 'host'; s.connected = true;
  const board = Array.from({ length: 9 }, (_, i) => i + 1), cells = board.map(number => ({ number, isCovered: number === 1, ...(number === 1 ? { teamId: 'team-1' } : {}) }));
  cells[1].isSpecial = true;
  s.accept({ code: 'NEXT', gameType: 'teambingo', phase: 'playing', host: 'host', revision: 1, boardVersion: 0, size: 3, goal: 1,
    turn: 'host', teamCount: 2, playersPerTeam: 1, onlineCount: 2, called: [1], cells, board, linePrizes: [], winners: [],
    teams: [{ id: 'team-1', name: '隊伍 1', playerIds: ['host'], lines: 0, rewards: [] }, { id: 'team-2', name: '隊伍 2', playerIds: ['guest'], lines: 0, rewards: [] }],
    players: [{ id: 'host', name: 'Host', teamId: 'team-1', board, hand: [], handCount: 0, ready: true, online: true }, { id: 'guest', name: 'Guest', teamId: 'team-2', board, handCount: 0, ready: true, online: true }], availableDemoCards: [] });
  const lookup = document.getElementById, actions = { call() {}, command() {}, settingsChanged() {}, applySize() {}, undo() {} };
  document.getElementById = id => {
    assert.ok(id.startsWith('next-'), `TeamBingo touched another game's DOM: ${id}`);
    assert.doesNotMatch(id, /drawCardDisplay$/, 'Card notifications must not restore the disabled draw area');
    return lookup(id);
  };
  const view = new TeamBingoView(actions, { value: '', invitation: code => `http://localhost:3000/join?room=${code}` }, () => {}, () => s);
  view.render(s);
  assert.equal(document.title, '團隊賓果 · Alberta');
  assert.equal(nodes['next-root'].hidden, false); assert.equal(nodes['next-boardTitle'].textContent, '全場共用盤面');
  assert.equal(nodes['next-board'].children.length, 9); assert.equal(nodes['next-board'].children[0].dataset.team, 0);
  assert.equal(nodes['next-board'].children[0].disabled, true); assert.equal(nodes['next-board'].children[1].disabled, false);
  assert.equal(nodes['next-board'].children[1].classList.contains('is-special'), true);
  assert.match(nodes['next-board'].children[1].attributes['aria-label'], /特殊格/);
  assert.match(nodes['next-board'].children[1].textContent, /✦/);
  s.room.lastDraw = { id: 'drawn', name: '星光指引', theme: 'gold', symbol: '✧' };
  view.render(s); assert.equal(nodes['next-drawnCardDialog'].open, true);
  nodes['next-closeDrawnCard'].click();
  s.room.phase = 'finished'; s.room.winners = ['team-1']; view.render(s);
  assert.equal(nodes['next-gameResultsDialog'].open, true); assert.equal(nodes['next-gameResultsList'].children.length, 2);
  view.hide(); assert.equal(nodes['next-root'].hidden, true); assert.equal(nodes['next-gameResultsDialog'].open, false);
});

test('Team Bingo card awards notify immediately once per card and show the effect without descriptions', async t => {
  const nodes = mount(t);
  const { DrawCardView } = await import('../public/js/games/teambingo/views/draw-card-view.js');
  const view = new DrawCardView({ animate: false });
  const s = { playerId: 'member', room: { code: 'TEAM', phase: 'playing', called: [], boardVersion: 0 } };
  view.render(s); assert.equal(nodes['next-drawnCardDialog'].open, false);
  s.room.called.push(1);
  s.room.lastDraw = { id: 'card-1', name: '加時', symbol: '⏰', effect: '隊伍行動時間增加2分鐘', description: '不顯示的說明' };
  view.render(s);
  assert.equal(nodes['next-drawnCardDialog'].open, true);
  assert.equal(nodes['next-drawnCardTitle'].textContent, '加時');
  assert.match(nodes['next-drawnCardContent'].textContent, /隊伍行動時間增加2分鐘/);
  assert.doesNotMatch(nodes['next-drawnCardContent'].textContent, /不顯示的說明/);
  assert.equal(nodes.drawnCardDialog.open, false);
  nodes['next-closeDrawnCard'].click();
  view.render(s); assert.equal(nodes['next-drawnCardDialog'].open, false);
  s.room.lastDraw = { ...s.room.lastDraw, id: 'card-2' }; s.room.called.push(2);
  view.render(s); assert.equal(nodes['next-drawnCardDialog'].open, true);
  view.hide(); assert.equal(nodes['next-drawnCardDialog'].open, false);
});

test('Team Bingo card award dialogs identify the receiving team for every viewer', async t => {
  const nodes = mount(t);
  const { DrawCardView } = await import('../public/js/games/teambingo/views/draw-card-view.js');
  const room = { code: 'TEAM', phase: 'playing', called: [1], lastDraw: { id: 'award', name: '加時', symbol: 'pocket-watch', effect: '隊伍行動時間增加 2 分鐘', teamId: 'team-1', teamName: '隊伍 1' } };
  for (const playerId of ['recipient', 'teammate', 'opponent', 'host']) {
    const view = new DrawCardView({ animate: false });
    view.render({ playerId, room });
    assert.equal(nodes['next-drawnCardDialog'].open, true);
    assert.equal(nodes['next-drawnCardTitle'].textContent, '隊伍 1 獲得「加時」');
    assert.match(nodes['next-drawnCardContent'].textContent, /隊伍行動時間增加 2 分鐘/);
    nodes['next-closeDrawnCard'].click(); view.render({ playerId, room });
    assert.equal(nodes['next-drawnCardDialog'].open, false);
    view.hide();
  }
});

test('Team Bingo card awards wait for active questions or results and undo does not replay an award', async t => {
  const nodes = mount(t);
  const { DrawCardView } = await import('../public/js/games/teambingo/views/draw-card-view.js');
  const view = new DrawCardView({ animate: false });
  const s = { playerId: 'member', room: { code: 'TEAM', phase: 'playing', called: [1], activeCard: { id: 'question' }, lastDraw: { id: 'award', name: '加時' } } };
  view.render(s); assert.equal(nodes['next-drawnCardDialog'].open, false);
  s.room.activeCard = null; view.render(s);
  assert.equal(nodes['next-drawnCardDialog'].open, true);
  view.close();
  nodes['next-gameResultsDialog'].showModal();
  s.room.lastDraw = { id: 'final-award', name: '加時' }; s.room.phase = 'finished';
  view.render(s); assert.equal(nodes['next-drawnCardDialog'].open, false);
  nodes['next-gameResultsDialog'].close();
  assert.equal(nodes['next-drawnCardDialog'].open, true);
  view.close(); s.room.called = []; view.render(s);
  assert.equal(nodes['next-drawnCardDialog'].open, false);
  view.hide();
});

test('card award dialogs replace their content and discard pending notifications when leaving a room', async t => {
  const nodes = mount(t);
  const { DrawCardView } = await import('../public/js/games/teambingo/views/draw-card-view.js');
  const view = new DrawCardView({ animate: false });
  const s = { playerId: 'viewer', room: { code: 'FIRST', phase: 'playing', called: [1], lastDraw: { id: 'first', teamName: '隊伍 1', name: '加時', effect: '第一張效果' } } };
  view.render(s); assert.equal(nodes['next-drawnCardDialog'].open, true);
  s.room.called.push(2);
  s.room.lastDraw = { id: 'second', teamName: '隊伍 2', name: '加時', effect: '第二張效果' };
  view.render(s);
  assert.equal(nodes['next-drawnCardTitle'].textContent, '隊伍 2 獲得「加時」');
  assert.match(nodes['next-drawnCardContent'].textContent, /第二張效果/);
  assert.doesNotMatch(nodes['next-drawnCardContent'].textContent, /第一張效果/);
  view.close();
  s.room.activeCard = { id: 'question' }; s.room.lastDraw.id = 'pending'; view.render(s);
  assert.equal(nodes['next-drawnCardDialog'].open, false);
  view.hide();
  s.room = { code: 'SECOND', phase: 'lobby', called: [], lastDraw: null }; view.render(s);
  nodes['next-gameResultsDialog'].emit('close');
  assert.equal(nodes['next-drawnCardDialog'].open, false);
  assert.equal(view.pendingResult, false); assert.equal(view.card, null);
  view.hide();
});

test('Team Bingo renders the same simple black pocket watch in hands, award notices and questions', async t => {
  const nodes = mount(t);
  const { HandView } = await import('../public/js/games/teambingo/views/hand-view.js');
  const { DrawCardView } = await import('../public/js/games/teambingo/views/draw-card-view.js');
  const { SharedCardView } = await import('../public/js/games/teambingo/views/shared-card-view.js');
  const card = { id: 'held', definitionId: 'team-time-plus-2m', name: '加時', symbol: 'pocket-watch', effect: '隊伍行動時間增加 2 分鐘' };
  new HandView({ useCard() {} }).render({ hand: [card], playerId: 'owner', connected: true, room: { phase: 'playing', turn: 'owner' } });
  const handArt = nodes['next-handList'].children[0].children[0].children.find(child => child.className.includes('game-card-art'));
  const drawn = new DrawCardView({ animate: false });
  drawn.render({ playerId: 'owner', room: { code: 'TEAM', phase: 'playing', called: [1], lastDraw: card } });
  const drawArt = nodes['next-drawnCardContent'].children[0].children.find(child => child.className.includes('game-card-art'));
  const shared = new SharedCardView({});
  const s = sharedState(); s.room.activeCard.card.symbol = 'pocket-watch'; shared.render(s);
  for (const art of [handArt, drawArt, nodes['next-sharedCardSymbol']]) {
    assert.equal(art.textContent, '');
    const svg = art.children[0];
    assert.equal(svg.tagName, 'svg'); assert.equal(svg.attributes.class, 'card-pocket-watch');
    assert.equal(svg.attributes.stroke, '#111'); assert.equal(svg.attributes.fill, 'none');
    assert.equal(svg.attributes['aria-hidden'], 'true');
    assert.equal(svg.children.length, 1); assert.ok(svg.children[0].attributes.d);
  }
  shared.close(); drawn.hide();
});

test('Team Bingo shuffle persists the board and requests special-cell reroll immediately', async t => {
  mount(t);
  const { TeamBingoController } = await import('../public/js/games/teambingo/controller.js');
  const calls = [], state = { room: { size: 3, boardVersion: 7 }, draftDirty: true };
  const saved = { code: 'SAVED' };
  const app = { state, perform: operation => operation(), api: { send: async (...args) => { calls.push(args); return { room: saved }; } },
    update: room => { assert.equal(room, saved); } };
  await new TeamBingoController(app).actions().shuffle();
  assert.equal(calls[0][0], 'board');
  assert.equal(calls[0][1].rerollSpecial, true); assert.equal(calls[0][1].boardVersion, 7);
  assert.equal(calls[0][1].ready, undefined);
  assert.deepEqual([...calls[0][1].board].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(state.draftDirty, false);
});

test('Team Bingo shared hand renders usable cards only during the member turn and clears demo cards', async t => {
  const nodes = mount(t);
  const { HandView } = await import('../public/js/games/teambingo/views/hand-view.js');
  const calls = [], hand = [{ id: 'team-card', definitionId: 'star', name: '星光指引', type: '祝福', theme: 'gold', symbol: '✧', description: '不應顯示的卡牌說明', effect: '隊伍行動時間增加2分鐘' }];
  const view = new HandView({ useCard: id => calls.push(id) });
  const s = { hand, playerId: 'member', connected: true, busy: false, room: { phase: 'playing', turn: 'member' } };
  view.render(s);
  assert.equal(nodes['next-handCount'].textContent, '1 張');
  assert.equal(nodes['next-previewCardList'].children.length, 0);
  const card = nodes['next-handList'].children[0].children[0];
  assert.equal(card.disabled, false); assert.match(card.textContent, /星光指引/);
  assert.match(card.textContent, /隊伍行動時間增加2分鐘/);
  assert.doesNotMatch(card.textContent, /不應顯示的卡牌說明/);
  card.click(); assert.deepEqual(calls, ['team-card']);
  view.render({ ...s, room: { ...s.room, turn: 'other' } });
  assert.equal(nodes['next-handList'].children[0].children[0].disabled, true);
  view.render({ ...s, room: { ...s.room, activeCard: { id: 'question' } } });
  assert.equal(nodes['next-handList'].children[0].children[0].disabled, true);
});

test('team hand updates counts and removes stale cards when cards are acquired and consumed', async t => {
  const nodes = mount(t);
  const { HandView } = await import('../public/js/games/teambingo/views/hand-view.js');
  const calls = [], view = new HandView({ useCard: id => calls.push(id) });
  const s = { hand: [], playerId: 'member', connected: true, busy: false, room: { phase: 'playing', turn: 'member' } };
  view.render(s);
  assert.equal(nodes['next-handCount'].textContent, '0 張');
  assert.equal(nodes['next-handEmpty'].hidden, false);
  assert.equal(nodes['next-handEmpty'].textContent, '隊伍目前沒有卡片');
  const card = { definitionId: 'star', name: '星光指引', type: '祝福', theme: 'gold', symbol: '✧', description: '效果' };
  const hand = Object.freeze([Object.freeze({ ...card, id: 'first' }), Object.freeze({ ...card, id: 'second' })]);
  view.render({ ...s, hand });
  assert.equal(nodes['next-handCount'].textContent, '2 張');
  assert.equal(nodes['next-handEmpty'].hidden, true);
  assert.deepEqual(nodes['next-handList'].children.map(item => item.dataset.cardId), ['first', 'second']);
  nodes['next-handList'].children[1].children[0].click();
  assert.deepEqual(calls, ['second'], 'duplicate card definitions still use their unique instance IDs');
  view.render({ ...s, hand: hand.slice(0, 1) });
  assert.equal(nodes['next-handCount'].textContent, '1 張');
  assert.equal(nodes['next-handList'].children.length, 1);
  view.render(s);
  assert.equal(nodes['next-handList'].children.length, 0);
  assert.equal(nodes['next-handEmpty'].hidden, false);
  assert.equal(hand.length, 2, 'rendering does not mutate the authoritative hand');
});

test('team hand blocks card clicks for every unavailable state and enables them again when eligible', async t => {
  const nodes = mount(t);
  const { HandView } = await import('../public/js/games/teambingo/views/hand-view.js');
  const calls = [], view = new HandView({ useCard: id => calls.push(id) });
  const s = { hand: [{ id: 'card', definitionId: 'star', name: '星光指引' }], playerId: 'member', connected: true, busy: false,
    room: { phase: 'playing', turn: 'member' } };
  for (const override of [{ busy: true }, { connected: false }, { room: { ...s.room, turn: 'teammate' } },
    { room: { ...s.room, phase: 'lobby' } }, { room: { ...s.room, phase: 'finished' } },
    { room: { ...s.room, pending: { id: 'pending' } } }, { room: { ...s.room, activeCard: { id: 'question' } } }]) {
    view.render({ ...s, ...override });
    const button = nodes['next-handList'].children[0].children[0];
    assert.equal(button.disabled, true); button.click();
  }
  assert.deepEqual(calls, []);
  view.render(s);
  nodes['next-handList'].children[0].children[0].click();
  assert.deepEqual(calls, ['card']);
});

test('team hand view touches only Team Bingo DOM and never modifies another game hand', async t => {
  const nodes = mount(t);
  const { HandView } = await import('../public/js/games/teambingo/views/hand-view.js');
  nodes.handCount.textContent = '保留原遊戲手牌'; nodes.handEmpty.hidden = false;
  const find = document.getElementById;
  document.getElementById = id => { assert.ok(id.startsWith('next-')); return find(id); };
  const s = { hand: [{ id: 'team-card', definitionId: 'star', name: '星光指引' }], playerId: 'member', connected: true, busy: false,
    room: { phase: 'playing', turn: 'member' } };
  new HandView({ useCard() {} }).render(s);
  assert.equal(nodes.handCount.textContent, '保留原遊戲手牌');
  assert.equal(nodes.handEmpty.hidden, false);
  assert.equal(nodes.handList.children.length, 0);
  assert.equal(nodes['next-handList'].children.length, 1);
});

test('team hand drawer closes for card use, room switches and game completion without opening other games', async t => {
  const nodes = mount(t);
  const { HandDrawerView } = await import('../public/js/games/teambingo/views/hand-drawer-view.js');
  const view = new HandDrawerView();
  const s = { playerId: 'member', me: { id: 'member' }, room: { code: 'ROOM', phase: 'playing', host: 'host' } };
  view.render(s); nodes['next-openHand'].click();
  assert.equal(nodes['next-handPanel'].open, true);
  assert.equal(nodes['next-openHand'].attributes['aria-expanded'], 'true');
  view.render({ ...s, room: { ...s.room, activeCard: { id: 'session' } } });
  assert.equal(nodes['next-handPanel'].open, false);
  assert.equal(nodes['next-openHand'].attributes['aria-expanded'], 'false');
  view.render(s); nodes['next-openHand'].click();
  view.render({ ...s, room: { ...s.room, code: 'OTHER' } });
  assert.equal(nodes['next-handPanel'].open, false);
  nodes['next-openHand'].click();
  view.render({ ...s, room: { ...s.room, phase: 'finished' } });
  assert.equal(nodes['next-handPanel'].open, false); assert.equal(nodes['next-handDock'].hidden, true);
  assert.equal(nodes.handPanel.open, false);
  assert.equal(document.body.classList.contains('has-hand-dock'), false);
});

test('entry exposes the common team duration only when creating Team Bingo rooms', async t => {
  const nodes = mount(t), originalLocation = globalThis.location;
  globalThis.location = { pathname: '/', search: '' };
  t.after(() => { if (originalLocation === undefined) delete globalThis.location; else globalThis.location = originalLocation; });
  const { EntryView } = await import('../public/js/views/entry-view.js');
  nodes.gameType.value = 'teambingo'; nodes.entryTeamMinutes.value = '8';
  const view = new EntryView({ name: 'Host', roomCode: '' }, () => {});
  assert.equal(nodes.teamTimeSettings.hidden, false); assert.equal(view.identity.teamTimeMinutes, 8);
  nodes.entryTeamMinutes.value = '12'; assert.equal(view.identity.teamTimeMinutes, 12);
  nodes.gameType.value = 'bridge-bingo'; nodes.gameType.onchange();
  assert.equal(nodes.teamTimeSettings.hidden, true); assert.equal(view.identity.teamTimeMinutes, undefined);
  globalThis.location = { pathname: '/join', search: '' }; nodes.gameType.value = 'teambingo';
  const join = new EntryView({ name: 'Guest', roomCode: 'ABC123' }, () => {});
  assert.equal(nodes.teamTimeSettings.hidden, true); assert.equal(join.identity.teamTimeMinutes, undefined);
});

test('TeamBingo uses the Bridge-style own-team selector and limits member assignment controls to the host', async t => {
  const nodes = mount(t), sent = [];
  const { PlayersView } = await import('../public/js/games/teambingo/views/players-view.js');
  const view = new PlayersView({ team: (...args) => sent.push(args) });
  const host = { id: 'host', name: 'Host', teamId: 'team-1', ready: true, handCount: 0 },
    guest = { id: 'guest', name: 'Guest', teamId: 'team-2', ready: false, handCount: 0 };
  const room = { phase: 'lobby', host: host.id, onlineCount: 2, playersPerTeam: 1, players: [host, guest], teams: [
    { id: 'team-1', name: '隊伍 1', playerIds: ['host'], lines: 0, rewards: [] },
    { id: 'team-2', name: '隊伍 2', playerIds: ['guest'], lines: 0, rewards: [] }] };
  const s = { room, playerId: guest.id, connected: true, busy: false };
  view.render(s);
  assert.equal(nodes['next-joinControls'].hidden, false); assert.equal(nodes['next-ownTeam'].value, 'team-2');
  assert.equal(nodes['next-ownTeam'].children.length, 3);
  assert.ok(nodes['next-players'].children.every(group => group.children.filter(n => n.className === 'team-roster-member').every(row => row.children.every(n => n.tagName !== 'select'))));
  nodes['next-ownTeam'].value = ''; nodes['next-ownTeam'].onchange();
  assert.deepEqual(sent, [['guest', null]]);
  view.render({ ...s, busy: true }); assert.equal(nodes['next-ownTeam'].disabled, true);
  view.render({ ...s, connected: false }); assert.equal(nodes['next-ownTeam'].disabled, true);
  view.render({ ...s, playerId: host.id });
  const guestRow = nodes['next-players'].children[1].children.find(n => n.className === 'team-roster-member');
  const assignment = guestRow.children.find(n => n.tagName === 'select');
  assignment.value = ''; assignment.onchange(); assert.deepEqual(sent.at(-1), ['guest', null]);
  room.phase = 'playing'; view.render(s);
  assert.equal(nodes['next-joinControls'].hidden, true);
});

test('Bridge Bingo and TeamBingo instantiate the same roster component and share readiness, assignment and inspection behavior', async t => {
  const nodes = mount(t), sent = [];
  const { BridgeRoomView } = await import('../public/js/games/bridge/game-view.js');
  const { PlayersView } = await import('../public/js/games/teambingo/views/players-view.js');
  const { TeamRosterView } = await import('../public/js/views/team-roster-view.js');
  const bridge = new BridgeRoomView({ bridge: (...args) => sent.push(args) });
  const next = new PlayersView({ team: (...args) => sent.push(args), ready: () => sent.push(['ready']), captain: (...args) => sent.push(['captain', ...args]) });
  assert.ok(bridge.roster instanceof TeamRosterView); assert.equal(bridge.roster.constructor, next.roster.constructor);
  const s = bridgeState(); bridge.render(s);
  assert.equal(nodes.bridgeTeams.className, nodes['next-players'].className);
  assert.equal(nodes.bridgeJoinControls.className, nodes['next-joinControls'].className);
  nodes.bridgeReady.click(); assert.deepEqual(sent.at(-1), ['bridgeReady', { ready: true, board: [1, 2, 3, 4, 5, 6, 7, 8, 9], boardVersion: 0 }]);
  nodes.bridgeOwnTeam.value = ''; nodes.bridgeOwnTeam.onchange();
  assert.deepEqual(sent.at(-1), ['bridgeTeam', { playerId: 'host', teamId: null }]);
  nodes.bridgeTeams.children[1].children[0].click(); assert.equal(bridge.viewedTeam, 'team-2');
  const snapshot = { room: { ...s.room, teams: s.room.bridge.teams.map(team => ({ ...team, rewards: [] })), playersPerTeam: 1 },
    me: s.me, playerId: 'host', connected: true, busy: false };
  next.render(snapshot); nodes['next-ready'].click(); assert.deepEqual(sent.at(-1), ['ready']);
  const captainControl = nodes['next-players'].children[0].children.find(n => n.className === 'team-roster-captain-control');
  const bridgeCaptainControl = nodes.bridgeTeams.children[0].children.find(n => n.className === 'team-roster-captain-control');
  assert.equal(captainControl.className, bridgeCaptainControl.className);
  captainControl.children[0].value = 'host'; captainControl.children[0].onchange();
  assert.deepEqual(sent.at(-1), ['captain', 'team-1', 'host']);
  snapshot.room.teams[0].captainId = 'host'; next.render(snapshot);
  assert.match(nodes['next-players'].children[0].textContent, /隊長/);
  snapshot.room.host = 'other'; next.render(snapshot);
  assert.ok(nodes['next-players'].children.every(group => !group.children.some(n => n.className === 'team-roster-captain-control')));
  snapshot.room.host = 'host';
  nodes['next-players'].scrollTop = 80;
  s.me.ready = true; next.render(snapshot);
  assert.equal(nodes['next-ready'].textContent, '取消準備'); assert.equal(nodes['next-players'].scrollTop, 80);
  snapshot.room.activeCard = { id: 'pause' }; next.render(snapshot);
  assert.equal(nodes['next-ownTeam'].disabled, true); assert.equal(nodes['next-ready'].disabled, true);
  snapshot.room.phase = 'playing'; next.render(snapshot);
  assert.equal(nodes['next-joinControls'].hidden, true);
  snapshot.room.phase = 'lobby'; snapshot.room.activeCard = null;
  s.me.teamId = null; next.render(snapshot);
  assert.equal(nodes['next-ready'].disabled, true);
  assert.match(nodes['next-players'].children.at(-1).textContent, /未分隊/);
});

test('Team Bingo board displays the active team countdown and freezes it while questions pause play', async t => {
  const nodes = mount(t);
  const { BoardView } = await import('../public/js/games/teambingo/views/board-view.js');
  const s = bridgeState('playing');
  s.room.board = s.room.bridge.teams[0].cells.map(cell => cell.number);
  s.room.cells = s.room.board.map(number => ({ number, isCovered: false }));
  s.room.called = []; s.room.linePrizes = [];
  s.room.teams = s.room.bridge.teams.map(team => ({ ...team, rewards: [], timeRemainingMs: 600000, clockRunning: team.id === 'team-1' }));
  s.room.turn = s.playerId; s.draft = s.room.board;
  const view = new BoardView({ shuffle() {}, call() {} }); t.after(() => view.hide());
  view.render(s);
  const started = view.actionClock.receivedAt;
  view.updateClock(started + 1000);
  assert.match(nodes['next-phaseText'].textContent, /隊伍 1 剩餘 09:59/);
  s.room.activeCard = { id: 'question' }; s.room.teams[0].clockRunning = false;
  view.render(s); view.updateClock(Date.now() + 120000);
  assert.match(nodes['next-phaseText'].textContent, /10:00.*暫停計時/);
  view.hide(); assert.equal(view.clockTimer, null);
});

function boardClockState() {
  const s = bridgeState('playing');
  s.room.board = s.room.bridge.teams[0].cells.map(cell => cell.number);
  s.room.cells = s.room.board.map(number => ({ number, isCovered: false }));
  s.room.called = []; s.room.linePrizes = [];
  s.room.players.push({ id: 'guest', name: 'Guest', teamId: 'team-2' });
  s.room.teams = s.room.bridge.teams.map(team => ({ ...team, rewards: [], timeRemainingMs: 600000, clockRunning: team.id === 'team-1' }));
  s.room.turn = s.playerId; s.draft = s.room.board;
  return s;
}

test('board countdown switches teams with one timer and releases it when the game ends or view hides', async t => {
  const nodes = mount(t), timers = new Set();
  t.mock.method(globalThis, 'setInterval', () => { const timer = { unref() {} }; timers.add(timer); return timer; });
  t.mock.method(globalThis, 'clearInterval', timer => timers.delete(timer));
  const { BoardView } = await import('../public/js/games/teambingo/views/board-view.js');
  const view = new BoardView({ shuffle() {}, call() {} }), s = boardClockState();
  view.render(s); assert.equal(timers.size, 1);
  assert.match(nodes['next-phaseText'].textContent, /隊伍 1 剩餘 10:00/);
  s.room.turn = 'guest'; s.room.teams[0].clockRunning = false;
  s.room.teams[1].clockRunning = true; s.room.teams[1].timeRemainingMs = 123000;
  view.render(s); assert.equal(timers.size, 1);
  assert.match(nodes['next-phaseText'].textContent, /隊伍 2 剩餘 02:03/);
  assert.doesNotMatch(nodes['next-phaseText'].textContent, /隊伍 1 剩餘/);
  s.room.phase = 'finished'; view.render(s);
  assert.equal(timers.size, 0); assert.equal(view.actionClock, null);
  assert.equal(nodes['next-phaseText'].hidden, true);
  s.room.phase = 'playing'; view.render(s); view.hide();
  assert.equal(timers.size, 0); assert.equal(view.clockTimer, null);
});

test('board countdown rounds remaining partial seconds upward and never displays negative time', async t => {
  const nodes = mount(t);
  const { BoardView } = await import('../public/js/games/teambingo/views/board-view.js');
  const view = new BoardView({ shuffle() {}, call() {} }), s = boardClockState();
  t.after(() => view.hide());
  s.room.teams[0].timeRemainingMs = 1; view.render(s);
  const received = view.actionClock.receivedAt;
  view.updateClock(received); assert.match(nodes['next-phaseText'].textContent, /00:01/);
  view.updateClock(received + 1); assert.match(nodes['next-phaseText'].textContent, /00:00/);
  view.updateClock(received + 10000); assert.match(nodes['next-phaseText'].textContent, /00:00/);
  assert.doesNotMatch(nodes['next-phaseText'].textContent, /-\d/);
});

test('team clocks count down locally while paused teams stay unchanged and expired teams are marked', async t => {
  const nodes = mount(t);
  const { PlayersView } = await import('../public/js/games/teambingo/views/players-view.js');
  const s = bridgeState('playing');
  s.room.teams = s.room.bridge.teams.map((team, index) => ({ ...team, rewards: [], timeRemainingMs: index ? 300000 : 600000, clockRunning: index === 0 }));
  s.room.playersPerTeam = 1; s.room.turn = 'host';
  const view = new PlayersView({ team() {}, ready() {}, captain() {} }); t.after(() => view.hide());
  view.render(s);
  const started = view.roster.clockLabels[0].receivedAt;
  const heading = nodes['next-players'].children[0].children[0];
  assert.equal(heading.className, 'team-roster-heading');
  assert.equal(heading.children[0].className, 'team-roster-title');
  assert.equal(heading.children[1], view.roster.clockLabels[0].label);
  assert.equal(heading.children[1].tagName, 'span');
  view.roster.updateClocks(started + 1000);
  assert.match(view.roster.clockLabels[0].label.textContent, /09:59/);
  assert.match(view.roster.clockLabels[1].label.textContent, /05:00/);
  view.roster.updateClocks(started + 600000);
  assert.equal(view.roster.clockLabels[0].label.textContent, '時間用完');
  assert.match(view.roster.clockLabels[0].label.title, /自動跳過/);
  s.room.teams[0].clockRunning = false; s.room.teams[0].timeRemainingMs = 540000;
  view.render(s); view.roster.updateClocks(Date.now() + 3600000);
  assert.match(view.roster.clockLabels[0].label.textContent, /09:00/);
  view.hide(); assert.equal(view.clockTimer, null);
  assert.equal(nodes.bridgeTeams.children.length, 0);
});

test('each team keeps exactly one countdown inside its own heading after roster updates', async t => {
  const nodes = mount(t);
  const { PlayersView } = await import('../public/js/games/teambingo/views/players-view.js');
  const view = new PlayersView({ team() {}, ready() {}, captain() {} }), s = boardClockState();
  t.after(() => view.hide());
  s.room.goal = 1; s.room.playersPerTeam = 1;
  s.room.teams[0].timeRemainingMs = 480000;
  s.room.teams[1].timeRemainingMs = 123000;
  const verify = times => nodes['next-players'].children.forEach((group, index) => {
    const heading = group.children[0];
    assert.equal(heading.className, 'team-roster-heading');
    assert.equal(heading.children[0].textContent, `隊伍 ${index + 1} · ${s.room.teams[index].lines} / 1 條`);
    assert.equal(heading.children.length, 2);
    assert.equal(heading.children[1], view.roster.clockLabels[index].label);
    assert.equal(heading.children[1].textContent, `剩餘 ${times[index]}`);
    assert.equal(group.children.some(child => child.className === 'team-roster-clock'), false);
  });
  view.render(s); verify(['08:00', '02:03']);
  s.room.teams[0].lines = 1;
  s.room.teams[0].timeRemainingMs = 420000;
  s.room.teams[1].timeRemainingMs = 120000;
  view.render(s); verify(['07:00', '02:00']);
  assert.equal(view.roster.clockLabels.length, 2);
});

test('heading countdown rounds upward, pauses, expires without negative values and resumes on server update', async t => {
  mount(t);
  t.mock.method(Date, 'now', () => 1000);
  const { PlayersView } = await import('../public/js/games/teambingo/views/players-view.js');
  const view = new PlayersView({ team() {}, ready() {}, captain() {} }), s = boardClockState();
  t.after(() => view.hide());
  s.room.teams[0].timeRemainingMs = 1001;
  s.room.teams[1].timeRemainingMs = 60000;
  view.render(s);
  const [running, paused] = view.roster.clockLabels.map(entry => entry.label);
  assert.equal(running.textContent, '剩餘 00:02');
  assert.equal(running.title, '計時中');
  assert.equal(paused.title, '暫停計時');
  view.roster.updateClocks(1001);
  assert.equal(running.textContent, '剩餘 00:01');
  view.roster.updateClocks(999999);
  assert.equal(running.textContent, '時間用完');
  assert.equal(running.title, '時間用完 · 自動跳過');
  assert.equal(running.classList.contains('is-expired'), true);
  assert.equal(paused.textContent, '剩餘 01:00');
  assert.equal(paused.classList.contains('is-expired'), false);
  s.room.teams[0].timeRemainingMs = 120000;
  view.render(s);
  const restored = view.roster.clockLabels[0].label;
  assert.equal(restored.textContent, '剩餘 02:00');
  assert.equal(restored.classList.contains('is-expired'), false);
});

test('shared team headings omit clocks when no budget exists and retain team inspection actions', async t => {
  const nodes = mount(t);
  const { PlayersView } = await import('../public/js/games/teambingo/views/players-view.js');
  const view = new PlayersView({ team() {}, ready() {}, captain() {} }), s = boardClockState();
  t.after(() => view.hide());
  view.render(s);
  const inspected = [];
  view.roster.onInspect = teamId => inspected.push(teamId);
  view.roster.render({ ...view.roster.model, activeTeamId: 'team-1', teams: s.room.teams.map(team => ({ ...team, timeRemainingMs: undefined })) });
  assert.equal(view.roster.clockLabels.length, 0);
  nodes['next-players'].children.forEach((group, index) => {
    const heading = group.children[0];
    assert.equal(heading.tagName, 'button');
    assert.equal(heading.children.length, 1);
    assert.equal(heading.children[0].className, 'team-roster-title');
    if (index === 0) assert.match(heading.children[0].textContent, /出牌中/);
    heading.click();
  });
  assert.deepEqual(inspected, ['team-1', 'team-2']);
});

test('exhausted team clocks show a game result without falsely declaring a winner', async t => {
  const nodes = mount(t);
  const { RewardsView } = await import('../public/js/games/teambingo/views/rewards-view.js');
  new RewardsView().render({ room: { code: 'TIMEOUT', phase: 'finished', endReason: 'time-exhausted', winners: [], teams: [] } });
  assert.equal(nodes['next-gameResultsTitle'].textContent, '遊戲結束・無勝者');
});

test('TeamBingo start controls require occupied teams and readiness rather than full capacity', async t => {
  const nodes = mount(t);
  const { HostControlsView } = await import('../public/js/games/teambingo/views/host-controls-view.js');
  const view = new HostControlsView({ command() {} });
  const players = [{ id: 'host', teamId: 'team-1', ready: true }, { id: 'guest', teamId: 'team-2', ready: true }];
  const room = { host: 'host', phase: 'lobby', size: 5, goal: 3, teamCount: 2, playersPerTeam: 4, players,
    teams: [{ playerIds: ['host'] }, { playerIds: ['guest'] }] };
  const s = { room, me: players[0], busy: false, connected: true };
  view.render(s); assert.equal(nodes['next-start'].disabled, false); assert.match(nodes['next-start'].textContent, /開始遊戲/);
  players[1].ready = false; view.render(s); assert.equal(nodes['next-start'].disabled, true); assert.match(nodes['next-start'].textContent, /等待 1 位/);
  players[1].ready = true; room.teams[1].playerIds = []; view.render(s);
  assert.equal(nodes['next-start'].disabled, true); assert.match(nodes['next-start'].textContent, /每隊至少/);
  room.teams[1].playerIds = ['guest']; players[1].teamId = null; view.render(s);
  assert.equal(nodes['next-start'].disabled, true); assert.match(nodes['next-start'].textContent, /分隊/);
  players[1].teamId = 'team-2'; view.render({ ...s, connected: false }); assert.equal(nodes['next-start'].disabled, true);
  view.render({ ...s, busy: true }); assert.equal(nodes['next-start'].disabled, true);
});

test('entry views restore Alberta titles and accept login only after text composition finishes', async t => {
  const nodes = mount(t), sent = [], originalLocation = globalThis.location;
  t.after(() => { if (originalLocation === undefined) delete globalThis.location; else globalThis.location = originalLocation; });
  const { EntryView } = await import('../public/js/views/entry-view.js');
  document.querySelectorAll = selector => { assert.equal(selector, '.entry button'); return [nodes.create, nodes.join]; };
  for (const pathname of ['/', '/join', '/bridge-bingo', '/teambingo']) {
    globalThis.location = { pathname, search: '?room=ABC123' };
    const view = new EntryView({ name: 'Alice', roomCode: 'ABC123' }, kind => sent.push(kind));
    document.title = 'Previous game title'; view.show();
    assert.equal(document.title, pathname === '/' ? 'Alberta · 多人賓果' : '加入朋友的房間 · Alberta');
    assert.equal(nodes.welcome.hidden, false); view.hide(); assert.equal(nodes.welcome.hidden, true);
    view.setBusy(true); nodes.join.click(); assert.equal(sent.length, 0);
    view.setBusy(false); assert.equal(nodes.join.disabled, false); assert.equal(nodes.create.disabled, false);
  }
  const enter = nodes.name.listeners.keydown.at(-1);
  enter({ key: 'Enter', isComposing: true }); assert.deepEqual(sent, []);
  enter({ key: 'Escape', isComposing: false }); assert.deepEqual(sent, []);
  enter({ key: 'Enter', isComposing: false }); assert.deepEqual(sent, ['join']);
  nodes.join.click(); assert.deepEqual(sent, ['join', 'join']);
  const view = new EntryView({ name: 'Alice', roomCode: 'ABC123' }, () => {});
  view.switchPlayer('DEF456');
  assert.equal(nodes.code.value, 'DEF456'); assert.equal(nodes.name.value, ''); assert.equal(nodes.name.focused, true);
});

test('pending hands show only placeholders in both games without mutating or using stored cards', async t => {
  const nodes = mount(t);
  const { PendingHandView } = await import('../public/js/views/pending-hand-view.js');
  const held = { id: 'held', name: '星光指引', symbol: '✧', effect: '舊效果', description: '舊說明' };
  const demo = { id: 'demo', name: '森林守護', description: '示範說明' };
  const s = { hand: [held], room: { availableDemoCards: [demo] } }, original = structuredClone(s);
  for (const prefix of ['', 'next-']) {
    const view = new PendingHandView(id => nodes[prefix + id]);
    view.render(s);
    assert.equal(nodes[prefix + 'handCount'].textContent, '2 張');
    assert.equal(nodes[prefix + 'handEmpty'].hidden, true);
    for (const id of ['handList', 'previewCardList']) {
      const card = nodes[prefix + id].children[0].children[0];
      assert.equal(card.tagName, 'div'); assert.equal(card.textContent, '待定');
      assert.equal(card.onclick, undefined); card.click();
    }
    assert.equal(nodes[prefix + 'sharedCardDialog'].open, false);
    assert.equal(nodes[prefix + 'cardPreviewDialog'].open, false);
    view.render({ hand: [], room: { availableDemoCards: [] } });
    assert.equal(nodes[prefix + 'handCount'].textContent, '0 張');
    assert.equal(nodes[prefix + 'handEmpty'].hidden, false); assert.equal(nodes[prefix + 'handEmpty'].textContent, '待定');
    assert.equal(nodes[prefix + 'handList'].children.length, 0); assert.equal(nodes[prefix + 'previewCardList'].children.length, 0);
    assert.equal(nodes[prefix + 'previewCardsEmpty'].hidden, true);
  }
  assert.deepEqual(s, original);
});

test('both games use shared card faces and concealed backs without changing card content', async t => {
  const nodes = mount(t);
  const { HandView } = await import('../public/js/games/bingo/views/hand-view.js');
  const { BridgeBoardView } = await import('../public/js/games/bridge/board-view.js');
  const { DrawCardView } = await import('../public/js/games/bingo/views/draw-card-view.js');
  const { DrawCardView: NextDrawCardView } = await import('../public/js/games/teambingo/views/draw-card-view.js');
  new DrawCardView().reset();
  new NextDrawCardView().reset();
  const bridge = new BridgeBoardView({ bridge() {} }), s = bridgeState();
  bridge.render(s, s.room.bridge.teams[0]);
  assert.match(nodes.bridgeHand.children[0].className, /bridge-hand-back/);
  assert.doesNotMatch(nodes.bridgeHand.children[0].className, /bridge-number-card/);
  assert.match(nodes.bridgeHand.children[0].className, /card-back-parchment/);
  assert.equal(nodes.bridgeHand.children[0].textContent, '');
  for (const back of [nodes.drawCardDisplay.children[0], nodes['next-drawCardDisplay'].children[0], nodes.bridgeHand.children[0]]) {
    assert.match(back.className, /game-card-back/);
    assert.equal(back.attributes['aria-hidden'], 'true');
    assert.equal(back.children[0].tagName, 'svg');
    assert.equal(back.children[0].attributes.class, 'card-back-anchor');
    assert.equal(back.children[0].attributes['aria-hidden'], 'true');
  }
  const card = { id: 'spell', definitionId: 'star', theme: 'green', type: '能力', symbol: '✦', name: '星光', description: '卡牌說明', effect: '卡牌效果' };
  new HandView({ useCard() {} }).render(state({ hand: [card], connected: true }));
  assert.match(nodes.handList.children[0].children[0].className, /game-card-front/);
  assert.match(nodes.handList.children[0].textContent, /星光卡牌效果/);
  s.me.hand = [{ number: 3, color: 'blue' }];
  s.room.phase = 'playing'; s.room.bridge.legalMoves = [{ cardNumber: 3, targets: [3] }];
  bridge.render(s, s.room.bridge.teams[0]);
  assert.match(nodes.bridgeHand.children[0].className, /game-card-front/);
  assert.equal(nodes.bridgeHand.children[0].textContent, '藍色3');
  const watermark = nodes.bridgeHand.children[0].children.find(child => child.attributes.class === 'card-anchor-watermark');
  assert.ok(watermark);
  assert.equal(watermark.attributes['aria-hidden'], 'true');
  assert.equal(watermark.attributes.focusable, 'false');
  assert.equal(watermark.children[0].attributes.d, nodes.drawCardDisplay.children[0].children[0].children[0].attributes.d);
  nodes.bridgeHand.children[0].click();
  assert.match(nodes.bridgeCardChoiceCard.children[0].className, /game-card-front/);
  assert.equal(s.me.hand.length, 1);
});

test('Bridge scan is only shown to the host before play and disables during disconnection or requests', async t => {
  const nodes = mount(t), commands = [];
  const { BridgeRoomView } = await import('../public/js/games/bridge/game-view.js');
  const view = new BridgeRoomView({ bridge: (...args) => commands.push(args) }), s = bridgeState();
  view.render(s);
  assert.equal(nodes.bridgeScan.hidden, false); assert.equal(nodes.bridgeScan.disabled, false);
  nodes.bridgeScan.click(); assert.deepEqual(commands, [['bridgeScan']]);
  s.busy = true; view.render(s); assert.equal(nodes.bridgeScan.disabled, true);
  s.busy = false; s.connected = false; view.render(s); assert.equal(nodes.bridgeScan.disabled, true);
  s.connected = true; s.room.lastScanAt = 1; s.room.lastScanRemovedCount = 2; view.render(s);
  assert.equal(nodes.bridgeScanHint.textContent, '');
  assert.equal(nodes.bridgeScanHint.hidden, true);
  assert.equal(nodes.bridgeMoveHint.hidden, true);
  assert.equal(nodes.bridgeHandEmpty.hidden, true);
  s.playerId = 'other'; view.render(s);
  assert.equal(nodes.bridgeScan.hidden, true); assert.equal(nodes.bridgeScanHint.hidden, true);
  s.playerId = 'host'; s.room.phase = 'playing'; view.render(s);
  assert.equal(nodes.bridgeScan.hidden, true); assert.equal(nodes.bridgeScanHint.hidden, true);
});

test('the room shell can run Bridge with no Bingo DOM and never initializes an inactive game', async t => {
  const nodes = mount(t);
  const { RoomView } = await import('../public/js/views/room-view.js');
  const lookup = document.getElementById;
  const forbidden = new Set(['game', 'board', 'handPanel', 'openHand', 'confirmCall', 'sharedCardDialog', 'lineNotices']);
  document.getElementById = id => { assert.equal(forbidden.has(id), false, `Bridge touched Bingo DOM: ${id}`); return lookup(id); };
  const view = new RoomView({ leave() {}, switchPlayer() {} }, {}, () => {}, () => bridgeState(), () => ({ bridge() {} }));
  view.render(bridgeState()); view.render(bridgeState());
  assert.equal(view.instances.size, 1);
  assert.equal(view.instances.has('bingo'), false);
  assert.equal(nodes.bridgeGame.hidden, false);
  assert.equal(nodes.welcome.hidden, true);
  view.hide();
  assert.equal(nodes.bridgeGame.hidden, true);
});

test('room lifecycle hides only the previous game and reuses views without rebinding handlers', async t => {
  mount(t);
  const { RoomView } = await import('../public/js/views/room-view.js');
  const { getClientGame } = await import('../public/js/games/index.js');
  const created = [], hidden = [];
  for (const id of ['bingo', 'bridge-bingo']) t.mock.method(getClientGame(id), 'createView', () => {
    created.push(id);
    return { render() {}, hide() { hidden.push(id); } };
  });
  const view = new RoomView({ leave() {}, switchPlayer() {} }, {}, () => {}, () => ({}));
  view.render({ room: { gameType: 'bingo' } });
  view.render({ room: { gameType: 'bridge-bingo' } });
  view.render({ room: { gameType: 'bridge-bingo' } });
  assert.deepEqual(hidden, ['bingo']);
  view.render({ room: { gameType: 'bingo' } });
  assert.deepEqual(created, ['bingo', 'bridge-bingo']);
  assert.deepEqual(hidden, ['bingo', 'bridge-bingo']);
});

test('Bridge host can select captains and all players see badges without guest assignment controls', async t => {
  const nodes = mount(t);
  const { BridgeRoomView } = await import('../public/js/games/bridge/game-view.js');
  const calls = [], view = new BridgeRoomView({ bridge: (...args) => calls.push(args) });
  const s = bridgeState(), team = s.room.bridge.teams[0];
  view.render(s);
  const control = nodes.bridgeTeams.children[0].children.find(child => child.className === 'team-roster-captain-control');
  const select = control.children[0];
  assert.deepEqual(select.children.map(option => option.value), ['', 'host']);
  select.value = 'host'; select.onchange();
  assert.deepEqual(calls, [['bridgeCaptain', { teamId: 'team-1', playerId: 'host' }]]);
  team.captainId = 'host';
  view.render(s);
  const member = nodes.bridgeTeams.children[0].children.find(child => child.className.includes('team-roster-member'));
  assert.match(member.textContent, /隊長/);
  s.room.host = 'other'; view.render(s);
  assert.ok(nodes.bridgeTeams.children.every(group => !group.children.some(child => child.className === 'team-roster-captain-control')));
  assert.match(nodes.bridgeTeams.textContent, /隊長/);
});

test('Bridge lobby edits validate duplicates, retain drafts through teammate updates and save with readiness', async t => {
  const nodes = mount(t);
  const { BridgeRoomView } = await import('../public/js/games/bridge/game-view.js');
  const calls = [], view = new BridgeRoomView({ bridge: (...args) => calls.push(args) }), s = bridgeState();
  view.render(s);
  assert.ok(nodes.bridgeBoard.children.every(cell => cell.tagName === 'input'));
  nodes.bridgeBoard.children[0].value = '2'; nodes.bridgeBoard.children[0].emit('input');
  assert.equal(nodes.bridgeReady.disabled, true);
  nodes.bridgeBoard.children[1].value = '1'; nodes.bridgeBoard.children[1].emit('input');
  assert.equal(nodes.bridgeReady.disabled, false);
  view.render(s);
  assert.equal(nodes.bridgeBoard.children[0].value, 2);
  nodes.bridgeReady.click();
  assert.deepEqual(calls.at(-1), ['bridgeReady', { ready: true, board: [2, 1, 3, 4, 5, 6, 7, 8, 9], boardVersion: 0 }]);
  s.room.bridge.teams[0].boardVersion = 1;
  view.render(s);
  assert.equal(nodes.bridgeBoard.children[0].value, 1);
  view.viewedTeam = 'team-2'; view.render(s);
  assert.ok(nodes.bridgeBoard.children.every(cell => cell.tagName === 'button' && cell.disabled));
  view.viewedTeam = 'team-1'; s.me.ready = true; view.render(s);
  assert.ok(nodes.bridgeBoard.children.every(cell => cell.tagName === 'button'));
});

test('Bridge Bingo renders teams, a plain numbered board and preparation controls independently of Bingo', async t => {
  const nodes = mount(t);
  const { BridgeRoomView } = await import('../public/js/games/bridge/game-view.js');
  const view = new BridgeRoomView({ bridge() {} });
  view.render(bridgeState());
  assert.equal(nodes.bridgeGame.hidden, false);
  assert.equal(nodes.bridgeRoomCode.textContent, 'BRIDGE');
  assert.equal(nodes.game.hidden, false, 'the game view must not touch another game root');
  assert.equal(nodes.welcome.hidden, false, 'common chrome belongs to the room shell');
  assert.equal(nodes.bridgeBoard.children.length, 9);
  assert.equal(nodes.bridgeTeams.children.length, 2);
  assert.equal(nodes.bridgeSettingsPanel.hidden, false);
  assert.equal(nodes.bridgeStart.disabled, true);
  assert.equal(nodes.bridgeReady.hidden, false);
  const partial = bridgeState();
  partial.room.bridge.playersPerTeam = 4;
  partial.me.ready = true;
  partial.room.players.push({ id: 'guest', name: 'Guest', teamId: 'team-2', ready: true, online: true });
  partial.room.bridge.teams[1].playerIds = ['guest'];
  view.render(partial);
  assert.equal(nodes.bridgeStart.disabled, false, 'one ready player per team is sufficient');
  partial.room.players[1].ready = false;
  view.render(partial);
  assert.equal(nodes.bridgeStart.disabled, true);
  view.hide(); assert.equal(nodes.bridgeGame.hidden, true);
});

test('Bridge card selection highlights legal destinations and sends the card, target and round', async t => {
  const nodes = mount(t);
  const { BridgeBoardView } = await import('../public/js/games/bridge/board-view.js');
  const calls = [];
  const view = new BridgeBoardView({ bridge: (kind, data) => calls.push([kind, data]) });
  const s = bridgeState('playing');
  s.room.size = 4;
  s.room.goal = 2;
  s.room.bridge.teams.forEach(team => { team.cells = Array.from({ length: 16 }, (_, i) => ({ number: i + 1, card: null })); });
  s.me.hand = [{ number: 2, color: 'blue' }, { number: 10, color: 'yellow' }, { number: 1, color: 'red' }];
  s.room.bridge.legalMoves = [{ cardNumber: 1, targets: [7] }, { cardNumber: 2, targets: [] }];
  const team = s.room.bridge.teams[0];
  view.render(s, team);
  assert.deepEqual(nodes.bridgeHand.children.map(card => card.children[1].textContent), ['1', '2', '10']);
  assert.deepEqual(s.me.hand.map(card => card.number), [2, 10, 1], 'display sorting must not reorder the dealt hand');
  assert.doesNotMatch(nodes.bridgeHand.children[0].className, /is-unplayable/);
  assert.match(nodes.bridgeHand.children[1].className, /is-unplayable/);
  nodes.bridgeHand.children[0].click();
  assert.equal(nodes.bridgeCardChoiceDialog.open, true);
  assert.ok(nodes.bridgeBoard.children.every(cell => cell.disabled));
  assert.deepEqual(calls, []);
  nodes.bridgeConfirmCardChoice.click();
  assert.equal(nodes.bridgeCardChoiceDialog.open, false);
  assert.equal(nodes.bridgeBoard.children[6].disabled, false);
  assert.ok(nodes.bridgeBoard.children.filter((_, i) => i !== 6).every(cell => cell.disabled));
  nodes.bridgeBoard.children[6].click();
  assert.deepEqual(calls, [['bridgePlay', { cardNumber: 1, targetNumber: 7, round: 1 }]]);
  view.render(s, s.room.bridge.teams[1]);
  assert.ok(nodes.bridgeHand.children.every(card => card.className.includes('is-unplayable')));
});

test('Bridge card choice explains suit violations and closes without using cards', async t => {
  const nodes = mount(t);
  const { BridgeBoardView } = await import('../public/js/games/bridge/board-view.js');
  const calls = [], s = bridgeState('playing');
  s.me.hand = [{ number: 1, color: 'yellow' }, { number: 2, color: 'red' }];
  s.room.bridge.teams[0].leadColor = 'yellow';
  s.room.bridge.legalMoves = [{ cardNumber: 1, targets: [1] }, { cardNumber: 2, targets: [] }];
  const view = new BridgeBoardView({ bridge: (...args) => calls.push(args) });
  view.render(s, s.room.bridge.teams[0]);
  nodes.bridgeHand.children[1].click();
  assert.match(nodes.bridgeCardChoiceTitle.textContent, /無法使用/);
  assert.match(nodes.bridgeCardChoiceReason.textContent, /指定黃色.*持有黃色.*必須跟色/);
  assert.equal(nodes.bridgeConfirmCardChoice.hidden, true);
  nodes.bridgeCloseCardChoice.click();
  assert.equal(nodes.bridgeCardChoiceDialog.open, false);
  nodes.bridgeHand.children[0].click(); nodes.bridgeCancelCardChoice.click();
  assert.equal(view.selected, null);
  assert.equal(s.me.hand.length, 2);
  assert.deepEqual(calls, []);
});

test('Bridge blocked cards ask for discard confirmation and cancellation preserves the hand', async t => {
  const nodes = mount(t);
  const { BridgeBoardView } = await import('../public/js/games/bridge/board-view.js');
  const s = bridgeState('playing'), calls = [], team = s.room.bridge.teams[0];
  s.me.hand = [{ number: 1, color: 'red' }];
  s.room.bridge.legalMoves = [{ cardNumber: 1, targets: [], canDiscard: true }];
  const view = new BridgeBoardView({ bridge: (...args) => calls.push(args) });
  view.render(s, team);
  assert.match(nodes.bridgeHand.children[0].attributes['aria-label'], /只能丟棄/);
  nodes.bridgeHand.children[0].click();
  assert.match(nodes.bridgeCardChoiceTitle.textContent, /丟棄紅色 1/);
  assert.match(nodes.bridgeCardChoiceReason.textContent, /消耗卡片.*下一位/);
  nodes.bridgeCancelCardChoice.click();
  assert.equal(s.me.hand.length, 1); assert.deepEqual(calls, []);
  nodes.bridgeHand.children[0].click(); nodes.bridgeConfirmCardChoice.click();
  assert.deepEqual(calls, [['bridgePlay', { cardNumber: 1, discard: true, round: 1 }]]);
  assert.equal(view.selected, null);
  assert.ok(nodes.bridgeBoard.children.every(cell => cell.disabled));
});

test('Bridge card confirmation rechecks updates and invalidates dialogs from an older round', async t => {
  const nodes = mount(t);
  const { BridgeBoardView } = await import('../public/js/games/bridge/board-view.js');
  const s = bridgeState('playing'), calls = [];
  s.me.hand = [{ number: 1, color: 'red' }];
  s.room.bridge.legalMoves = [{ cardNumber: 1, targets: [1] }];
  const team = s.room.bridge.teams[0];
  const view = new BridgeBoardView({ bridge: (...args) => calls.push(args) });
  view.render(s, team); nodes.bridgeHand.children[0].click();
  const waiting = { ...team, done: true, turn: null };
  view.render(s, waiting);
  assert.match(nodes.bridgeCardChoiceReason.textContent, /本隊已完成/);
  nodes.bridgeConfirmCardChoice.click();
  assert.equal(view.selected, null);
  assert.deepEqual(calls, []);
  const newer = { ...s, room: { ...s.room, bridge: { ...s.room.bridge, round: 2 } } };
  view.render(newer, team);
  assert.equal(nodes.bridgeCardChoiceDialog.open, false);
  nodes.bridgeHand.children[0].click();
  view.hide();
  assert.equal(nodes.bridgeCardChoiceDialog.open, false);
});

test('waiting Bridge teams see which team is playing and cannot select a card for placement', async t => {
  const nodes = mount(t), s = bridgeState('playing');
  const { BridgeRoomView } = await import('../public/js/games/bridge/game-view.js');
  s.me.hand = [{ number: 1, color: 'red' }];
  s.room.bridge.activeTeamId = 'team-2';
  s.room.players.push({ id: 'guest', name: '測試隊員', teamId: 'team-2', online: true });
  s.room.bridge.teams[1].turn = 'guest';
  s.room.bridge.teams[0].turn = null;
  s.room.bridge.legalMoves = [{ cardNumber: 1, targets: [] }];
  const calls = [], view = new BridgeRoomView({ bridge: (...args) => calls.push(args) });
  view.render(s);
  assert.match(nodes.bridgeStatus.textContent, /目前由 隊伍 2 出牌/);
  assert.match(nodes.bridgeRound.textContent, /隊伍 2 出牌中/);
  assert.match(nodes.bridgeRound.textContent, /輪到 測試隊員/);
  assert.equal(nodes.bridgeBoard.children.every(cell => cell.disabled), true);
  nodes.bridgeHand.children[0].click();
  assert.match(nodes.bridgeCardChoiceReason.textContent, /目前由 隊伍 2 出牌/);
  assert.equal(nodes.bridgeConfirmCardChoice.hidden, true);
  assert.deepEqual(calls, []);
});

test('Bridge card issues distinguish room phase, connection, turn, team and missing card', async () => {
  const { cardPlayIssue } = await import('../public/js/games/bridge/card-choice-view.js');
  const s = bridgeState('playing'), team = s.room.bridge.teams[0];
  s.me.hand = [{ number: 1, color: 'blue' }];
  s.room.bridge.legalMoves = [{ cardNumber: 1, targets: [1] }];
  assert.equal(cardPlayIssue(s, team, 1), '');
  assert.match(cardPlayIssue({ ...s, connected: false }, team, 1), /斷線/);
  assert.match(cardPlayIssue({ ...s, busy: true }, team, 1), /處理中/);
  assert.match(cardPlayIssue({ ...s, room: { ...s.room, phase: 'lobby' } }, team, 1), /尚未開始/);
  assert.match(cardPlayIssue({ ...s, room: { ...s.room, phase: 'finished' } }, team, 1), /已結束/);
  assert.match(cardPlayIssue(s, { ...team, id: 'team-2' }, 1), /其他隊伍/);
  assert.match(cardPlayIssue(s, { ...team, turn: 'other' }, 1), /尚未輪到/);
  assert.match(cardPlayIssue(s, team, 99), /已不在/);
});

test('Bridge same-round tie result opens once and leaves the board visible after closing', async t => {
  const nodes = mount(t);
  const { BridgeRoomView } = await import('../public/js/games/bridge/game-view.js');
  const view = new BridgeRoomView({ bridge() {} });
  const s = bridgeState('finished'); s.room.winners = ['team-1', 'team-2'];
  view.render(s);
  assert.equal(nodes.bridgeResultDialog.open, true);
  assert.match(nodes.bridgeResultTitle.textContent, /平手/);
  nodes.bridgeCloseResults.click(); view.render(s);
  assert.equal(nodes.bridgeResultDialog.open, false);
  assert.equal(nodes.bridgeGame.hidden, false);
  assert.equal(nodes.bridgeViewResults.hidden, false);
});

test('game picker is available for hosts and hidden on join and Bridge pages', async t => {
  const nodes = mount(t);
  const { EntryView } = await import('../public/js/views/entry-view.js');
  const original = globalThis.location;
  t.after(() => { if (original === undefined) delete globalThis.location; else globalThis.location = original; });
  for (const pathname of ['/', '/join', '/bridge-bingo', '/teambingo']) {
    globalThis.location = { pathname, search: '' };
    const view = new EntryView({ name: '', roomCode: 'OLD01' }, () => {});
    assert.equal(nodes.gameChoice.hidden, pathname !== '/');
    assert.equal(nodes.code.value, pathname === '/' ? '' : 'OLD01');
    assert.equal(view.shouldRestore('ROOM01'), false, 'a plain page must not auto-join the remembered room');
    view.query = new URLSearchParams('?room=room01');
    assert.equal(view.shouldRestore('ROOM01'), true);
    assert.equal(view.shouldRestore('OTHER'), false);
    assert.equal(view.shouldRestore(''), false);
    nodes.gameType.value = 'bridge-bingo';
    assert.equal(view.identity.gameType, 'bridge-bingo');
  }
});

test('owner can cancel unanswered cards via close, backdrop or Escape without dismissing inside clicks', async t => {
  const nodes = mount(t);
  const { SharedCardView } = await import('../public/js/games/bingo/views/shared-card-view.js');
  const cancelled = [];
  const view = new SharedCardView({ cancelCard: id => cancelled.push(id) });
  const active = { id: 'session', playerId: 'host', stage: 'question', card: { name: 'Card', options: ['A', 'B'], question: 'Q' } };
  const s = { room: { host: 'host', phase: 'playing', activeCard: active, players: [{ id: 'host', name: 'Host' }] },
    me: { id: 'host' }, connected: true, busy: false };
  view.render(s);
  assert.equal(nodes.cancelSharedCard.hidden, false);
  nodes.cancelSharedCard.click();
  nodes.sharedCardDialog.emit('click', { clientX: 0, clientY: 0 });
  nodes.sharedCardDialog.emit('cancel', { preventDefault() {} });
  assert.deepEqual(cancelled, ['session', 'session', 'session']);
  nodes.sharedCardDialog.emit('click', { clientX: 50, clientY: 150 });
  assert.equal(cancelled.length, 3);
  for (const override of [{ busy: true }, { connected: false }, { me: { id: 'other' } },
    { room: { ...s.room, activeCard: { ...active, stage: 'review' } } }]) {
    view.render({ ...s, ...override });
    nodes.sharedCardDialog.emit('click', { clientX: 0, clientY: 0 });
    assert.equal(cancelled.length, 3);
  }
});

test('draw area keeps its back while a dealt card opens an effect dialog only once', async t => {
  const nodes = mount(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { DrawCardView } = await import('../public/js/games/bingo/views/draw-card-view.js');
  const view = new DrawCardView();
  const s = { room: { code: 'ROOM', phase: 'playing', boardVersion: 0, called: [], turn: 'me' }, playerId: 'me' };
  view.render(s);
  assert.equal(nodes.drawnCardDialog.open, false);
  const drawn = { id: 'held-1', name: '星光指引', type: '祝福', theme: 'gold', symbol: '✧', description: 'Drawn card' };
  const after = { ...s, room: { ...s.room, called: [1], lastDraw: drawn, turn: 'other' } };
  view.render(after);
  assert.equal(view.drawing, true);
  view.render(after);
  t.mock.timers.tick(550);
  assert.equal(view.card.id, 'held-1');
  assert.doesNotMatch(nodes.drawCardDisplay.textContent, /星光指引/);
  assert.equal(nodes.drawnCardDialog.open, true);
  assert.equal(nodes.drawnCardTitle.textContent, '星光指引');
  assert.match(nodes.drawnCardContent.textContent, /卡牌效果：卡牌能力待定/);
  nodes.closeDrawnCard.click();
  assert.equal(nodes.drawnCardDialog.open, false);
  view.render(after); assert.equal(view.drawing, false);
  assert.equal(nodes.drawnCardDialog.open, false);
  view.render(s);
  assert.equal(view.card, null);
  assert.equal(nodes.drawnCardDialog.open, false);
  view.render(after); view.hide(); t.mock.timers.tick(550);
  assert.equal(view.card, null);
  assert.equal(nodes.drawnCardDialog.open, false);
});

test('drawn hand cards use their unique ID and are playable only during the owner turn', async t => {
  const nodes = mount(t);
  const { HandView } = await import('../public/js/games/bingo/views/hand-view.js');
  const used = [];
  const view = new HandView({ useCard: id => used.push(id) });
  const s = { hand: [{ id: 'held-1', definitionId: 'star', name: '星光指引', symbol: '✧', type: '祝福', theme: 'gold', description: 'Card' }],
    room: { phase: 'playing', turn: 'me' }, playerId: 'me', connected: true };
  view.render(s);
  let button = nodes.handList.children[0].children[0];
  assert.equal(button.disabled, false); button.click();
  assert.deepEqual(used, ['held-1']);
  for (const override of [{ connected: false }, { room: { phase: 'playing', turn: 'other' } },
    { room: { ...s.room, pending: {} } }, { room: { ...s.room, activeCard: {} } }]) {
    view.render({ ...s, ...override });
    button = nodes.handList.children[0].children[0];
    assert.equal(button.disabled, true);
  }
});

test('other boards show question marks before start regardless of readiness and reveal after start', async t => {
  const nodes = mount(t);
  const { BoardView } = await import('../public/js/games/bingo/views/board-view.js');
  const view = new BoardView({});
  for (const size of [3, 4, 5, 6, 7, 8, 9]) {
    const cells = Array.from({ length: size ** 2 }, (_, i) => ({ number: i + 1, isCovered: false }));
    const me = { id: 'me', ready: true, lines: 0, cells };
    const target = { id: 'friend', name: 'Friend', ready: false, lines: 0, cells };
    const s = { room: { size, goal: size - 2, phase: 'lobby', called: [], players: [me, target] }, me, target, connected: true };
    for (const ready of [false, true]) {
      target.ready = ready;
      view.render(s);
      assert.equal(nodes.board.children.length, size ** 2);
      assert.ok(nodes.board.children.every(cell => cell.textContent === '?' && cell.disabled));
      assert.ok(nodes.board.children.every(cell => /尚未公開/.test(cell.attributes['aria-label'])));
      assert.equal(nodes.editTools.hidden, true);
    }
    view.render({ ...s, target: me });
    assert.deepEqual(nodes.board.children.map(cell => cell.textContent), cells.map(cell => String(cell.number)));
    for (const phase of ['playing', 'finished']) {
      view.render({ ...s, room: { ...s.room, phase } });
      assert.deepEqual(nodes.board.children.map(cell => cell.textContent), cells.map(cell => String(cell.number)));
      if (phase === 'finished') {
        assert.equal(nodes.phaseText.hidden, true);
        assert.equal(nodes.phaseText.textContent, '');
      }
    }
    view.render(s);
    assert.ok(nodes.board.children.every(cell => cell.textContent === '?'));
  }
});

test('reroll prize control is enabled only for the connected idle host before start', async t => {
  const nodes = mount(t);
  const { HostControlsView } = await import('../public/js/games/bingo/views/host-controls-view.js');
  const commands = [];
  const view = new HostControlsView({ command: kind => commands.push(kind) });
  const s = { room: { host: 'host', phase: 'lobby', size: 3, goal: 1, players: [] }, me: { id: 'host' }, busy: false, connected: true };
  view.render(s);
  assert.equal(nodes.rerollPrizes.hidden, false);
  assert.equal(nodes.rerollPrizes.disabled, false);
  nodes.rerollPrizes.click();
  assert.deepEqual(commands, ['rerollPrizes']);
  for (const override of [{ busy: true }, { connected: false }]) {
    view.render({ ...s, ...override });
    assert.equal(nodes.rerollPrizes.disabled, true);
  }
  view.render({ ...s, me: { id: 'guest' } });
  assert.equal(nodes.rerollPrizes.hidden, true);
  for (const phase of ['playing', 'finished']) {
    view.render({ ...s, room: { ...s.room, phase } });
    assert.equal(nodes.rerollPrizes.hidden, true);
  }
});

test('award notice names only the newly gained items and groups duplicate rewards', async t => {
  const nodes = mount(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { LineNoticeView } = await import('../public/js/games/bingo/views/line-notice-view.js');
  const view = new LineNoticeView();
  view.show([]);
  assert.equal(nodes.lineNotices.children.length, 0);
  view.show([{ name: '玩家甲', lines: 3, rewards: [
    { item: '傳送石' }, { item: '傳送石' }, { item: '護身符' }
  ] }]);
  const notice = nodes.lineNotices.children[0];
  assert.equal(notice.children[0].textContent, '玩家甲 獲得了 傳送石 × 2、護身符 × 1！');
  assert.equal(notice.children[1].attributes['aria-label'], '關閉獎品通知');
  assert.doesNotMatch(notice.textContent, /條線/);
  view.clear();
  assert.equal(nodes.lineNotices.children.length, 0);
});

test('line prize view places each diagonal in its own corner and preserves row and column slots', async t => {
  const nodes = mount(t);
  const { LinePrizesView } = await import('../public/js/games/bingo/views/line-prizes-view.js');
  const view = new LinePrizesView();
  for (const size of [3, 5, 9]) {
    const cells = Array.from({ length: size * size }, (_, index) => ({ isCovered: index % (size + 1) === 0 }));
    view.render(cells, size, 'playing', [{ id: 'diagonal-0', item: '突襲券', claimedBy: 'me' }], 'me', [{ id: 'me', name: 'Me' }]);
    assert.equal(nodes.topLeftPrize.children.length, 1);
    assert.equal(nodes.topRightPrize.children.length, 1);
    const left = nodes.topLeftPrize.children[0].children[0];
    const right = nodes.topRightPrize.children[0].children[0];
    assert.match(left.attributes['aria-label'], /左上至右下.*已取得/);
    assert.match(right.attributes['aria-label'], /右上至左下.*尚未有人取得/);
    assert.match(left.className, /is-earned/);
    assert.equal(nodes.rowPrizes.children.length, size);
    assert.equal(nodes.columnPrizes.children.length, size);
    assert.equal(nodes.boardPrizeLayout.dataset.size, size);
  }
});

test('final reward dialog aggregates items and stays closed after dismissal until reopened', async t => {
  const nodes = mount(t);
  const { RewardsView, rewardTotals } = await import('../public/js/games/bingo/views/rewards-view.js');
  const rewards = [{ item: '突襲券' }, { item: '突襲券' }, { item: '傳送石' }];
  assert.deepEqual(rewardTotals(rewards), [{ item: '突襲券', count: 2 }, { item: '傳送石', count: 1 }]);
  const room = { code: 'ROOM', phase: 'finished', players: [{ name: 'Alice', rewards }, { name: 'Bob', rewards: [] }] };
  const view = new RewardsView(); view.render({ room });
  assert.equal(nodes.gameResultsDialog.open, true);
  assert.match(nodes.gameResultsList.children[0].textContent, /Alice3 份突襲券× 2傳送石× 1/);
  assert.match(nodes.gameResultsList.children[1].textContent, /Bob0 份尚未獲得獎品/);
  assert.equal(nodes.viewGameResults.hidden, false);
  nodes.closeGameResults.click(); view.render({ room });
  assert.equal(nodes.gameResultsDialog.open, false);
  nodes.viewGameResults.click();
  assert.equal(nodes.gameResultsDialog.open, true);
  view.render({ room: { ...room, phase: 'playing' } });
  assert.equal(nodes.gameResultsDialog.open, false);
  assert.equal(nodes.gameResultsList.textContent, '');
  assert.equal(nodes.viewGameResults.hidden, true);
  view.render({ room }); assert.equal(nodes.gameResultsDialog.open, true);
  view.hide(); assert.equal(nodes.gameResultsDialog.open, false);
  view.render({ room }); assert.equal(nodes.gameResultsDialog.open, true);
});

test('hand count includes visible preview cards and only shows empty text when all cards are gone', async t => {
  const nodes = mount(t);
  const { HandView } = await import('../public/js/games/bingo/views/hand-view.js');
  const hand = new HandView();
  hand.render({ hand: [] });
  assert.equal(nodes.handCount.textContent, '0 張');
  assert.equal(nodes.handEmpty.hidden, false);
  hand.setPreviewCount(3);
  assert.equal(nodes.handCount.textContent, '3 張');
  assert.equal(nodes.handEmpty.hidden, true);
  const realCards = [{ id: 'real', name: '正式手牌' }];
  hand.render({ hand: realCards });
  assert.equal(nodes.handCount.textContent, '4 張');
  assert.equal(nodes.handList.children[0].dataset.cardId, 'real');
  hand.setPreviewCount(0);
  assert.equal(nodes.handCount.textContent, '1 張');
  hand.render({ hand: [] });
  assert.equal(nodes.handCount.textContent, '0 張');
  assert.equal(nodes.handEmpty.hidden, false);
  assert.deepEqual(realCards, [{ id: 'real', name: '正式手牌' }]);
});

test('preview card flow requires a choice and updates displayed hand count after use', async t => {
  const nodes = mount(t);
  const { HandView } = await import('../public/js/games/bingo/views/hand-view.js');
  const { CardPreviewView } = await import('../public/js/games/bingo/views/card-preview-view.js');
  const hand = new HandView();
  const preview = new CardPreviewView(count => hand.setPreviewCount(count));
  preview.render(state()); hand.render({ hand: [] });
  assert.equal(nodes.handCount.textContent, '3 張');
  nodes.previewCardList.children[0].children[0].click();
  assert.equal(nodes.cardPreviewDialog.open, true);
  assert.equal(nodes.previewCardAction.textContent, '使用卡片');
  nodes.previewCardAction.click();
  assert.equal(nodes.previewCardAction.disabled, true);
  nodes.previewCardAction.click();
  assert.equal(preview.model.stage, 'question');
  const options = nodes.previewCardContent.children[1];
  options.children[1].click();
  assert.equal(nodes.previewCardAction.disabled, false);
  nodes.previewCardAction.click();
  assert.equal(preview.model.correct, true);
  assert.equal(nodes.handCount.textContent, '2 張');
  assert.equal(nodes.previewCardList.children.length, 2);
  nodes.previewCardAction.click();
  assert.equal(nodes.cardPreviewDialog.open, false);
});

test('closing an unanswered card keeps it in hand; repeated room updates do not refill used cards', async t => {
  const nodes = mount(t);
  const { CardPreviewView } = await import('../public/js/games/bingo/views/card-preview-view.js');
  const preview = new CardPreviewView();
  preview.render(state());
  nodes.previewCardList.children[0].children[0].click();
  nodes.previewCardAction.click(); nodes.closePreviewCard.click();
  assert.equal(preview.model.remaining.length, 3);
  nodes.previewCardList.children[0].children[0].click(); nodes.previewCardAction.click();
  nodes.previewCardContent.children[1].children[0].click(); nodes.previewCardAction.click();
  assert.equal(preview.model.correct, false);
  nodes.previewCardAction.click();
  preview.render(state());
  assert.equal(preview.model.remaining.length, 2);
  preview.render(state({ playerId: 'other', me: { id: 'other' } }));
  assert.equal(preview.model.remaining.length, 3);
});

test('host confirmation closes the local card preview without consuming it', async t => {
  const nodes = mount(t);
  const { CardPreviewView } = await import('../public/js/games/bingo/views/card-preview-view.js');
  const preview = new CardPreviewView(); preview.render(state());
  nodes.previewCardList.children[0].children[0].click();
  preview.render(state({ room: { code: 'ROOM01', host: 'host', pending: { number: 1 } } }));
  assert.equal(nodes.cardPreviewDialog.open, false);
  assert.equal(preview.model.remaining.length, 3);
});

test('drawer opens and closes through its buttons, keeping accessibility state in sync', async t => {
  const nodes = mount(t);
  const { HandDrawerView } = await import('../public/js/games/bingo/views/hand-drawer-view.js');
  const drawer = new HandDrawerView(); drawer.render(state());
  assert.equal(nodes.handDock.hidden, false);
  assert.equal(document.body.classList.contains('has-hand-dock'), true);
  nodes.openHand.click();
  assert.equal(nodes.handPanel.open, true);
  assert.equal(nodes.openHand.attributes['aria-expanded'], 'true');
  nodes.closeHand.click();
  assert.equal(nodes.handPanel.open, false);
  assert.equal(nodes.openHand.attributes['aria-expanded'], 'false');
  nodes.openHand.click(); nodes.handPanel.close(); // Native dialog close (e.g. Escape).
  assert.equal(nodes.openHand.attributes['aria-expanded'], 'false');
});

test('drawer ignores inside clicks and closes for clicks outside its bounds', async t => {
  const nodes = mount(t);
  const { HandDrawerView } = await import('../public/js/games/bingo/views/hand-drawer-view.js');
  const drawer = new HandDrawerView(); drawer.render(state()); nodes.openHand.click();
  nodes.handPanel.emit('click', { clientX: 50, clientY: 150 });
  assert.equal(nodes.handPanel.open, true);
  nodes.handPanel.emit('click', { target: nodes.handList, clientX: 0, clientY: 0 });
  assert.equal(nodes.handPanel.open, true);
  nodes.handPanel.emit('click', { clientX: 10, clientY: 150 });
  assert.equal(nodes.handPanel.open, false);
});

test('drawer stays open on ordinary snapshots, closes for host approval, and cleans up on leave', async t => {
  const nodes = mount(t);
  const { HandDrawerView } = await import('../public/js/games/bingo/views/hand-drawer-view.js');
  const drawer = new HandDrawerView(); drawer.render(state()); nodes.openHand.click();
  drawer.render(state());
  assert.equal(nodes.handPanel.open, true);
  drawer.render(state({ room: { code: 'ROOM01', host: 'host', pending: { number: 2 } } }));
  assert.equal(nodes.handPanel.open, false);
  nodes.openHand.click(); drawer.hide();
  assert.equal(nodes.handPanel.open, false);
  assert.equal(nodes.handDock.hidden, true);
  assert.equal(document.body.classList.contains('has-hand-dock'), false);
  drawer.render(state({ room: { code: 'ROOM01', phase: 'finished', host: 'host' } }));
  assert.equal(nodes.handDock.hidden, true);
  assert.equal(nodes.handPanel.open, false);
});

test('card model ignores invalid choices and prevents used cards being played twice', async () => {
  const { CardPreview } = await import('../public/js/games/bingo/state/card-preview.js');
  const first = new CardPreview(), second = new CardPreview();
  first.open('missing'); first.flip(); first.choose(0);
  assert.equal(first.submit(), false);
  first.open('moon'); first.choose(1);
  assert.equal(first.choice, null);
  first.flip();
  for (const choice of [-1, 4, 1.5, '1', null, undefined]) first.choose(choice);
  assert.equal(first.choice, null);
  first.choose(0); first.choose(1); first.submit();
  assert.equal(first.correct, true);
  assert.equal(first.submit(), false);
  assert.equal(second.remaining.length, 3);
  first.open('moon'); first.flip();
  assert.equal(first.selected, null);
  assert.equal(first.submit(), false);
});

function sharedState(playerId = 'owner', stage = 'question') {
  return state({ playerId, me: { id: playerId }, connected: true, busy: false,
    room: { code: 'ROOM01', host: 'host', players: [{ id: 'owner', name: 'Owner' }], activeCard: {
      id: 'session', playerId: 'owner', stage,
      card: { name: '星光指引', symbol: '✧', description: '卡牌說明', effect: '測試效果', question: '問題', options: ['A', 'B'] },
      ...(stage === 'result' ? { answer: 1, choice: 1, correct: true } : {})
    } } });
}

test('shared question is visible to spectators but only its owner can submit', async t => {
  const nodes = mount(t);
  const { SharedCardView } = await import('../public/js/games/bingo/views/shared-card-view.js');
  const calls = [];
  const view = new SharedCardView({ answerCard: (...args) => calls.push(args), finishCard() {} });
  view.render(sharedState('spectator'));
  assert.equal(nodes.sharedCardDialog.open, true);
  assert.equal(nodes.sharedCardQuestion.textContent, '問題');
  assert.equal(nodes.sharedCardDescription.textContent, '');
  assert.equal(nodes.sharedCardDescription.hidden, true);
  assert.equal(nodes.sharedCardEffect.textContent, '卡牌效果：測試效果');
  assert.equal(nodes.sharedCardSymbol.textContent, '✧');
  assert.ok(nodes.sharedCardOptions.children.every(button => button.disabled));
  assert.equal(nodes.answerSharedCard.hidden, true);
  assert.equal(nodes.finishSharedCard.hidden, true);
  view.render(sharedState());
  assert.equal(nodes.answerSharedCard.disabled, true);
  nodes.sharedCardOptions.children[1].click();
  nodes.answerSharedCard.click();
  assert.deepEqual(calls, [['session', 1]]);
  // Presence refreshes keep the local answer choice; a new question clears it.
  view.render(sharedState());
  assert.equal(nodes.answerSharedCard.disabled, false);
  const next = sharedState(); next.room.activeCard.id = 'next'; view.render(next);
  assert.equal(nodes.answerSharedCard.disabled, true);
});

test('shared results require owner or host to continue, and cannot be dismissed with Escape', async t => {
  const nodes = mount(t);
  const { SharedCardView } = await import('../public/js/games/bingo/views/shared-card-view.js');
  const calls = [];
  const view = new SharedCardView({ answerCard() {}, finishCard: id => calls.push(id) });
  view.render(sharedState('host'));
  assert.equal(nodes.finishSharedCard.hidden, false);
  assert.equal(nodes.finishSharedCard.textContent, '結束作答');
  let prevented = false;
  nodes.sharedCardDialog.emit('cancel', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  view.render(sharedState('owner', 'result'));
  assert.equal(nodes.answerSharedCard.hidden, true);
  assert.equal(nodes.finishSharedCard.textContent, '繼續遊戲');
  assert.ok(nodes.sharedCardOptions.children.every(button => button.disabled));
  nodes.finishSharedCard.click();
  assert.deepEqual(calls, ['session']);
  view.render(state());
  assert.equal(nodes.sharedCardDialog.open, false);
});

test('selecting an online hand card immediately sends use to the server without a private preview', async t => {
  const nodes = mount(t);
  const { CardPreviewView } = await import('../public/js/games/bingo/views/card-preview-view.js');
  const calls = [];
  const view = new CardPreviewView(() => {}, { useCard: id => calls.push(id) });
  const online = state({ connected: true, busy: false });
  online.room.availableDemoCards = [{ id: 'remote', name: 'Remote', theme: 'gold', symbol: '✧', description: '能力待定' }];
  view.render(online);
  assert.equal(nodes.previewCardList.children.length, 1);
  nodes.previewCardList.children[0].children[0].click();
  assert.deepEqual(calls, ['remote']);
  assert.equal(nodes.cardPreviewDialog.open, false);
  assert.equal(view.model.stage, 'front');
  assert.equal(view.model.remaining.length, 1);
  view.render({ ...online, room: { ...online.room, activeCard: { id: 'session' }, availableDemoCards: [] } });
  assert.equal(nodes.cardPreviewDialog.open, false);
  assert.equal(nodes.previewCardList.children.length, 0);
});

test('online hand cards cannot be used outside the owner turn or while the game is paused', async t => {
  const nodes = mount(t);
  const { CardPreviewView } = await import('../public/js/games/bingo/views/card-preview-view.js');
  const calls = [];
  const view = new CardPreviewView(() => {}, { useCard: id => calls.push(id) });
  const make = extra => state({ connected: true, busy: false, ...extra,
    room: { code: 'ROOM01', phase: 'playing', turn: 'other', availableDemoCards: [{ id: 'star' }], ...extra?.room } });
  for (const next of [make(), make({ room: { turn: 'host', activeCard: { id: 'active' } } }),
    make({ room: { turn: 'host', pending: { number: 1 } } }), make({ connected: false, room: { turn: 'host' } })]) {
    view.render(next);
    const button = nodes.previewCardList.children[0].children[0];
    assert.equal(button.disabled, true);
    button.click();
  }
  assert.deepEqual(calls, []);
});

test('submitted answers lock all options and show judgment controls exclusively to the host', async t => {
  const nodes = mount(t);
  const { SharedCardView } = await import('../public/js/games/bingo/views/shared-card-view.js');
  const decisions = [];
  const view = new SharedCardView({ judgeCard: (...args) => decisions.push(args), answerCard() {}, finishCard() {} });
  const review = sharedState('owner', 'review'); review.room.activeCard.choice = 0;
  view.render(review);
  assert.equal(nodes.answerSharedCard.hidden, true);
  assert.equal(nodes.finishSharedCard.hidden, true);
  assert.equal(nodes.judgeCardCorrect.hidden, true);
  assert.ok(nodes.sharedCardOptions.children.every(button => button.disabled));
  assert.equal(nodes.sharedCardOptions.children[0].attributes['aria-pressed'], 'true');
  assert.match(nodes.sharedCardResult.textContent, /等待房主判定/);
  view.render({ ...review, playerId: 'host', me: { id: 'host' } });
  assert.equal(nodes.judgeCardCorrect.hidden, false);
  assert.equal(nodes.judgeCardWrong.hidden, false);
  nodes.judgeCardCorrect.click(); nodes.judgeCardWrong.click();
  assert.deepEqual(decisions, [['session', true], ['session', false]]);
  view.render(sharedState('host', 'result'));
  assert.equal(nodes.judgeCardCorrect.hidden, true);
  assert.equal(nodes.judgeCardWrong.hidden, true);
  assert.equal(nodes.sharedCardResult.textContent, '回答正確！');
  assert.equal(nodes.sharedCardResult.children.length, 1);
});

test('in-game card results make it clear that continuing ends the current turn', async t => {
  const nodes = mount(t);
  const { SharedCardView } = await import('../public/js/games/bingo/views/shared-card-view.js');
  const view = new SharedCardView({ answerCard() {}, judgeCard() {}, finishCard() {} });
  const playing = sharedState('owner', 'result'); playing.room.phase = 'playing';
  view.render(playing);
  assert.equal(nodes.finishSharedCard.textContent, '結束回合，換下一位');
  assert.match(nodes.sharedCardStatus.textContent, /換下一位/);
});

test('question countdown does not restart on selection and timeout locks answers while retaining host review', async t => {
  const nodes = mount(t); let now = 1000; t.mock.method(Date, 'now', () => now);
  const { SharedCardView } = await import('../public/js/games/teambingo/views/shared-card-view.js');
  const view = new SharedCardView({ answerCard() {}, judgeCard() {}, finishCard() {} }); t.after(() => view.close());
  const s = sharedState('owner'); s.room.activeCard.answerRemainingMs = 30000;
  view.render(s); assert.match(nodes['next-sharedCardStatus'].textContent, /00:30/);
  assert.equal(nodes['next-sharedCardStatus'].dataset.countdown, 'true');
  now = 16000; nodes['next-sharedCardOptions'].children[0].click();
  assert.match(nodes['next-sharedCardStatus'].textContent, /00:15/);
  now = 31000; view.updateAnswerClock();
  assert.equal(nodes['next-answerSharedCard'].disabled, true);
  assert.ok(nodes['next-sharedCardOptions'].children.every(option => option.disabled));
  const review = sharedState('host', 'review'); review.room.activeCard.timedOut = true;
  view.render(review); assert.match(nodes['next-sharedCardResult'].textContent, /未於時限內作答/);
  assert.equal(nodes['next-judgeCardCorrect'].hidden, false); assert.equal(nodes['next-judgeCardWrong'].hidden, false);
  assert.equal(view.answerTimer, null);
  assert.equal(nodes['next-sharedCardStatus'].dataset.countdown, 'false');
});

test('question clock accepts shorter server updates but cannot be extended until a new question starts', async t => {
  const nodes = mount(t); let now = 1000; t.mock.method(Date, 'now', () => now);
  const { SharedCardView } = await import('../public/js/games/teambingo/views/shared-card-view.js');
  const view = new SharedCardView({ answerCard() {}, judgeCard() {}, finishCard() {} }); t.after(() => view.close());
  const s = sharedState('owner'); s.room.activeCard.answerRemainingMs = 30000;
  view.render(s);
  now = 6000; s.room.activeCard.answerRemainingMs = 20000; view.render(s);
  assert.match(nodes['next-sharedCardStatus'].textContent, /00:20/);
  now = 7000; s.room.activeCard.answerRemainingMs = 30000; view.render(s);
  assert.match(nodes['next-sharedCardStatus'].textContent, /00:19/);
  now = 26000; view.updateAnswerClock();
  assert.equal(nodes['next-answerSharedCard'].disabled, true);
  assert.ok(nodes['next-sharedCardOptions'].children.every(option => option.disabled));
  s.room.activeCard.id = 'new-session'; view.render(s);
  assert.match(nodes['next-sharedCardStatus'].textContent, /00:30/);
  assert.ok(nodes['next-sharedCardOptions'].children.every(option => !option.disabled));
  view.close(); assert.equal(view.answerTimer, null);
});

test('Team Bingo reference answers are visible only to the judging host and blank answers stay blank', async t => {
  const nodes = mount(t);
  const { SharedCardView } = await import('../public/js/games/teambingo/views/shared-card-view.js');
  const view = new SharedCardView({ answerCard() {}, judgeCard() {}, finishCard() {} });
  const host = sharedState('host', 'review'); host.room.activeCard.referenceAnswer = 'B：15';
  view.render(host);
  assert.match(nodes['next-sharedCardResult'].textContent, /正確答案：B：15/);
  host.room.activeCard.referenceAnswer = ''; view.render(host);
  assert.ok(nodes['next-sharedCardResult'].textContent.endsWith('正確答案：'));
  for (const player of ['owner', 'spectator']) {
    const s = sharedState(player, 'review'); s.room.activeCard.referenceAnswer = 'B：15';
    view.render(s); assert.doesNotMatch(nodes['next-sharedCardResult'].textContent, /正確答案|B：15/);
  }
  const question = sharedState('host', 'question'); question.room.activeCard.referenceAnswer = 'B：15';
  view.render(question); assert.doesNotMatch(nodes['next-sharedCardResult'].textContent, /正確答案/);
});

test('Team Bingo does not display question difficulty to any viewer throughout the answer workflow', async t => {
  const nodes = mount(t);
  const { SharedCardView } = await import('../public/js/games/teambingo/views/shared-card-view.js');
  const view = new SharedCardView({ answerCard() {}, judgeCard() {}, finishCard() {} });
  for (const player of ['owner', 'host', 'spectator']) {
    for (const difficulty of ['簡單', '普通', '困難']) {
      for (const stage of ['question', 'review', 'result']) {
        const s = sharedState(player, stage); s.room.activeCard.card.difficulty = difficulty;
        view.render(s);
        assert.doesNotMatch(nodes['next-sharedCardStatus'].textContent, /難度|簡單|普通|困難/);
        assert.equal(nodes['next-sharedCardQuestion'].textContent, '問題');
      }
    }
  }
});

test('all players see the card effect and question through answering, host review, and results', async t => {
  const nodes = mount(t);
  const { SharedCardView } = await import('../public/js/games/bingo/views/shared-card-view.js');
  const view = new SharedCardView({ answerCard() {}, judgeCard() {}, finishCard() {} });
  for (const player of ['owner', 'host', 'spectator']) {
    for (const stage of ['question', 'review', 'result']) {
      view.render(sharedState(player, stage));
      assert.equal(nodes.sharedCardQuestion.textContent, '問題');
      assert.equal(nodes.sharedCardEffect.textContent, '卡牌效果：測試效果');
      assert.equal(nodes.sharedCardDescription.textContent, '');
      assert.equal(nodes.sharedCardDescription.hidden, true);
    }
  }
  const pending = sharedState('spectator'); delete pending.room.activeCard.card.effect;
  view.render(pending);
  assert.equal(nodes.sharedCardEffect.textContent, '卡牌效果：能力待定');
});

test('effect card dialogs hide descriptions and show no effect for wrong verdicts in both games', async t => {
  const nodes = mount(t);
  for (const game of ['bingo', 'teambingo']) {
    const prefix = game === 'bingo' ? '' : 'next-';
    const { SharedCardView } = await import(`../public/js/games/${game}/views/shared-card-view.js`);
    const view = new SharedCardView({});
    for (const player of ['owner', 'host', 'spectator']) {
      for (const correct of [false, true, false]) {
        const s = sharedState(player, 'result'); s.room.activeCard.correct = correct;
        view.render(s);
        assert.equal(nodes[`${prefix}sharedCardDescription`].hidden, true);
        assert.equal(nodes[`${prefix}sharedCardDescription`].textContent, '');
        assert.equal(nodes[`${prefix}sharedCardEffect`].textContent, correct ? '卡牌效果：測試效果' : '');
        assert.equal(nodes[`${prefix}sharedCardEffect`].hidden, !correct);
        assert.equal(nodes[`${prefix}sharedCardResult`].textContent, correct ? '回答正確！' : '回答錯誤');
      }
    }
    view.render(sharedState('owner', 'question'));
    assert.equal(nodes[`${prefix}sharedCardEffect`].textContent, '卡牌效果：測試效果');
    assert.equal(nodes[`${prefix}sharedCardEffect`].hidden, false);
    view.close();
  }
});

test('verdict rerenders and transitions show only the current outcome without stale result text', async t => {
  const nodes = mount(t);
  const { SharedCardView } = await import('../public/js/games/bingo/views/shared-card-view.js');
  const view = new SharedCardView({ answerCard() {}, judgeCard() {}, finishCard() {} });
  for (const correct of [true, true, false, false, true]) {
    const next = sharedState('spectator', 'result'); next.room.activeCard.correct = correct;
    view.render(next);
    assert.equal(nodes.sharedCardResult.textContent, correct ? '回答正確！' : '回答錯誤');
    assert.equal(nodes.sharedCardResult.children.length, 1);
    assert.equal(nodes.sharedCardResult.children[0].tagName, 'strong');
    assert.equal(nodes.sharedCardResult.children[0].className, `card-verdict ${correct ? 'is-correct' : 'is-wrong'}`);
  }
  view.render(sharedState('spectator', 'question'));
  assert.equal(nodes.sharedCardResult.textContent, '等待 Owner 回答…');
  assert.equal(nodes.sharedCardResult.children.length, 0);
});
