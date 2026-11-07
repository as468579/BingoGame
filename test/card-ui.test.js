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
    'introduction', 'introductionDialog', 'introductionContent', 'introductionPrevious', 'introductionNext', 'introductionPage', 'closeIntroduction',
    'handCount', 'handEmpty', 'handList', 'handPanel', 'openHand', 'closeHand', 'handDock',
    'cardPreviewDialog', 'closePreviewCard', 'previewCardsEmpty', 'previewCardList',
    'previewCardTitle', 'previewCardStep', 'previewCardContent', 'previewCardAction',
    'sharedCardDialog', 'sharedCardTitle', 'sharedCardStatus', 'sharedCardQuestion', 'sharedCardOptions',
    'sharedCardResult', 'answerSharedCard', 'finishSharedCard', 'judgeCardCorrect', 'judgeCardWrong', 'cancelSharedCard',
    'sharedCardSymbol', 'sharedCardDescription', 'sharedCardEffect', 'nextQuestion',
    'boardPrizeLayout', 'rowPrizes', 'columnPrizes', 'topLeftPrize', 'topRightPrize',
    'lineNotices',
    'boardSize', 'applySize', 'start', 'skip', 'reset', 'scan', 'rerollPrizes', 'undo',
    'settingsPanel', 'sizeHint', 'hostTools', 'scanHint', 'shuffle', 'saveBoard', 'ready', 'board',
    'boardTitle', 'lineCount', 'phaseText', 'boardLines', 'editTools', 'boardHint',
    'gameResultsDialog', 'gameResultsList', 'closeGameResults', 'viewGameResults', 'drawCardDisplay',
    'drawnCardDialog', 'drawnCardTitle', 'drawnCardContent', 'closeDrawnCard',
    'hiddenGoalDialog', 'hiddenGoalTitle', 'hiddenGoalHint', 'hiddenGoalCards', 'viewHiddenGoal', 'closeHiddenGoal',
    'guessDialog', 'guessTitle', 'guessMessage', 'guessReference', 'guessCorrect', 'guessWrong',
    'captainHint', 'hintDialog', 'hintTitle', 'hintDescription', 'hintProgress', 'hintCount',
    'bridgeGame', 'bridgeRoomCode', 'bridgeCopyCode', 'welcome', 'game', 'leave', 'switchPlayer',
    'bridgeIntroduction', 'bridgeIntroductionDialog', 'bridgeIntroductionContent', 'bridgeCloseIntroduction',
    'bridgeIntroductionPrevious', 'bridgeIntroductionNext', 'bridgeIntroductionPage',
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
  s.room.endReason = 'board-full-draw'; s.room.winners = []; view.render(s);
  assert.match(nodes['next-winner'].textContent, /本局和局/);
  assert.equal(nodes['next-gameResultsTitle'].textContent, '遊戲結束・和局');
  assert.match(nodes['next-rulesText'].textContent, /盤面已滿仍無人達標時判定為和局/);
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
    assert.equal(nodes['next-drawnCardTitle'].textContent, '隊伍 1 獲得卡片「加時」');
    assert.match(nodes['next-drawnCardContent'].textContent, /隊伍行動時間增加 2 分鐘/);
    nodes['next-closeDrawnCard'].click(); view.render({ playerId, room });
    assert.equal(nodes['next-drawnCardDialog'].open, false);
    view.hide();
  }
});

