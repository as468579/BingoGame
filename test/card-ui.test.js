const { test } = require('node:test');
const assert = require('node:assert/strict');

// Minimal DOM boundary for view unit tests. Layout and pointer hit testing remain browser checks.
function mount(t) {
  class Node {
    constructor(tag = 'div') {
      this.tagName = tag; this.children = []; this.attributes = {}; this.listeners = {};
      this.dataset = {}; this.hidden = false; this.open = false; this.textContent = '';
      const classes = new Set();
      this.classList = { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) };
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
    'drawnCardDialog', 'drawnCardTitle', 'drawnCardContent', 'closeDrawnCard'
  ];
  const nodes = Object.fromEntries(ids.map(id => [id, new Node()]));
  const original = globalThis.document;
  globalThis.document = { getElementById: id => {
    assert.ok(nodes[id], `Unexpected DOM dependency: ${id}`);
    return nodes[id];
  }, createElement: tag => new Node(tag), body: new Node('body') };
  t.after(() => { if (original === undefined) delete globalThis.document; else globalThis.document = original; });
  return nodes;
}

function state(overrides = {}) {
  return { room: { code: 'ROOM01', host: 'host', pending: null }, playerId: 'host', me: { id: 'host' }, hand: [], ...overrides };
}

test('owner can cancel unanswered cards via close, backdrop or Escape without dismissing inside clicks', async t => {
  const nodes = mount(t);
  const { SharedCardView } = await import('../public/js/views/shared-card-view.js');
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
  const { DrawCardView } = await import('../public/js/views/draw-card-view.js');
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
  const { HandView } = await import('../public/js/views/hand-view.js');
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
  const { BoardView } = await import('../public/js/views/board-view.js');
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
  const { HostControlsView } = await import('../public/js/views/host-controls-view.js');
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
  const { LineNoticeView } = await import('../public/js/views/line-notice-view.js');
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
  const { LinePrizesView } = await import('../public/js/views/line-prizes-view.js');
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
  const { RewardsView, rewardTotals } = await import('../public/js/views/rewards-view.js');
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
  const { HandView } = await import('../public/js/views/hand-view.js');
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
  const { HandView } = await import('../public/js/views/hand-view.js');
  const { CardPreviewView } = await import('../public/js/views/card-preview-view.js');
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
  const { CardPreviewView } = await import('../public/js/views/card-preview-view.js');
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
  const { CardPreviewView } = await import('../public/js/views/card-preview-view.js');
  const preview = new CardPreviewView(); preview.render(state());
  nodes.previewCardList.children[0].children[0].click();
  preview.render(state({ room: { code: 'ROOM01', host: 'host', pending: { number: 1 } } }));
  assert.equal(nodes.cardPreviewDialog.open, false);
  assert.equal(preview.model.remaining.length, 3);
});

test('drawer opens and closes through its buttons, keeping accessibility state in sync', async t => {
  const nodes = mount(t);
  const { HandDrawerView } = await import('../public/js/views/hand-drawer-view.js');
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
  const { HandDrawerView } = await import('../public/js/views/hand-drawer-view.js');
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
  const { HandDrawerView } = await import('../public/js/views/hand-drawer-view.js');
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
  const { CardPreview } = await import('../public/js/state/card-preview.js');
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
  const { SharedCardView } = await import('../public/js/views/shared-card-view.js');
  const calls = [];
  const view = new SharedCardView({ answerCard: (...args) => calls.push(args), finishCard() {} });
  view.render(sharedState('spectator'));
  assert.equal(nodes.sharedCardDialog.open, true);
  assert.equal(nodes.sharedCardQuestion.textContent, '問題');
  assert.equal(nodes.sharedCardDescription.textContent, '卡牌說明');
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
  const { SharedCardView } = await import('../public/js/views/shared-card-view.js');
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
  const { CardPreviewView } = await import('../public/js/views/card-preview-view.js');
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
  const { CardPreviewView } = await import('../public/js/views/card-preview-view.js');
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
  const { SharedCardView } = await import('../public/js/views/shared-card-view.js');
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
  const { SharedCardView } = await import('../public/js/views/shared-card-view.js');
  const view = new SharedCardView({ answerCard() {}, judgeCard() {}, finishCard() {} });
  const playing = sharedState('owner', 'result'); playing.room.phase = 'playing';
  view.render(playing);
  assert.equal(nodes.finishSharedCard.textContent, '結束回合，換下一位');
  assert.match(nodes.sharedCardStatus.textContent, /換下一位/);
});

test('all players see the card effect and question through answering, host review, and results', async t => {
  const nodes = mount(t);
  const { SharedCardView } = await import('../public/js/views/shared-card-view.js');
  const view = new SharedCardView({ answerCard() {}, judgeCard() {}, finishCard() {} });
  for (const player of ['owner', 'host', 'spectator']) {
    for (const stage of ['question', 'review', 'result']) {
      view.render(sharedState(player, stage));
      assert.equal(nodes.sharedCardQuestion.textContent, '問題');
      assert.equal(nodes.sharedCardEffect.textContent, '卡牌效果：測試效果');
      assert.equal(nodes.sharedCardDescription.textContent, '卡牌說明');
    }
  }
  const pending = sharedState('spectator'); delete pending.room.activeCard.card.effect;
  view.render(pending);
  assert.equal(nodes.sharedCardEffect.textContent, '卡牌效果：能力待定');
});

test('verdict rerenders and transitions show only the current outcome without stale result text', async t => {
  const nodes = mount(t);
  const { SharedCardView } = await import('../public/js/views/shared-card-view.js');
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
