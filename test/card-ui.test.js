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
    'sharedCardResult', 'answerSharedCard', 'finishSharedCard', 'judgeCardCorrect', 'judgeCardWrong',
    'sharedCardSymbol', 'sharedCardDescription', 'sharedCardEffect'
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