test('every configured card notification names the team and card and does not reopen on repeated snapshots', async t => {
  const nodes = mount(t);
  const { DrawCardView } = await import('../public/js/games/teambingo/views/draw-card-view.js');
  const { cards } = require('../src/games/teambingo/card-catalog');
  const view = new DrawCardView({ animate: false });
  const room = { code: 'AWARDS', phase: 'playing', called: [] };
  for (const [index, card] of cards.entries()) {
    room.called.push(index + 1);
    room.lastDraw = { ...card, id: `award-${index}`, teamId: 'team-2', teamName: '隊伍 2' };
    view.render({ playerId: 'host', room });
    assert.equal(nodes['next-drawnCardTitle'].textContent, `隊伍 2 獲得卡片「${card.name}」`);
    assert.match(nodes['next-drawnCardContent'].textContent, new RegExp(card.effect.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(nodes['next-drawnCardDialog'].open, true);
    nodes['next-closeDrawnCard'].click(); view.render({ playerId: 'host', room });
    assert.equal(nodes['next-drawnCardDialog'].open, false);
  }
  view.hide();
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
  assert.equal(nodes['next-drawnCardTitle'].textContent, '隊伍 2 獲得卡片「加時」');
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

for (const symbol of ['pocket-watch', 'light-bulb', 'gift']) test(`Team Bingo renders the same black ${symbol} in hands, award notices and questions`, async t => {
  const nodes = mount(t);
  const { HandView } = await import('../public/js/games/teambingo/views/hand-view.js');
  const { DrawCardView } = await import('../public/js/games/teambingo/views/draw-card-view.js');
  const { SharedCardView } = await import('../public/js/games/teambingo/views/shared-card-view.js');
  const card = { id: 'held', definitionId: 'team-time-plus-2m', name: symbol === 'light-bulb' ? '提示' : '加時', symbol, effect: '卡片效果' };
  new HandView({ useCard() {} }).render({ hand: [card], playerId: 'owner', connected: true, room: { phase: 'playing', turn: 'owner' } });
  const handArt = nodes['next-handList'].children[0].children[0].children.find(child => child.className.includes('game-card-art'));
  const drawn = new DrawCardView({ animate: false });
  drawn.render({ playerId: 'owner', room: { code: 'TEAM', phase: 'playing', called: [1], lastDraw: card } });
  const drawArt = nodes['next-drawnCardContent'].children[0].children.find(child => child.className.includes('game-card-art'));
  const shared = new SharedCardView({});
  const s = sharedState(); s.room.activeCard.card.symbol = symbol; shared.render(s);
  for (const art of [handArt, drawArt, nodes['next-sharedCardSymbol']]) {
    assert.equal(art.textContent, '');
    const svg = art.children[0];
    assert.equal(svg.tagName, 'svg'); assert.equal(svg.attributes.class, `card-${symbol}`);
    assert.equal(svg.attributes.stroke, '#111'); assert.equal(svg.attributes.fill, 'none');
    assert.equal(svg.attributes['aria-hidden'], 'true');
    assert.equal(svg.children.length, 1); assert.ok(svg.children[0].attributes.d);
  }
  shared.close(); drawn.hide();
});

for (const symbol of ['thinking', 'abacus', 'near-line', 'flag', 'question-mark', 'double-six', 'double-seven', 'double-eight', 'running', 'book', 'book-cross', 'ordered-numbers']) test(`hidden goal ${symbol} uses the same black line SVG for captain and host cards`, async t => {
  const nodes = mount(t);
  const { HiddenGoalView } = await import('../public/js/games/teambingo/views/hidden-goal-view.js');
  const catalog = require('../src/games/teambingo/hidden-goal-catalog');
  const selected = catalog.find(card => card.symbol === symbol);
  assert.ok(selected);
  const view = new HiddenGoalView({});
  const room = { code: 'ICONS', host: 'host', phase: 'playing' };
  const assertArtwork = () => {
    const card = nodes['next-hiddenGoalCards'].children[0];
    const art = card.children.find(node => node.className.includes('game-card-art'));
    assert.equal(art.textContent, '');
    const svg = art.children[0];
    assert.equal(svg.tagName, 'svg'); assert.equal(svg.attributes.class, `card-${symbol}`);
    assert.equal(svg.attributes.stroke, '#111'); assert.equal(svg.attributes.fill, 'none');
    assert.equal(svg.attributes['stroke-width'], '3'); assert.equal(svg.attributes['aria-hidden'], 'true');
    assert.ok(svg.children[0].attributes.d);
  };
  view.render({ playerId: 'captain', room: { ...room, hiddenGoal: { selected, options: [], round: 1, canGuess: false } } });
  assertArtwork();
  view.render({ playerId: 'host', room: { ...room, hostHiddenGoals: [{ teamId: 'team-1', teamName: '隊伍 1', selected }] } });
  assertArtwork(); view.hide();
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

test('captains see three pending goal cards and cannot dismiss or select while disconnected or busy', async t => {
  const nodes = mount(t), calls = [];
  const { HiddenGoalView } = await import('../public/js/games/teambingo/views/hidden-goal-view.js');
  const view = new HiddenGoalView({ chooseHiddenGoal: id => calls.push(id) });
  const s = { playerId: 'captain', connected: true, busy: false, room: { code: 'GOALS', phase: 'choosing-goal', hiddenGoal: {
    selected: null, options: [1, 2, 3].map(index => ({ id: `pending-${index}`, name: '待定', symbol: '?', effect: '隱藏勝利條件待定' })) } } };
  view.render(s);
  assert.equal(nodes['next-hiddenGoalDialog'].open, true);
  assert.equal(nodes['next-hiddenGoalCards'].children.length, 3);
  assert.ok(nodes['next-hiddenGoalCards'].children.every(card => card.tagName === 'button' && /待定/.test(card.textContent)));
  nodes['next-hiddenGoalDialog'].emit('cancel', { preventDefault() {} });
  nodes['next-hiddenGoalDialog'].emit('click', { clientX: 0, clientY: 0 });
  assert.equal(nodes['next-hiddenGoalDialog'].open, true);
  nodes['next-hiddenGoalCards'].children[1].click(); assert.deepEqual(calls, []);
  assert.equal(nodes['next-hiddenGoalTitle'].textContent, '確認隱藏勝利條件');
  const controls = nodes['next-hiddenGoalCards'].children.at(-1);
  controls.children[1].click(); controls.children[1].click(); assert.deepEqual(calls, ['pending-2']);
  controls.children[0].click();
  view.render({ ...s, busy: true });
  assert.ok(nodes['next-hiddenGoalCards'].children.every(card => card.disabled));
  view.render({ ...s, connected: false });
  assert.ok(nodes['next-hiddenGoalCards'].children.every(card => card.disabled));
  assert.equal(nodes['next-closeHiddenGoal'].hidden, true);
  view.hide();
});

test('hidden goal confirmation can be cancelled and only submits the subsequently confirmed card', async t => {
  const nodes = mount(t), calls = [];
  const { HiddenGoalView } = await import('../public/js/games/teambingo/views/hidden-goal-view.js');
  const view = new HiddenGoalView({ chooseHiddenGoal: id => calls.push(id) });
  const s = { playerId: 'captain', connected: true, room: { code: 'CONFIRM', phase: 'choosing-goal', hiddenGoal: {
    selected: null, options: [{ id: 'first', name: '第一個', effect: '第一個說明' }, { id: 'second', name: '第二個', effect: '第二個說明' }] } } };
  view.render(s); nodes['next-hiddenGoalCards'].children[0].click();
  assert.match(nodes['next-hiddenGoalCards'].textContent, /第一個說明/);
  assert.deepEqual(calls, []);
  nodes['next-hiddenGoalCards'].children.at(-1).children[0].click();
  assert.equal(nodes['next-hiddenGoalCards'].children.length, 2);
  nodes['next-hiddenGoalCards'].children[1].click();
  view.render({ ...s, connected: false });
  nodes['next-hiddenGoalCards'].children.at(-1).children[1].click(); assert.deepEqual(calls, []);
  view.render(s);
  nodes['next-hiddenGoalCards'].children.at(-1).children[1].click(); assert.deepEqual(calls, ['second']);
  view.hide(); view.render(s);
  assert.equal(nodes['next-hiddenGoalTitle'].textContent, '隱藏勝利條件');
});

test('team members see a nondismissable waiting dialog during hidden-goal selection and it closes when play starts', async t => {
  const nodes = mount(t);
  const { HiddenGoalView } = await import('../public/js/games/teambingo/views/hidden-goal-view.js');
  const view = new HiddenGoalView({ chooseHiddenGoal() { throw Error('members cannot choose'); } });
  const s = { playerId: 'member', room: { code: 'GOALS', host: 'manager', phase: 'choosing-goal', goalsRemaining: 2 } };
  view.render(s);
  assert.equal(nodes['next-hiddenGoalDialog'].open, true);
  assert.equal(nodes['next-hiddenGoalTitle'].textContent, '等待隊長選擇隱藏勝利條件中...');
  assert.equal(nodes['next-hiddenGoalCards'].children.length, 0);
  assert.equal(nodes['next-closeHiddenGoal'].hidden, true);
  assert.equal(nodes['next-viewHiddenGoal'].hidden, true);
  nodes['next-hiddenGoalDialog'].emit('cancel', { preventDefault() {} });
  nodes['next-hiddenGoalDialog'].emit('click', { clientX: 0, clientY: 0 });
  nodes['next-closeHiddenGoal'].click(); assert.equal(nodes['next-hiddenGoalDialog'].open, true);
  s.room.goalsRemaining = 1; view.render(s);
  assert.equal(nodes['next-hiddenGoalDialog'].open, true);
  s.room.phase = 'playing'; view.render(s);
  assert.equal(nodes['next-hiddenGoalDialog'].open, false);
  s.room.phase = 'choosing-goal'; view.render(s);
  assert.equal(nodes['next-hiddenGoalDialog'].open, true);
  s.room.phase = 'lobby'; view.render(s);
  assert.equal(nodes['next-hiddenGoalDialog'].open, false);
  s.room.phase = 'choosing-goal'; view.render(s); view.hide();
  assert.equal(nodes['next-hiddenGoalDialog'].open, false);
  assert.equal(nodes['next-hiddenGoalHint'].textContent, '');
});

test('hidden-goal dialogs clear private cards while switching between captain, member and host views', async t => {
  const nodes = mount(t);
  const { HiddenGoalView } = await import('../public/js/games/teambingo/views/hidden-goal-view.js');
  const view = new HiddenGoalView({ chooseHiddenGoal() {} });
  const goal = { id: 'secret', name: '私人條件', effect: '私人說明' };
  const room = { code: 'GOALS', host: 'manager', phase: 'choosing-goal' };
  view.render({ playerId: 'captain', connected: true, room: { ...room, hiddenGoal: { options: [goal], selected: null } } });
  assert.match(nodes['next-hiddenGoalCards'].textContent, /私人條件/);
  view.render({ playerId: 'member', room });
  assert.equal(nodes['next-hiddenGoalCards'].children.length, 0);
  assert.equal(nodes['next-hiddenGoalDialog'].dataset.waiting, 'true');
  assert.equal(nodes['next-hiddenGoalDialog'].open, true);
  view.render({ playerId: 'manager', room: { ...room, hostHiddenGoals: [{ teamId: 'team-1', teamName: '隊伍 1', selected: goal }] } });
  assert.equal(nodes['next-hiddenGoalDialog'].dataset.waiting, 'false');
  assert.equal(nodes['next-hiddenGoalDialog'].open, false);
  nodes['next-viewHiddenGoal'].click();
  assert.match(nodes['next-hiddenGoalCards'].textContent, /隊伍 1.*私人條件/);
  nodes['next-hiddenGoalDialog'].emit('cancel', { preventDefault() {} });
  assert.equal(nodes['next-hiddenGoalDialog'].open, false);
  view.render({ playerId: 'other-member', room: { ...room, code: 'OTHER', phase: 'playing' } });
  assert.equal(nodes['next-hiddenGoalCards'].children.length, 0);
  assert.equal(nodes['next-viewHiddenGoal'].hidden, true); view.hide();
});

test('selected goals close automatically, can be privately reviewed and clear on viewer changes', async t => {
  const nodes = mount(t);
  const { HiddenGoalView } = await import('../public/js/games/teambingo/views/hidden-goal-view.js');
  const view = new HiddenGoalView({ chooseHiddenGoal() {} });
  const card = { id: 'pending-1', name: '待定', symbol: '?', effect: '隱藏勝利條件待定' };
  const s = { playerId: 'captain', connected: true, room: { code: 'GOALS', phase: 'choosing-goal', hiddenGoal: { options: [card], selected: null } } };
  view.render(s);
  s.room.hiddenGoal = { options: [], selected: card }; view.render(s);
  assert.equal(nodes['next-hiddenGoalDialog'].open, false);
  assert.equal(nodes['next-viewHiddenGoal'].hidden, true);
  s.room.phase = 'playing'; view.render(s);
  assert.equal(nodes['next-viewHiddenGoal'].hidden, false);
  nodes['next-viewHiddenGoal'].click(); assert.equal(nodes['next-hiddenGoalDialog'].open, true);
  assert.equal(nodes['next-hiddenGoalCards'].children.length, 1);
  assert.equal(nodes['next-hiddenGoalCards'].children[0].tagName, 'div');
  nodes['next-closeHiddenGoal'].click(); assert.equal(nodes['next-hiddenGoalDialog'].open, false);
  view.render({ ...s, playerId: 'member', room: { code: 'GOALS', phase: 'playing' } });
  assert.equal(nodes['next-viewHiddenGoal'].hidden, true);
  assert.equal(nodes['next-hiddenGoalCards'].children.length, 0);
  assert.equal(nodes['next-hiddenGoalDialog'].open, false);
  view.hide(); assert.equal(nodes['next-hiddenGoalHint'].textContent, '');
});

test('host can review team-labelled goal cards and pending teams without choosing for captains', async t => {
  const nodes = mount(t), calls = [];
  const { HiddenGoalView } = await import('../public/js/games/teambingo/views/hidden-goal-view.js');
  const view = new HiddenGoalView({ chooseHiddenGoal: id => calls.push(id) });
  const s = { playerId: 'manager', room: { code: 'GOALS', host: 'manager', phase: 'choosing-goal', hostHiddenGoals: [
    { teamId: 'team-1', teamName: '隊伍 1', selected: { id: 'a', name: '條件 A', symbol: '?', effect: '測試條件' } },
    { teamId: 'team-2', teamName: '隊伍 2', selected: null }
  ] } };
  view.render(s);
  assert.equal(nodes['next-viewHiddenGoal'].hidden, false);
  assert.equal(nodes['next-hiddenGoalDialog'].open, false);
  nodes['next-viewHiddenGoal'].click();
  assert.equal(nodes['next-hiddenGoalDialog'].open, true);
  const cards = nodes['next-hiddenGoalCards'].children;
  assert.equal(cards.length, 2); assert.ok(cards.every(card => card.tagName === 'div'));
  assert.match(cards[0].textContent, /隊伍 1.*條件 A/);
  assert.match(cards[1].textContent, /隊伍 2.*尚未選擇/);
  cards[0].click(); assert.deepEqual(calls, []);
  nodes['next-closeHiddenGoal'].click(); assert.equal(nodes['next-hiddenGoalDialog'].open, false);
  view.render({ playerId: 'member', room: { code: 'GOALS', host: 'manager', phase: 'playing' } });
  assert.equal(nodes['next-hiddenGoalCards'].children.length, 0);
  assert.equal(nodes['next-viewHiddenGoal'].hidden, true);
  view.hide();
});

test('料敵機先 captains can guess once per round from their private card and pending review closes it', async t => {
  const nodes = mount(t), calls = [];
  const { HiddenGoalView } = await import('../public/js/games/teambingo/views/hidden-goal-view.js');
  const view = new HiddenGoalView({ guessHiddenGoal: () => calls.push('guess') });
  const s = { playerId: 'captain', busy: false, connected: true, room: { code: 'GUESS', host: 'host', phase: 'playing', hiddenGoal: {
    options: [], selected: { id: 'anticipate-opponent', name: '料敵機先', symbol: 'thinking', effect: '說出對方的其中一個隱藏條件。' }, canGuess: true, guessUsed: false, round: 1
  } } };
  view.render(s); nodes['next-viewHiddenGoal'].click();
  let button = nodes['next-hiddenGoalCards'].children.at(-1);
  assert.equal(button.tagName, 'button'); assert.equal(button.disabled, false);
  assert.match(button.textContent, /第 1 回合/); button.click(); assert.deepEqual(calls, ['guess']);
  s.room.hiddenGoal.guessUsed = true; s.room.hiddenGoal.canGuess = false; view.render(s);
  button = nodes['next-hiddenGoalCards'].children.at(-1); assert.equal(button.disabled, true);
  assert.match(button.textContent, /已猜測/); button.click(); assert.deepEqual(calls, ['guess']);
  s.room.hiddenGoal = { ...s.room.hiddenGoal, guessUsed: false, canGuess: true, round: 2 };
  view.render({ ...s, connected: false }); assert.equal(nodes['next-hiddenGoalCards'].children.at(-1).disabled, true);
  view.render(s); assert.equal(nodes['next-hiddenGoalCards'].children.at(-1).disabled, false);
  s.room.hiddenGoalGuess = { id: 'session' }; view.render(s);
  assert.equal(nodes['next-hiddenGoalDialog'].open, false); view.hide();
});

test('mathematician cards show private prime progress to the captain and host without a guessing button', async t => {
  const nodes = mount(t);
  const { HiddenGoalView } = await import('../public/js/games/teambingo/views/hidden-goal-view.js');
  const view = new HiddenGoalView({ guessHiddenGoal() { throw Error('mathematician must not guess'); } });
  const selected = { id: 'mathematician', name: '數學家', symbol: 'abacus', effect: '同隊合計佔領至少5個質數格即獲勝。1 不算質數。' };
  view.render({ playerId: 'captain', room: { code: 'MATH', host: 'host', phase: 'playing', hiddenGoal: { options: [], selected, progress: { current: 4, target: 5 } } } });
  assert.equal(nodes['next-hiddenGoalCards'].children.length, 1);
  assert.match(nodes['next-hiddenGoalCards'].textContent, /數學家.*進度：4 \/ 5/);
  view.render({ playerId: 'host', room: { code: 'MATH', host: 'host', phase: 'playing', hostHiddenGoals: [
    { teamId: 'team-1', teamName: '隊伍 1', selected, progress: { current: 5, target: 5 } }
  ] } });
  assert.match(nodes['next-hiddenGoalCards'].textContent, /隊伍 1.*數學家.*進度：5 \/ 5/);
  view.hide();
});

test('near-line condition views display the resolved target and current progress for captains and hosts', async t => {
  const nodes = mount(t);
  const { HiddenGoalView } = await import('../public/js/games/teambingo/views/hidden-goal-view.js');
  const view = new HiddenGoalView({});
  const selected = { id: 'almost-bingo', name: '就差一點點', symbol: 'near-line', effect: '同隊在任一橫線、直線或主要對角線中，佔領至少5個數字格即獲勝。' };
  view.render({ playerId: 'captain', room: { code: 'ALMOST', host: 'host', phase: 'playing', hiddenGoal: { selected, options: [], progress: { current: 4, target: 5 } } } });
  assert.match(nodes['next-hiddenGoalCards'].textContent, /至少5個數字格.*進度：4 \/ 5/);
  assert.ok(!nodes['next-hiddenGoalCards'].textContent.includes('(n-1)'));
  view.render({ playerId: 'host', room: { code: 'ALMOST', host: 'host', phase: 'playing', hostHiddenGoals: [{ teamId: 'team-1', teamName: '隊伍 1', selected, progress: { current: 4, target: 5 } }] } });
  assert.match(nodes['next-hiddenGoalCards'].textContent, /隊伍 1.*至少5個數字格.*進度：4 \/ 5/);
  view.hide();
});

test('four corners displays the flag and private progress to the captain and host', async t => {
  const nodes = mount(t);
  const { HiddenGoalView } = await import('../public/js/games/teambingo/views/hidden-goal-view.js');
  const view = new HiddenGoalView({});
  const selected = { id: 'four-corners', name: '四角佔領', symbol: 'flag', effect: '同隊佔領盤面四個角落。' };
  view.render({ playerId: 'captain', room: { code: 'CORNERS', host: 'host', phase: 'playing', hiddenGoal: { selected, options: [], progress: { current: 3, target: 4 } } } });
  assert.match(nodes['next-hiddenGoalCards'].textContent, /四角佔領.*進度：3 \/ 4/);
  view.render({ playerId: 'host', room: { code: 'CORNERS', host: 'host', phase: 'playing', hostHiddenGoals: [{ teamId: 'team-1', teamName: '隊伍 1', selected, progress: { current: 4, target: 4 } }] } });
  assert.match(nodes['next-hiddenGoalCards'].textContent, /隊伍 1.*四角佔領.*進度：4 \/ 4/);
  view.hide();
});

test('guess review shows reference goals only to the host, locks dismissal and dispatches verdicts', async t => {
  const nodes = mount(t), calls = [];
  const { HiddenGuessView } = await import('../public/js/games/teambingo/views/hidden-guess-view.js');
  const view = new HiddenGuessView({ judgeHiddenGoalGuess: (...args) => calls.push(args) });
  const room = { host: 'host', hiddenGoalGuess: { id: 'session', teamId: 'team-1', teamName: '隊伍 1', captainName: '隊長甲' },
    hostHiddenGoals: [{ teamId: 'team-1', teamName: '隊伍 1', selected: { name: '料敵機先' } }, { teamId: 'team-2', teamName: '隊伍 2', selected: { name: '對方條件' } }] };
  view.render({ room, playerId: 'host', busy: false, connected: true });
  assert.equal(nodes['next-guessDialog'].open, true);
  assert.equal(nodes['next-guessReference'].textContent, '隊伍 2：對方條件');
  nodes['next-guessDialog'].emit('cancel', { preventDefault() {} });
  nodes['next-guessDialog'].emit('click', { clientX: 0, clientY: 0 });
  assert.equal(nodes['next-guessDialog'].open, true);
  nodes['next-guessWrong'].click(); assert.deepEqual(calls, [['session', false]]);
  view.render({ room, playerId: 'host', connected: false }); assert.equal(nodes['next-guessCorrect'].disabled, true);
  view.render({ room, playerId: 'member', connected: true });
  assert.equal(nodes['next-guessReference'].textContent, ''); assert.equal(nodes['next-guessReference'].hidden, true);
  assert.equal(nodes['next-guessCorrect'].hidden, true); assert.equal(nodes['next-guessWrong'].hidden, true);
  view.render({ room: { ...room, hiddenGoalGuess: null }, playerId: 'member' });
  assert.equal(nodes['next-guessDialog'].open, false); assert.equal(view.guessId, null);
  view.hide();
});

test('pending hidden-goal guesses disable number claims and team cards and display the paused reason', async t => {
  const nodes = mount(t);
  const { BoardView } = await import('../public/js/games/teambingo/views/board-view.js');
  const { HandView } = await import('../public/js/games/teambingo/views/hand-view.js');
  const s = boardClockState(); s.room.hiddenGoalGuess = { id: 'session' };
  s.room.teams.forEach(team => { team.clockRunning = false; });
  s.hand = [{ id: 'held', definitionId: 'team-hints-plus-2', name: '提示' }];
  const board = new BoardView({}); board.render(s);
  new HandView({ useCard() {} }).render(s);
  assert.ok(nodes['next-board'].children.every(cell => cell.disabled));
  assert.equal(nodes['next-handList'].children[0].children[0].disabled, true);
  assert.match(nodes['next-phaseText'].textContent, /判定隊長猜測.*暫停/);
  board.hide();
});

test('goal selection disables the board and shows waiting status without starting an action clock', async t => {
  const nodes = mount(t);
  const { BoardView } = await import('../public/js/games/teambingo/views/board-view.js');
  const view = new BoardView({});
  const s = boardClockState(); s.room.phase = 'choosing-goal'; s.room.turn = null; s.room.goalsRemaining = 2;
  view.render(s);
  assert.match(nodes['next-phaseText'].textContent, /等待 2 位隊長.*計時暫停/);
  assert.ok(nodes['next-board'].children.every(cell => cell.disabled));
  assert.equal(view.clockTimer, null); view.hide();
});

test('captain hint countdown displays a circle, ignores dismissal and closes automatically without extending on updates', async t => {
  const nodes = mount(t); let now = 0; t.mock.method(Date, 'now', () => now);
  const { CaptainHintView } = await import('../public/js/games/teambingo/views/captain-hint-view.js');
  const calls = [], view = new CaptainHintView({ hint: () => calls.push('hint') }); t.after(() => view.hide());
  const s = { me: { id: 'captain', teamId: 'team-1', spectating: true }, connected: true, busy: false,
    room: { code: 'HINT', phase: 'playing', canHint: true, teams: [{ id: 'team-1', hintUsesRemaining: 3 }], hint: null } };
  view.render(s); assert.equal(nodes['next-captainHint'].hidden, false);
  assert.equal(nodes['next-captainHint'].textContent, '提示隊員（3 次）');
  nodes['next-captainHint'].click(); assert.deepEqual(calls, ['hint']);
  s.room.hint = { id: 'hint', teamName: '隊伍 1', remainingMs: 30000 }; s.room.canHint = false;
  view.render(s); assert.equal(nodes['next-hintDialog'].open, true);
  assert.equal(nodes['next-hintCount'].textContent, '30');
  assert.equal(nodes['next-hintProgress'].attributes['stroke-dashoffset'], '0');
  let prevented = false; nodes['next-hintDialog'].emit('cancel', { preventDefault() { prevented = true; } });
  nodes['next-hintDialog'].emit('click', { clientX: 0, clientY: 0 });
  assert.equal(prevented, true); assert.equal(nodes['next-hintDialog'].open, true);
  now = 15000; view.update(); assert.equal(nodes['next-hintCount'].textContent, '15');
  assert.ok(Number(nodes['next-hintProgress'].attributes['stroke-dashoffset']) > 150);
  view.render(s); assert.equal(view.deadline, 30000);
  now = 30000; view.update(); assert.equal(nodes['next-hintDialog'].open, false); assert.equal(view.timer, null);
});

test('hint dialogs show server remaining time to members and restrict the button to eligible captains', async t => {
  const nodes = mount(t); t.mock.method(Date, 'now', () => 1000);
  const { CaptainHintView } = await import('../public/js/games/teambingo/views/captain-hint-view.js');
  const view = new CaptainHintView({ hint() {} }); t.after(() => view.hide());
  const room = { code: 'HINT', phase: 'playing', canHint: false, teams: [{ id: 'team-1', hintUsesRemaining: 0 }], hint: { id: 'existing', teamName: '隊伍 2', remainingMs: 20000 } };
  view.render({ room, me: { id: 'member', teamId: 'team-1' }, connected: true });
  assert.equal(nodes['next-captainHint'].hidden, true); assert.equal(nodes['next-hintDialog'].open, true);
  assert.equal(nodes['next-hintTitle'].textContent, '隊伍 2 隊長提示中');
  assert.equal(nodes['next-hintCount'].textContent, '20'); assert.equal(view.deadline, 21000);
  view.render({ room, me: { id: 'captain', teamId: 'team-1', spectating: true }, connected: false });
  assert.equal(nodes['next-captainHint'].disabled, true);
  assert.equal(nodes['next-captainHint'].textContent, '提示隊員（0 次）');
  room.hint = null; view.render({ room, me: {}, connected: true });
  assert.equal(nodes['next-hintDialog'].open, false); assert.equal(view.timer, null);
});

test('spectator and hint states disable number selection and team card usage even for a stale current turn', async t => {
  const nodes = mount(t);
  const { BoardView } = await import('../public/js/games/teambingo/views/board-view.js');
  const { HandView } = await import('../public/js/games/teambingo/views/hand-view.js');
  const board = new BoardView({ call() {} }), hand = new HandView({ useCard() {} }); t.after(() => board.hide());
  const s = boardClockState(); s.me.spectating = true;
  s.hand = [{ id: 'held', definitionId: 'team-time-plus-2m', name: '加時' }];
  board.render(s); hand.render(s);
  assert.ok(nodes['next-board'].children.every(cell => cell.disabled));
  assert.equal(nodes['next-handList'].children[0].children[0].disabled, true);
  s.me.spectating = false; s.room.hint = { id: 'hint' }; board.render(s); hand.render(s);
  assert.ok(nodes['next-board'].children.every(cell => cell.disabled));
  assert.equal(nodes['next-handList'].children[0].children[0].disabled, true);
  assert.match(nodes['next-phaseText'].textContent, /隊長提示中/);
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
  const snapshot = { room: { ...s.room, host: 'manager', teams: s.room.bridge.teams.map(team => ({ ...team, rewards: [] })), playersPerTeam: 1 },
    me: s.me, playerId: 'host', connected: true, busy: false };
  next.render(snapshot); nodes['next-ready'].click(); assert.deepEqual(sent.at(-1), ['ready']);
  snapshot.playerId = 'manager'; next.render(snapshot);
  assert.equal(nodes['next-joinControls'].hidden, true);
  const captainControl = nodes['next-players'].children[0].children.find(n => n.className === 'team-roster-captain-control');
  const bridgeCaptainControl = nodes.bridgeTeams.children[0].children.find(n => n.className === 'team-roster-captain-control');
  assert.equal(captainControl.className, bridgeCaptainControl.className);
  captainControl.children[0].value = 'host'; captainControl.children[0].onchange();
  assert.deepEqual(sent.at(-1), ['captain', 'team-1', 'host']);
  snapshot.room.teams[0].captainId = 'host'; next.render(snapshot);
  assert.match(nodes['next-players'].children[0].textContent, /隊長/);
  snapshot.room.host = 'other'; next.render(snapshot);
  assert.ok(nodes['next-players'].children.every(group => !group.children.some(n => n.className === 'team-roster-captain-control')));
  snapshot.room.host = 'manager'; snapshot.playerId = 'host';
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

test('Team Bingo host sees player totals without their own identity, join controls or a team hand drawer', async t => {
  const nodes = mount(t);
  const { PlayersView } = await import('../public/js/games/teambingo/views/players-view.js');
  const { HandDrawerView } = await import('../public/js/games/teambingo/views/hand-drawer-view.js');
  const state = bridgeState();
  state.room.players.push({ id: 'member', name: 'Member', teamId: 'team-2', ready: false, online: true });
  state.room.teams = state.room.bridge.teams.map(team => ({ ...team, rewards: [] }));
  state.room.playersPerTeam = 2;
  const view = new PlayersView({ team() {}, ready() {}, captain() {} });
  view.render(state);
  assert.equal(nodes['next-playerCount'].textContent, '1 / 4 人');
  assert.equal(nodes['next-joinControls'].hidden, true);
  assert.ok(!view.roster.model.members.some(member => member.id === state.room.host));
  const drawer = new HandDrawerView();
  nodes['next-handPanel'].showModal(); drawer.render(state);
  assert.equal(nodes['next-handPanel'].open, false);
  assert.equal(nodes['next-handDock'].hidden, true);
  view.hide();
});

test('Team Bingo captain has a ready toggle and the host waits for captain readiness', async t => {
  const nodes = mount(t), sent = [];
  const { PlayersView } = await import('../public/js/games/teambingo/views/players-view.js');
  const { HostControlsView } = await import('../public/js/games/teambingo/views/host-controls-view.js');
  const state = bridgeState(); state.room.host = 'manager';
  state.me.spectating = true; state.me.participating = false;
  state.room.players.push({ id: 'member', name: 'Member', teamId: 'team-1', ready: true, participating: true });
  state.room.teams = [{ id: 'team-1', name: '隊伍 1', playerIds: ['host', 'member'], captainId: 'host', lines: 0, rewards: [] }];
  state.room.teamCount = 1; state.room.playersPerTeam = 2;
  const players = new PlayersView({ team() {}, ready: () => sent.push('ready'), captain() {} });
  players.render(state);
  assert.equal(nodes['next-ready'].hidden, false); assert.equal(nodes['next-ready'].disabled, false);
  nodes['next-ready'].click(); assert.deepEqual(sent, ['ready']);
  assert.match(nodes['next-players'].textContent, /未準備/);
  const controls = new HostControlsView({});
  controls.render(state); assert.equal(nodes['next-start'].disabled, true);
  assert.match(nodes['next-start'].textContent, /等待 1 位玩家準備/);
  state.me.ready = true; players.render(state); controls.render(state);
  assert.equal(nodes['next-ready'].textContent, '取消準備'); assert.equal(nodes['next-start'].disabled, false);
  players.hide();
});

test('Team Bingo final settlement combines card reward quantities with line prizes for each team', async t => {
  const nodes = mount(t);
  const { RewardsView, rewardTotals } = await import('../public/js/games/teambingo/views/rewards-view.js');
  const room = { code: 'GIFT', phase: 'playing', winners: [], teams: [
    { id: 'team-1', name: '隊伍 1', rewards: [{ item: '飄雪結晶' }, { item: '突襲券' }], bonusRewards: [{ item: '飄雪結晶', quantity: 40 }] },
    { id: 'team-2', name: '隊伍 2', rewards: [], bonusRewards: [] }
  ] };
  const view = new RewardsView(); view.render({ room });
  assert.equal(nodes['next-gameResultsDialog'].open, false);
  room.phase = 'finished'; view.render({ room });
  assert.equal(nodes['next-gameResultsDialog'].open, true);
  const rows = nodes['next-gameResultsList'].children;
  assert.match(rows[0].textContent, /42 份/); assert.match(rows[0].textContent, /飄雪結晶× 41/);
  assert.match(rows[1].textContent, /尚未獲得獎品/);
  assert.deepEqual(rewardTotals([{ item: '飄雪結晶', quantity: 20 }]), [{ item: '飄雪結晶', count: 20 }]);
  view.hide();
});

test('final settlement shows all gift quantities alongside necklace and Maple Blessing icons', async t => {
  const nodes = mount(t);
  const { RewardsView } = await import('../public/js/games/teambingo/views/rewards-view.js');
  const team = { id: 'team-1', name: '隊伍 1', rewards: [{ item: '龍王項鍊' }, { item: '楓葉祝福20' }], bonusRewards: [
    { item: '飄雪結晶', quantity: 20 }, { item: '傳送石', quantity: 4 }, { item: '突襲券', quantity: 2 }
  ] };
  const view = new RewardsView();
  view.render({ room: { code: 'RESULT', phase: 'finished', winners: ['team-1'], teams: [team] } });
  const row = nodes['next-gameResultsList'].children[0];
  assert.match(row.textContent, /28 份/);
  for (const [index, item] of ['龍王項鍊', '楓葉祝福20', '飄雪結晶', '傳送石', '突襲券'].entries()) {
    const entry = row.children[index + 1];
    assert.equal(entry.children[0].src, `/assets/items/${encodeURIComponent(item)}.png`);
    assert.equal(entry.children[1].textContent, item);
  }
  assert.match(row.textContent, /飄雪結晶× 20/); assert.match(row.textContent, /傳送石× 4/);
  assert.match(row.textContent, /突襲券× 2/); view.hide();
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
    teams: [{ playerIds: ['host', 'captain-1'], captainId: 'captain-1' }, { playerIds: ['guest', 'captain-2'], captainId: 'captain-2' }] };
  const s = { room, me: players[0], busy: false, connected: true };
  view.render(s); assert.equal(nodes['next-start'].disabled, false); assert.match(nodes['next-start'].textContent, /開始遊戲/);
  room.teams[1].captainId = null; view.render(s);
  assert.equal(nodes['next-start'].disabled, true); assert.match(nodes['next-start'].textContent, /指定隊長/);
  room.teams[1].captainId = 'guest';
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

test('question dialogs ignore backdrop clicks and Team Bingo cannot cancel with Escape', async t => {
  const nodes = mount(t);
  for (const game of ['bingo', 'teambingo']) {
  const prefix = game === 'bingo' ? '' : 'next-';
  const { SharedCardView } = await import(`../public/js/games/${game}/views/shared-card-view.js`);
  const cancelled = [];
  const view = new SharedCardView({ cancelCard: id => cancelled.push(id) });
  const active = { id: 'session', playerId: 'host', stage: 'question', card: { name: 'Card', options: ['A', 'B'], question: 'Q' } };
  const s = { room: { host: 'host', phase: 'playing', activeCard: active, players: [{ id: 'host', name: 'Host' }] },
    me: { id: 'host' }, connected: true, busy: false };
  view.render(s);
  const dialog = nodes[`${prefix}sharedCardDialog`], close = nodes[`${prefix}cancelSharedCard`];
  if (game === 'bingo') assert.equal(close.hidden, false);
  for (const position of [{ clientX: 0, clientY: 0 }, { clientX: 600, clientY: 700 }, { clientX: 50, clientY: 150 }]) dialog.emit('click', position);
  assert.deepEqual(cancelled, []); assert.equal(dialog.open, true);
  assert.equal(s.room.activeCard.id, 'session');
  if (game === 'bingo') close.click();
  let prevented = false;
  dialog.emit('cancel', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  const expected = game === 'bingo' ? ['session', 'session'] : [];
  assert.deepEqual(cancelled, expected);
  assert.equal(dialog.open, true);
  for (const override of [{ busy: true }, { connected: false }, { me: { id: 'other' } },
    { room: { ...s.room, activeCard: { ...active, stage: 'review' } } }]) {
    view.render({ ...s, ...override });
    dialog.emit('click', { clientX: 0, clientY: 0 });
    assert.deepEqual(cancelled, expected); assert.equal(dialog.open, true);
  }
  view.close();
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
  const s = sharedState('owner'); s.room.activeCard.answerRemainingMs = 10000;
  view.render(s); assert.match(nodes['next-sharedCardStatus'].textContent, /00:10/);
  assert.equal(nodes['next-sharedCardStatus'].dataset.countdown, 'true');
  now = 6000; nodes['next-sharedCardOptions'].children[0].click();
  assert.match(nodes['next-sharedCardStatus'].textContent, /00:05/);
  now = 11000; view.updateAnswerClock();
  assert.equal(nodes['next-answerSharedCard'].disabled, true);
  assert.ok(nodes['next-sharedCardOptions'].children.every(option => option.disabled));
  const review = sharedState('host', 'review'); review.room.activeCard.timedOut = true;
  view.render(review); assert.match(nodes['next-sharedCardResult'].textContent, /未於時限內作答/);
  assert.equal(nodes['next-judgeCardCorrect'].hidden, false); assert.equal(nodes['next-judgeCardWrong'].hidden, false);
  assert.equal(view.answerTimer, null);
  assert.equal(nodes['next-sharedCardStatus'].dataset.countdown, 'false');
});

test('oral question UI offers acknowledgment without choices and restores normal multiple-choice controls', async t => {
  const nodes = mount(t), calls = [];
  const { SharedCardView } = await import('../public/js/games/teambingo/views/shared-card-view.js');
  const view = new SharedCardView({ answerCard: (...args) => calls.push(args) }); t.after(() => view.close());
  const s = sharedState('owner');
  s.room.activeCard.card.questionType = 'oral'; s.room.activeCard.card.options = [];
  view.render(s);
  assert.equal(nodes['next-sharedCardOptions'].children.length, 0);
  assert.equal(nodes['next-answerSharedCard'].textContent, '已回答');
  assert.equal(nodes['next-answerSharedCard'].disabled, false);
  assert.match(nodes['next-sharedCardResult'].textContent, /口頭回答/);
  nodes['next-answerSharedCard'].click(); assert.deepEqual(calls, [['session', null, true]]);
  const observer = { ...s, me: { id: 'spectator' } }; view.render(observer);
  assert.equal(nodes['next-answerSharedCard'].hidden, true);
  const review = sharedState('host', 'review'); review.room.activeCard.card.questionType = 'oral';
  review.room.activeCard.card.options = []; review.room.activeCard.referenceAnswer = '菇菇仔、菇菇寶貝';
  view.render(review); assert.match(nodes['next-sharedCardResult'].textContent, /正確答案：菇菇仔、菇菇寶貝/);
  const multipleChoice = sharedState('owner'); multipleChoice.room.activeCard.id = 'new-multiple-choice';
  view.render(multipleChoice);
  assert.equal(nodes['next-answerSharedCard'].textContent, '確認答案');
  assert.equal(nodes['next-answerSharedCard'].disabled, true);
  assert.equal(nodes['next-sharedCardOptions'].children.length, 2);
});

test('only the host can request the next question before judgment and controls respect connection state', async t => {
  const nodes = mount(t), calls = [];
  const { SharedCardView } = await import('../public/js/games/teambingo/views/shared-card-view.js');
  const view = new SharedCardView({ nextQuestion: id => calls.push(id) }); t.after(() => view.close());
  for (const player of ['owner', 'spectator', 'host']) {
    for (const stage of ['question', 'review', 'result']) {
      view.render(sharedState(player, stage));
      assert.equal(nodes['next-nextQuestion'].hidden, player !== 'host' || stage === 'result');
    }
  }
  view.render(sharedState('host')); nodes['next-nextQuestion'].click();
  assert.deepEqual(calls, ['session']);
  for (const override of [{ busy: true }, { connected: false }]) {
    view.render({ ...sharedState('host'), ...override });
    assert.equal(nodes['next-nextQuestion'].disabled, true);
  }
});

test('a replacement question resets local answer selection and starts a new server countdown', async t => {
  const nodes = mount(t); let now = 0; t.mock.method(Date, 'now', () => now);
  const { SharedCardView } = await import('../public/js/games/teambingo/views/shared-card-view.js');
  const view = new SharedCardView({}); t.after(() => view.close());
  const s = sharedState('owner'); s.room.activeCard.answerRemainingMs = 10000;
  view.render(s); nodes['next-sharedCardOptions'].children[0].click();
  assert.equal(view.choice, 0);
  now = 9000; s.room.activeCard = { ...s.room.activeCard, id: 'replacement', answerRemainingMs: 20000 };
  view.render(s);
  assert.equal(view.choice, null); assert.equal(view.answerDeadline, 29000);
  assert.equal(nodes['next-sharedCardStatus'].textContent, '作答剩餘 00:20');
  assert.equal(nodes['next-answerSharedCard'].disabled, true);
  assert.ok(nodes['next-sharedCardOptions'].children.every(option => option.attributes['aria-pressed'] === 'false'));
});

test('all viewers display the server supplied 10, 20 or 30 second countdown without difficulty labels', async t => {
  const nodes = mount(t); t.mock.method(Date, 'now', () => 1000);
  const { SharedCardView } = await import('../public/js/games/teambingo/views/shared-card-view.js');
  const view = new SharedCardView({}); t.after(() => view.close());
  for (const playerId of ['owner', 'host', 'spectator']) {
    for (const seconds of [10, 20, 30]) {
      const s = sharedState(playerId);
      s.room.activeCard.id = `${playerId}-${seconds}`;
      s.room.activeCard.answerRemainingMs = seconds * 1000;
      view.render(s);
      assert.equal(nodes['next-sharedCardStatus'].textContent, `作答剩餘 00:${seconds}`);
      assert.doesNotMatch(nodes['next-sharedCardStatus'].textContent, /簡單|普通|困難/);
      view.updateAnswerClock(1000 + seconds * 1000);
      assert.equal(nodes['next-answerSharedCard'].disabled, true);
      assert.ok(nodes['next-sharedCardOptions'].children.every(option => option.disabled));
      view.close();
    }
  }
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
        s.room.activeCard.card.questionCategory = '無用知識';
        view.render(s);
        assert.doesNotMatch(nodes['next-sharedCardStatus'].textContent, /難度|簡單|普通|困難/);
        assert.equal(nodes['next-sharedCardQuestion'].textContent, '[無用知識]: 問題');
        assert.equal(nodes['next-sharedCardQuestion'].children[1].tagName, 'strong');
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


for (const goalCount of [2, 3]) test(`${goalCount}-goal selection confirms each choice and keeps partial choices open`, async t => {
  const nodes = mount(t), calls = [];
  const { HiddenGoalView } = await import('../public/js/games/teambingo/views/hidden-goal-view.js');
  const view = new HiddenGoalView({ chooseHiddenGoal: id => calls.push(id) });
  const cards = ['first', 'second', 'third'].slice(0, goalCount).map(id => ({ id, name: id, effect: `${id} effect`, symbol: 'running' }));
  const goal = { selected: null, selections: [], options: cards, requiredCount: goalCount, selectionComplete: false };
  const state = { playerId: 'captain', connected: true, room: { code: 'THREE', host: 'host', phase: 'choosing-goal', hiddenGoal: goal } };
  view.render(state);
  assert.match(nodes['next-hiddenGoalHint'].textContent, new RegExp(`選擇 ${goalCount} 個不同隱藏勝利條件`));
  for (const card of cards) {
    nodes['next-hiddenGoalCards'].children[0].click();
    assert.equal(nodes['next-hiddenGoalTitle'].textContent, '確認隱藏勝利條件');
    nodes['next-hiddenGoalCards'].children.at(-1).children[1].click();
    goal.selections.push(card); goal.options = cards.filter(c => !goal.selections.includes(c));
    goal.selectionComplete = goal.selections.length === goalCount;
    goal.selected = goal.selectionComplete ? goal.selections[0] : null;
    view.render(state);
    assert.equal(nodes['next-hiddenGoalDialog'].open, !goal.selectionComplete);
  }
  assert.deepEqual(calls, cards.map(card => card.id));
  state.room.phase = 'playing'; view.render(state); nodes['next-viewHiddenGoal'].click();
  assert.equal(nodes['next-hiddenGoalCards'].children.length, goalCount);
  assert.match(nodes['next-hiddenGoalCards'].textContent, new RegExp(cards.map(card => card.name).join('.*')));
});

test('host reviews every selected condition and its completed status for each team', async t => {
  const nodes = mount(t);
  const { HiddenGoalView } = await import('../public/js/games/teambingo/views/hidden-goal-view.js');
  const view = new HiddenGoalView({});
  const selections = ['A', 'B', 'C'].map((name, i) => ({ id: name, name, effect: name, completed: i === 0, symbol: 'running' }));
  view.render({ playerId: 'host', room: { code: 'HOST', host: 'host', phase: 'playing', hostHiddenGoals: [
    { teamId: 'team-1', teamName: '隊伍 1', selections }, { teamId: 'team-2', teamName: '隊伍 2', selections }
  ] } });
  assert.equal(nodes['next-hiddenGoalCards'].children.length, 6);
  assert.match(nodes['next-hiddenGoalCards'].children[0].textContent, /隊伍 1.*A.*已達成/);
  assert.match(nodes['next-hiddenGoalCards'].children[3].textContent, /隊伍 2.*A.*已達成/);
});

test('bridge host can open the player introduction during preparation with the current victory target', async t => {
  const nodes = mount(t);
  const { BridgeIntroductionView } = await import('../public/js/games/bridge/introduction-view.js');
  const view = new BridgeIntroductionView();
  const state = { playerId: 'host', room: { code: 'INTRO', host: 'host', phase: 'lobby', size: 6, goal: 4 } };
  const before = structuredClone(state); view.render(state);
  assert.equal(nodes.bridgeIntroduction.hidden, false); nodes.bridgeIntroduction.click();
  assert.equal(nodes.bridgeIntroductionDialog.open, true);
  assert.match(nodes.bridgeIntroductionContent.textContent, /本局完成 4 條連線/);
  assert.match(nodes.bridgeIntroductionContent.textContent, /同輪達標的隊伍並列獲勝/);
  assert.match(nodes.bridgeIntroductionContent.textContent, /只能丟棄/);
  assert.doesNotMatch(nodes.bridgeIntroductionContent.textContent, /預設|最多 16/);
  assert.deepEqual(state, before);
});

test('bridge introduction stays readable while playing or disconnected without rebuilding during updates', async t => {
  const nodes = mount(t);
  const { BridgeIntroductionView } = await import('../public/js/games/bridge/introduction-view.js');
  const view = new BridgeIntroductionView();
  const state = { playerId: 'host', busy: true, connected: false, room: { code: 'INTRO', host: 'host', phase: 'playing', size: 6, goal: 4 } };
  view.render(state); nodes.bridgeIntroduction.click();
  const content = nodes.bridgeIntroductionContent.children[0]; nodes.bridgeIntroductionDialog.scrollTop = 100;
  view.render(state);
  assert.equal(nodes.bridgeIntroductionDialog.open, true); assert.equal(nodes.bridgeIntroductionDialog.scrollTop, 100);
  assert.equal(nodes.bridgeIntroductionContent.children[0], content);
});

test('other bridge players cannot open the host introduction and changing role closes an open dialog', async t => {
  const nodes = mount(t);
  const { BridgeIntroductionView } = await import('../public/js/games/bridge/introduction-view.js');
  const view = new BridgeIntroductionView(), room = { code: 'INTRO', host: 'host', phase: 'playing', size: 6, goal: 4 };
  view.render({ room, playerId: 'host' }); nodes.bridgeIntroduction.click();
  view.render({ room, playerId: 'guest' });
  assert.equal(nodes.bridgeIntroduction.hidden, true); assert.equal(nodes.bridgeIntroductionDialog.open, false);
  nodes.bridgeIntroduction.click(); assert.equal(nodes.bridgeIntroductionDialog.open, false);
});

test('bridge introduction can close by button, Escape or outside click and reopen', async t => {
  const nodes = mount(t);
  const { BridgeIntroductionView } = await import('../public/js/games/bridge/introduction-view.js');
  const view = new BridgeIntroductionView();
  view.render({ playerId: 'host', room: { code: 'INTRO', host: 'host', phase: 'playing', size: 6, goal: 4 } });
  nodes.bridgeIntroduction.click(); nodes.bridgeCloseIntroduction.click(); assert.equal(nodes.bridgeIntroductionDialog.open, false);
  nodes.bridgeIntroduction.click(); nodes.bridgeIntroductionDialog.emit('cancel', { preventDefault() {} }); assert.equal(nodes.bridgeIntroductionDialog.open, false);
  nodes.bridgeIntroduction.click(); nodes.bridgeIntroductionDialog.emit('click', { clientX: 50, clientY: 150 }); assert.equal(nodes.bridgeIntroductionDialog.open, true);
  nodes.bridgeIntroductionDialog.emit('click', { clientX: 0, clientY: 0 }); assert.equal(nodes.bridgeIntroductionDialog.open, false);
});

test('bridge introduction refreshes the target after setting changes and closes when switching rooms or leaving', async t => {
  const nodes = mount(t);
  const { BridgeIntroductionView } = await import('../public/js/games/bridge/introduction-view.js');
  const view = new BridgeIntroductionView(), state = { playerId: 'host', room: { code: 'INTRO', host: 'host', phase: 'lobby', size: 6, goal: 4 } };
  view.render(state); nodes.bridgeIntroduction.click();
  view.render({ ...state, room: { ...state.room, size: 5, goal: 3 } });
  assert.equal(nodes.bridgeIntroductionDialog.open, true); assert.match(nodes.bridgeIntroductionContent.textContent, /本局完成 3 條連線/);
  view.render({ ...state, room: { ...state.room, code: 'OTHER' } }); assert.equal(nodes.bridgeIntroductionDialog.open, false);
  nodes.bridgeIntroduction.click(); view.hide();
  assert.equal(nodes.bridgeIntroductionDialog.open, false); assert.equal(nodes.bridgeIntroduction.hidden, true);
  assert.equal(nodes.bridgeIntroductionContent.children.length, 0);
});

test('bridge introduction closes at game end and does not cover the results', async t => {
  const nodes = mount(t);
  const { BridgeIntroductionView } = await import('../public/js/games/bridge/introduction-view.js');
  const view = new BridgeIntroductionView(), state = { playerId: 'host', room: { code: 'INTRO', host: 'host', phase: 'playing', size: 6, goal: 4 } };
  view.render(state); nodes.bridgeIntroduction.click();
  view.render({ ...state, room: { ...state.room, phase: 'finished' } });
  assert.equal(nodes.bridgeIntroduction.hidden, true); assert.equal(nodes.bridgeIntroductionDialog.open, false);
});

function guideNodes(root, tag) {
  return [...(root.tagName === tag ? [root] : []), ...root.children.flatMap(child => guideNodes(child, tag))];
}

test('bridge player introduction contains five illustrated groups with accessible vector images', async t => {
  const nodes = mount(t);
  const { BridgeIntroductionView } = await import('../public/js/games/bridge/introduction-view.js');
  const view = new BridgeIntroductionView();
  view.render({ playerId: 'host', room: { code: 'PICTURES', host: 'host', phase: 'lobby', size: 6, goal: 4 } });
  assert.equal(guideNodes(nodes.bridgeIntroductionContent, 'figure').length, 5);
  const images = guideNodes(nodes.bridgeIntroductionContent, 'svg');
  assert.equal(images.length, 7);
  for (const image of images) {
    assert.equal(image.attributes.role, 'img'); assert.ok(image.attributes['aria-label']);
    assert.ok(image.attributes.viewBox); assert.equal(image.attributes.focusable, 'false');
    assert.ok(image.children.length > 0);
  }
});

test('bridge introduction illustrates separate team boards shared by members of their own team', async t => {
  mount(t);
  const { bridgeIntroductionIllustration } = await import('../public/js/games/bridge/introduction-illustrations.js');
  const images = guideNodes(bridgeIntroductionIllustration(1), 'svg');
  assert.equal(images.length, 2);
  const boards = images[0];
  assert.match(boards.attributes['aria-label'], /隊伍A的成員共用A盤面.*隊伍B的成員共用B盤面.*互不影響/);
  assert.match(boards.textContent, /隊伍A的盤面.*A1.*A2.*隊伍B的盤面.*B1.*B2.*各隊獨立/);
  const grids = guideNodes(boards, 'rect').filter(node => node.attributes.fill === '#29493d');
  assert.equal(grids.length, 2);
});

test('bridge placement pictures separately demonstrate following suit and missing-suit placement', async t => {
  mount(t);
  const { bridgeIntroductionIllustration } = await import('../public/js/games/bridge/introduction-illustrations.js');
  const [follow, missing] = guideNodes(bridgeIntroductionIllustration(2), 'svg');
  assert.match(follow.attributes['aria-label'], /黃7.*7號格/);
  assert.match(missing.attributes['aria-label'], /沒有指定的黃色.*藍8.*任意空格.*2號格/);
  assert.match(follow.textContent, /放在對應數字7/); assert.match(missing.textContent, /可放在任意空格/);
});

test('bridge discard picture preserves the original cell number and shows the occupying card separately', async t => {
  mount(t);
  const { bridgeIntroductionIllustration } = await import('../public/js/games/bridge/introduction-illustrations.js');
  const image = guideNodes(bridgeIntroductionIllustration(3), 'svg')[0];
  const labels = guideNodes(image, 'text').map(node => node.textContent);
  assert.ok(labels.includes('7')); assert.ok(labels.includes('紅4')); assert.ok(labels.includes('只能丟棄'));
  assert.match(image.attributes['aria-label'], /必須跟黃色.*只能丟棄.*不能改放其他格/);
});

test('bridge line and settlement illustrations explain the scoring directions and simultaneous winners', async t => {
  mount(t);
  const { bridgeIntroductionIllustration } = await import('../public/js/games/bridge/introduction-illustrations.js');
  const lines = guideNodes(bridgeIntroductionIllustration(0), 'svg')[0];
  assert.match(lines.textContent, /橫線.*直線.*主要對角線/);
  const round = guideNodes(bridgeIntroductionIllustration(5), 'svg')[0];
  assert.match(round.attributes['aria-label'], /A隊全員出完.*B隊全員出牌.*同輪達標者並列獲勝/);
  assert.match(round.textContent, /同輪達標 → 並列獲勝/);
});

test('bridge introduction explicitly limits the blocked-number missing-suit tip to followers', async t => {
  const nodes = mount(t);
  const { BridgeIntroductionView } = await import('../public/js/games/bridge/introduction-view.js');
  new BridgeIntroductionView().render({ playerId: 'host', room: { code: 'EXCEPTION', host: 'host', phase: 'lobby', size: 6, goal: 4 } });
  const rules = nodes.bridgeIntroductionContent.textContent;
  assert.match(rules, /首位玩家尚無指定顏色/);
  assert.match(rules, /遊戲訣竅：利用缺色可以救回對應格已被佔領的手牌。/);
});

test('bridge discard illustration shows both mandatory discard and the missing-suit placement tip', async t => {
  mount(t);
  const { bridgeIntroductionIllustration } = await import('../public/js/games/bridge/introduction-illustrations.js');
  const image = guideNodes(bridgeIntroductionIllustration(3), 'svg')[0];
  assert.match(image.textContent, /只能丟棄.*遊戲訣竅：利用缺色救回被擋住的手牌.*可改放任意空格/);
  assert.match(image.attributes['aria-label'], /後續玩家若缺少黃色.*首位玩家尚無指定顏色/);
});

test('bridge introduction shows exactly one topic per page and disables navigation at the ends', async t => {
  const nodes = mount(t);
  const { BridgeIntroductionView } = await import('../public/js/games/bridge/introduction-view.js');
  new BridgeIntroductionView().render({ playerId: 'host', room: { code: 'PAGES', host: 'host', phase: 'lobby', size: 6, goal: 4 } });
  nodes.bridgeIntroduction.click();
  const pages = nodes.bridgeIntroductionContent.children;
  assert.equal(pages.length, 5); assert.equal(nodes.bridgeIntroductionPage.textContent, '1 / 5');
  assert.match(pages[1].textContent, /盤面與手牌.*出牌順序.*每人每輪出一張牌.*每輪首位玩家向後輪替一人/);
  assert.equal(pages.filter(page => page.children[0].textContent === '出牌順序').length, 0);
  assert.match(pages[2].textContent, /跟色與放置/);
  assert.equal(nodes.bridgeIntroductionPrevious.disabled, true);
  for (let i = 0; i < 5; i++) {
    assert.equal(pages.filter(page => !page.hidden).length, 1); assert.equal(pages[i].hidden, false);
    assert.equal(nodes.bridgeIntroductionPage.textContent, `${i + 1} / 5`);
    if (i < 4) nodes.bridgeIntroductionNext.click();
  }
  assert.equal(nodes.bridgeIntroductionNext.disabled, true); nodes.bridgeIntroductionNext.click();
  assert.equal(nodes.bridgeIntroductionPage.textContent, '5 / 5');
  assert.match(pages[4].textContent, /操作方式.*勝負結算.*同輪達標的隊伍並列獲勝/);
  assert.equal(pages.filter(page => page.children[0].textContent === '勝負結算').length, 0);
  assert.equal(guideNodes(pages[4], 'svg').length, 1);
});

test('bridge introduction supports previous pages and arrow keys without changing game state', async t => {
  const nodes = mount(t);
  const { BridgeIntroductionView } = await import('../public/js/games/bridge/introduction-view.js');
  const state = { playerId: 'host', room: { code: 'PAGES', host: 'host', phase: 'playing', size: 6, goal: 4 } }, before = structuredClone(state);
  new BridgeIntroductionView().render(state); nodes.bridgeIntroduction.click();
  nodes.bridgeIntroductionDialog.emit('keydown', { key: 'ArrowRight', preventDefault() {} });
  assert.equal(nodes.bridgeIntroductionPage.textContent, '2 / 5');
  nodes.bridgeIntroductionPrevious.click(); assert.equal(nodes.bridgeIntroductionPage.textContent, '1 / 5');
  nodes.bridgeIntroductionDialog.emit('keydown', { key: 'ArrowLeft', preventDefault() {} });
  assert.equal(nodes.bridgeIntroductionPage.textContent, '1 / 5'); assert.deepEqual(state, before);
});

test('live bridge updates preserve the selected topic and reading position while switching pages resets scroll', async t => {
  const nodes = mount(t);
  const { BridgeIntroductionView } = await import('../public/js/games/bridge/introduction-view.js');
  const view = new BridgeIntroductionView(), state = { playerId: 'host', room: { code: 'PAGES', host: 'host', phase: 'playing', size: 6, goal: 4 } };
  view.render(state); nodes.bridgeIntroduction.click(); nodes.bridgeIntroductionNext.click();
  nodes.bridgeIntroductionContent.scrollTop = 80; view.render(state);
  assert.equal(nodes.bridgeIntroductionPage.textContent, '2 / 5'); assert.equal(nodes.bridgeIntroductionContent.scrollTop, 80);
  nodes.bridgeIntroductionNext.click(); assert.equal(nodes.bridgeIntroductionContent.scrollTop, 0);
  assert.equal(nodes.bridgeIntroductionPage.textContent, '3 / 5');
});

test('bridge introduction retains its page on reopen and resets when changing rooms or leaving', async t => {
  const nodes = mount(t);
  const { BridgeIntroductionView } = await import('../public/js/games/bridge/introduction-view.js');
  const view = new BridgeIntroductionView(), state = { playerId: 'host', room: { code: 'PAGES', host: 'host', phase: 'lobby', size: 6, goal: 4 } };
  view.render(state); nodes.bridgeIntroduction.click(); nodes.bridgeIntroductionNext.click(); nodes.bridgeCloseIntroduction.click();
  nodes.bridgeIntroduction.click(); assert.equal(nodes.bridgeIntroductionPage.textContent, '2 / 5');
  view.render({ ...state, room: { ...state.room, code: 'NEW' } });
  assert.equal(nodes.bridgeIntroductionDialog.open, false); assert.equal(nodes.bridgeIntroductionPage.textContent, '1 / 5');
  view.hide(); assert.equal(nodes.bridgeIntroductionPage.textContent, ''); assert.equal(nodes.bridgeIntroductionContent.children.length, 0);
});

test('bridge settings refresh the victory target while keeping the current topic selected', async t => {
  const nodes = mount(t);
  const { BridgeIntroductionView } = await import('../public/js/games/bridge/introduction-view.js');
  const view = new BridgeIntroductionView(), state = { playerId: 'host', room: { code: 'PAGES', host: 'host', phase: 'lobby', size: 6, goal: 4 } };
  view.render(state); nodes.bridgeIntroduction.click(); nodes.bridgeIntroductionNext.click();
  view.render({ ...state, room: { ...state.room, size: 5, goal: 3 } });
  assert.equal(nodes.bridgeIntroductionPage.textContent, '2 / 5');
  nodes.bridgeIntroductionPrevious.click();
  assert.match(nodes.bridgeIntroductionContent.children[0].textContent, /本局完成 3 條連線/);
});

test('team introduction shares pagination and provides six illustrated player topics without changing room state', async t => {
  const nodes = mount(t);
  const { TeamIntroductionView } = await import('../public/js/games/teambingo/introduction-view.js');
  const { GameIntroductionView } = await import('../public/js/views/game-introduction-view.js');
  const { BridgeIntroductionView } = await import('../public/js/games/bridge/introduction-view.js');
  const view = new TeamIntroductionView(), s = { playerId: 'host', room: { code: 'TEAM', host: 'host', phase: 'lobby', size: 6, goal: 1 } };
  const before = JSON.stringify(s);
  assert.ok(view instanceof GameIntroductionView); assert.ok(new BridgeIntroductionView() instanceof GameIntroductionView);
  view.render(s); nodes['next-introduction'].click();
  assert.equal(nodes['next-introductionDialog'].open, true);
  assert.equal(nodes['next-introductionPage'].textContent, '1 / 6');
  assert.equal(view.pages.length, 6);
  const walk = node => [node, ...node.children.flatMap(walk)];
  const pictures = walk(nodes['next-introductionContent']).filter(node => node.tagName === 'svg');
  assert.equal(view.pages.filter(page => page.children.some(node => node.tagName === 'figure')).length, 6);
  assert.ok(pictures.length >= 4);
  for (const svg of pictures) {
    assert.ok(svg.attributes.viewBox);
    if (svg.attributes['aria-hidden'] !== 'true') { assert.equal(svg.attributes.role, 'img'); assert.ok(svg.attributes['aria-label']); }
  }
  for (let i = 0; i < 5; i++) nodes['next-introductionNext'].click();
  assert.equal(nodes['next-introductionPage'].textContent, '6 / 6'); assert.equal(nodes['next-introductionNext'].disabled, true);
  assert.equal(view.pages.filter(page => !page.hidden).length, 1);
  nodes['next-introductionDialog'].emit('keydown', { key: 'ArrowLeft', preventDefault() {} });
  assert.equal(nodes['next-introductionPage'].textContent, '5 / 6');
  nodes['next-closeIntroduction'].click(); assert.equal(nodes['next-introductionDialog'].open, false);
  assert.equal(JSON.stringify(s), before);
});

test('team introduction is host-only during preparation and play and closes on role, room or phase changes', async t => {
  const nodes = mount(t);
  const { TeamIntroductionView } = await import('../public/js/games/teambingo/introduction-view.js');
  const view = new TeamIntroductionView(), s = { playerId: 'host', room: { code: 'TEAM', host: 'host', phase: 'lobby', size: 6, goal: 1 } };
  for (const phase of ['lobby', 'choosing-goal', 'playing']) {
    view.render({ ...s, connected: false, busy: true, room: { ...s.room, phase } });
    assert.equal(nodes['next-introduction'].hidden, false); nodes['next-introduction'].click();
    assert.equal(nodes['next-introductionDialog'].open, true);
  }
  view.render({ ...s, playerId: 'captain' }); nodes['next-introduction'].click();
  assert.equal(nodes['next-introduction'].hidden, true); assert.equal(nodes['next-introductionDialog'].open, false);
  view.render(s); nodes['next-introduction'].click(); nodes['next-introductionNext'].click();
  nodes['next-introductionContent'].scrollTop = 90; view.render(s);
  assert.equal(nodes['next-introductionPage'].textContent, '2 / 6'); assert.equal(nodes['next-introductionContent'].scrollTop, 90);
  view.render({ ...s, room: { ...s.room, code: 'OTHER' } });
  assert.equal(nodes['next-introductionDialog'].open, false); assert.equal(nodes['next-introductionPage'].textContent, '1 / 6');
  nodes['next-introduction'].click(); view.render({ ...s, room: { ...s.room, phase: 'finished' } });
  assert.equal(nodes['next-introductionDialog'].open, false); assert.equal(nodes['next-introduction'].hidden, true);
  view.hide(); assert.equal(nodes['next-introductionContent'].children.length, 0);
});

test('team guide explains its own victory, turn, card and clock rules without Bridge rules or default settings', async t => {
  mount(t);
  const { TeamIntroductionView } = await import('../public/js/games/teambingo/introduction-view.js');
  const view = new TeamIntroductionView(), s = { playerId: 'host', room: { code: 'RULES', host: 'host', phase: 'playing', size: 7, goal: 1 } };
  view.render(s);
  const openingRules = view.pages[0].children.find(node => node.tagName === 'ul');
  assert.equal(openingRules.children.length, 2);
  for (const item of openingRules.children) {
    assert.equal(item.children[0].tagName, 'h4');
    assert.equal(item.children[0].className, 'game-introduction-topic-title');
    assert.equal(item.children[1].tagName, 'p');
  }
  assert.match(openingRules.children[0].textContent, /^隱藏的勝利條件：/);
  assert.match(openingRules.children[1].textContent, /^連線勝利：/);
  assert.equal(openingRules.children[1].children[1].textContent, '率先完成 1 條連線即宣布獲勝，取得該線獎品，並結束該局遊戲。');
  assert.doesNotMatch(view.pages[0].textContent, /額外獎勵|禮物卡/);
  assert.equal(view.pages[0].children[0].textContent, '勝利條件');
  assert.equal(view.pages[1].children[0].children[0].textContent, '隱藏的勝利條件');
  for (const phrase of ['確認後不能更換', '不同隊伍可以選擇相同條件', '每完成一個隱藏條件，該隊會獲得一個獎勵。', '必須完成全部選定條件']) assert.ok(view.pages[1].textContent.includes(phrase), phrase);
  for (const phrase of ['秘密目標', '由隊長選擇', '只有隊長與房主', '全部選定條件都達成']) assert.ok(view.pages[0].textContent.includes(phrase), phrase);
  assert.doesNotMatch(view.pages[0].textContent, /所有隊伍共用一張盤面/);
  const text = view.pages.map(page => page.textContent).join('\n');
  for (const phrase of ['所有隊伍共用一張盤面', '數字或是手牌', '不會輪空', '首次佔領特殊格', '當次行動不能接著用卡', '開始作答前可以取消', '全部選定條件都達成', '只有隊長與房主', '暫停 30 秒', '不必等待其他隊伍完成同一輪', '如果你是隊長', '你和隊友共用同一份行動時間']) assert.ok(text.includes(phrase), phrase);
  assert.doesNotMatch(text, /回答問題，發動卡牌效果|跟色|只能丟棄|同輪達標|預設|6×6|2 隊|8 分鐘/);
  view.showPage(2); view.render({ ...s, room: { ...s.room, goal: 2 } });
  assert.equal(view.page, 2); assert.match(view.pages[2].textContent, /完成 2 條連線/);
});

test('team guide examples reuse real card artwork and board cells at the configured size without live game data', async t => {
  mount(t);
  const { TeamIntroductionView } = await import('../public/js/games/teambingo/introduction-view.js');
  const view = new TeamIntroductionView();
  const walk = node => [node, ...node.children.flatMap(walk)];
  const room = { code: 'EXAMPLES', host: 'host', phase: 'playing', size: 6, goal: 1,
    hostHiddenGoals: [{ selected: { name: 'PRIVATE GOAL' } }], cells: [{ number: 999, teamId: 'private' }] };
  const before = JSON.stringify(room);
  view.render({ playerId: 'host', room });
  const examples = walk(view.pages[2]).filter(node => node.className?.split(' ').includes('team-guide-board'));
  assert.equal(examples.length, 2);
  for (const board of examples) {
    assert.equal(board.dataset.size, 6); assert.equal(board.children.length, 36);
    assert.ok(board.children.every(cell => cell.disabled && !cell.onclick));
    assert.equal(board.children[0].attributes.title, '1');
    assert.equal(board.children[0].children[0].className, 'next-cell-number');
  }
  const firstCells = examples[0].children.slice(0, 6), blockedCells = examples[1].children.slice(0, 6);
  assert.ok(firstCells.every(cell => cell.dataset.team === 0));
  assert.ok(blockedCells.some(cell => cell.dataset.team === 1));
  const cardNodes = walk(view.pages[0]).filter(node => node.className?.includes('game-card-front'));
  assert.equal(cardNodes.length, 1); assert.match(cardNodes[0].textContent, /數學家.*5 個質數格/);
  assert.ok(walk(cardNodes[0]).some(node => node.attributes.class === 'card-abacus'));
  assert.ok(walk(view.pages[3]).some(node => node.attributes.class === 'card-pocket-watch'));
  const special = walk(view.pages[3]).find(node => node.classList.contains('is-special'));
  assert.ok(special); assert.ok(special.children.some(node => node.className === 'next-special-marker'));
  const normalExample = walk(view.pages[3]).find(node => node.className === 'team-guide-normal-example');
  assert.equal(normalExample.children[0].textContent, '一般格');
  const normalCell = normalExample.children[1].children[0];
  assert.equal(normalCell.attributes.title, special.attributes.title);
  assert.equal(normalCell.classList.contains('is-special'), false);
  assert.ok(!normalCell.children.some(node => node.className === 'next-special-marker'));
  assert.equal(normalCell.disabled, true);
  assert.doesNotMatch(view.pages.map(page => page.textContent).join(''), /PRIVATE GOAL|999/);
  assert.equal(JSON.stringify(room), before);
  view.showPage(1); view.render({ playerId: 'host', room: { ...room, size: 4 } });
  assert.equal(view.page, 1);
  assert.equal(walk(view.pages[2]).find(node => node.className?.split(' ').includes('team-guide-board')).children.length, 16);
  assert.match(view.pages[0].textContent, /3 個質數格/);
});

test('introduction can expand the public hidden-condition catalog without revealing selections or changing the game', async t => {
  mount(t);
  const { TeamIntroductionView } = await import('../public/js/games/teambingo/introduction-view.js');
  const view = new TeamIntroductionView();
  const s = { playerId: 'host', room: { code: 'CATALOG', host: 'host', phase: 'playing', size: 6, goal: 1,
    availableHiddenGoals: [{ id: 'mathematician', symbol: 'abacus', name: '數學家', effect: '同隊佔領至少5個質數格。' },
      { id: 'four-corners', symbol: 'flag', name: '四角佔領', effect: '同隊佔領盤面四個角落。' }],
    hostHiddenGoals: [{ selected: { name: 'PRIVATE SELECTED CONDITION' } }] } };
  const before = JSON.stringify(s); view.render(s); view.showPage(1);
  const header = view.pages[1].children[0], button = header.children[1], panel = view.pages[1].children.at(-1);
  assert.equal(header.className, 'game-introduction-heading');
  assert.equal(header.children[0].tagName, 'h3');
  assert.equal(header.children[0].textContent, '隱藏的勝利條件');
  assert.equal(button.textContent, '查看所有隱藏條件'); assert.equal(panel.hidden, true);
  button.click(); assert.equal(panel.hidden, false); assert.equal(button.attributes['aria-expanded'], 'true');
  assert.match(panel.textContent, /數學家/); assert.match(panel.textContent, /四角佔領/);
  assert.doesNotMatch(panel.textContent, /PRIVATE SELECTED CONDITION|進度：/);
  const cards = panel.children[1].children;
  assert.equal(cards.length, 2); assert.ok(cards.every(card => card.tagName === 'button' && card.attributes['aria-haspopup'] === 'dialog'));
  view.render(structuredClone(s)); assert.equal(header, view.pages[1].children[0]); assert.equal(panel.hidden, false);
  button.click(); assert.equal(panel.hidden, true); assert.equal(button.attributes['aria-expanded'], 'false');
  assert.equal(JSON.stringify(s), before);
  view.render({ ...s, room: { ...s.room, availableHiddenGoals: [] } });
  assert.equal(view.pages[1].children[0].children[1].disabled, true);
});

test('each introduction condition opens a read-only enlarged card and closes without dismissing the introduction', async t => {
  const nodes = mount(t);
  const { TeamIntroductionView } = await import('../public/js/games/teambingo/introduction-view.js');
  const view = new TeamIntroductionView();
  const s = { playerId: 'host', room: { code: 'ZOOM', host: 'host', phase: 'playing', size: 6, goal: 1,
    availableHiddenGoals: [{ id: 'mathematician', name: '數學家', symbol: 'abacus', effect: '同隊佔領至少5個質數格。' },
      { id: 'four-corners', name: '四角佔領', symbol: 'flag', effect: '同隊佔領盤面四個角落。' }] } };
  const before = JSON.stringify(s); view.render(s); nodes['next-introduction'].click(); view.showPage(1);
  const panel = view.pages[1].children.at(-1), catalog = panel.children[1];
  for (const [index, card] of catalog.children.entries()) {
    card.click(); assert.equal(view.cardDetail.dialog.open, true);
    assert.equal(view.cardDetail.title.textContent, s.room.availableHiddenGoals[index].name);
    assert.match(view.cardDetail.content.textContent, new RegExp(s.room.availableHiddenGoals[index].effect));
    assert.equal(view.cardDetail.content.children[0].tagName, 'div');
    view.cardDetail.closeButton.click(); assert.equal(view.cardDetail.dialog.open, false);
    assert.equal(nodes['next-introductionDialog'].open, true); assert.equal(view.page, 1);
  }
  const walk = node => [node, ...node.children.flatMap(walk)];
  const sample = walk(view.pages[1]).find(node => node.attributes['aria-label'] === '放大查看四角佔領');
  sample.click(); assert.equal(view.cardDetail.title.textContent, '四角佔領');
  view.cardDetail.dialog.emit('click', { clientX: 100, clientY: 200 }); assert.equal(view.cardDetail.dialog.open, true);
  view.cardDetail.dialog.emit('click', { clientX: 0, clientY: 0 }); assert.equal(view.cardDetail.dialog.open, false);
  sample.click(); view.cardDetail.dialog.emit('cancel', { preventDefault() {} }); assert.equal(view.cardDetail.dialog.open, false);
  sample.click(); view.render({ ...s, room: { ...s.room, phase: 'finished' } }); assert.equal(view.cardDetail.dialog.open, false);
  view.render(s); nodes['next-introduction'].click(); sample.click(); view.hide(); assert.equal(view.cardDetail.dialog.open, false);
  assert.equal(JSON.stringify(s), before);
});

test('team board and roster show three-second action countdowns and pause them during questions', async t => {
  const nodes = mount(t); let now = 0; t.mock.method(Date, 'now', () => now);
  const { BoardView } = await import('../public/js/games/teambingo/views/board-view.js');
  const { PlayersView } = await import('../public/js/games/teambingo/views/players-view.js');
  const board = new BoardView({}), players = new PlayersView({}); t.after(() => { board.hide(); players.hide(); });
  const s = boardClockState(); s.room.playersPerTeam = 2;
  s.room.teams.forEach(team => { team.timeRemainingMs = 0; team.clockRunning = false; team.overtimeMode = true; });
  Object.assign(s.room.teams[0], { overtimeRemainingMs: 3000, overtimeRunning: true });
  s.room.overtime = { playerId: s.room.turn, remainingMs: 3000, running: true };
  board.render(s); players.render(s);
  assert.match(nodes['next-phaseText'].textContent, /本次行動 00:03/);
  assert.equal(players.roster.clockLabels[0].label.textContent, '本次行動 3 秒');
  assert.equal(players.roster.clockLabels[1].label.textContent, '每人 3 秒');
  board.updateClock(1000); players.roster.updateClocks(1000);
  assert.match(nodes['next-phaseText'].textContent, /本次行動 00:02/);
  assert.equal(players.roster.clockLabels[0].label.textContent, '本次行動 2 秒');
  now = 1000; s.room.activeCard = { id: 'question' }; s.room.overtime = { ...s.room.overtime, remainingMs: 2000, running: false };
  Object.assign(s.room.teams[0], { overtimeRemainingMs: 2000, overtimeRunning: false });
  board.render(s); players.render(s); board.updateClock(999999); players.roster.updateClocks(999999);
  assert.match(nodes['next-phaseText'].textContent, /本次行動 00:02 · 暫停計時/);
  assert.equal(players.roster.clockLabels[0].label.textContent, '本次行動 2 秒');
  assert.doesNotMatch(players.roster.clockLabels[0].label.title, /跳過/);
});

test('team full-board draws display a draw result and keep team rewards visible', async t => {
  const nodes = mount(t);
  const { RewardsView } = await import('../public/js/games/teambingo/views/rewards-view.js');
  const view = new RewardsView();
  view.render({ room: { code: 'DRAW', phase: 'finished', endReason: 'board-full-draw', winners: [],
    teams: [{ id: 'team-1', name: '隊伍 1', rewards: [], bonusRewards: [{ item: '傳送石', quantity: 4 }] }] } });
  assert.equal(nodes['next-gameResultsTitle'].textContent, '遊戲結束・和局');
  assert.equal(nodes['next-gameResultsDialog'].open, true);
  assert.match(nodes['next-gameResultsList'].textContent, /傳送石.*4/);
  nodes['next-closeGameResults'].click(); assert.equal(nodes['next-gameResultsDialog'].open, false);
  assert.equal(nodes['next-viewGameResults'].hidden, false);
});

test('team introduction keeps the final six-page order and each page uses its matching illustration', async t => {
  mount(t);
  const { TeamIntroductionView } = await import('../public/js/games/teambingo/introduction-view.js');
  const view = new TeamIntroductionView();
  view.render({ playerId: 'host', room: { code: 'ORDER', host: 'host', phase: 'lobby', size: 6, goal: 1 } });
  const titles = view.pages.map(page => {
    const first = page.children[0]; return first.tagName === 'h3' ? first.textContent : first.children[0].textContent;
  });
  assert.deepEqual(titles, ['勝利條件', '隱藏的勝利條件', '共用盤面，搶佔你們的地盤', '佔領特殊格，為隊伍拿卡', '在有限的時間內達成勝利', '輪到你時，可以做什麼？']);
  const walk = node => [node, ...node.children.flatMap(walk)];
  assert.ok(walk(view.pages[0]).some(node => node.className === 'team-guide-victory-divider' && node.attributes['aria-hidden'] === 'true'));
  assert.ok(walk(view.pages[0]).some(node => node.className === 'team-guide-hidden-victory' && node.children[0].textContent === '隱藏勝利條件'));
  assert.ok(walk(view.pages[1]).filter(node => node.className?.includes('game-card-front')).length >= 2);
  assert.equal(walk(view.pages[2]).filter(node => node.className?.split(' ').includes('team-guide-board')).length, 2);
  assert.ok(walk(view.pages[3]).some(node => node.className === 'team-guide-normal-example'));
  assert.ok(walk(view.pages[3]).some(node => node.className === 'team-guide-special-example'));
  assert.ok(walk(view.pages[4]).some(node => node.className === 'team-guide-clock-example'));
  assert.ok(walk(view.pages[5]).some(node => node.tagName === 'svg' && node.attributes['aria-label']?.includes('隊內各自循環')));
  assert.match(view.pages[4].textContent, /每位隊員每次輪到時仍有 3 秒可以行動/);
  assert.match(view.pages[4].textContent, /若盤面已滿仍無人達標，則判定為和局/);
});

test('enlarged condition cards close when the host changes rooms or loses host access', async t => {
  const nodes = mount(t);
  const { TeamIntroductionView } = await import('../public/js/games/teambingo/introduction-view.js');
  const view = new TeamIntroductionView(), s = { playerId: 'host', room: { code: 'FIRST', host: 'host', phase: 'playing', size: 6, goal: 1 } };
  const walk = node => [node, ...node.children.flatMap(walk)];
  for (const next of [{ ...s, room: { ...s.room, code: 'SECOND' } }, { ...s, playerId: 'guest' }]) {
    view.render(s); nodes['next-introduction'].click();
    walk(view.pages[0]).find(node => node.attributes['aria-label'] === '放大查看數學家').click();
    assert.equal(view.cardDetail.dialog.open, true);
    view.render(next); assert.equal(view.cardDetail.dialog.open, false); assert.equal(nodes['next-introductionDialog'].open, false);
  }
});
