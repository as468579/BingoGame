import { $, element } from './dom.js';
import { CardPreview } from '../state/card-preview.js';

export class CardPreviewView {
  constructor(onCountChanged = () => {}, actions = null) {
    this.actions = actions;
    this.onCountChanged = onCountChanged;
    this.model = new CardPreview();
    this.dialog = $('cardPreviewDialog');
    $('closePreviewCard').onclick = () => this.dialog.close();
    this.dialog.addEventListener('close', () => { this.model.selected = null; });
  }

  renderCards() {
    this.onCountChanged(this.model.remaining.length);
    $('previewCardsEmpty').hidden = this.model.remaining.length > 0;
    $('previewCardList').replaceChildren(...this.model.remaining.map(card => {
      const item = element('li');
      const button = element('button', `spell-card ${card.theme}`);
      button.type = 'button';
      button.setAttribute('aria-label', `${this.actions ? '使用' : '查看'}${card.name}，${card.type}示範卡`);
      button.append(element('span', 'spell-type', card.type), element('span', 'spell-art', card.symbol),
        element('strong', 'spell-name', card.name), element('span', 'spell-description', card.description),
        element('span', 'spell-lock', this.actions ? '使用卡片 →' : '◇ 回答問題以解鎖'));
      if (this.actions) {
        const { room, busy, connected, playerId } = this.state;
        button.disabled = busy || !connected || Boolean(room.pending) || Boolean(room.activeCard) ||
          room.phase === 'finished' || (room.phase === 'playing' && room.turn !== playerId);
        button.onclick = () => this.actions.useCard(card.id);
      } else button.onclick = () => { this.model.open(card.id); this.renderDialog(); this.dialog.showModal(); };
      item.append(button);
      return item;
    }));
  }

  renderDialog() {
    const { selected: card, stage, choice, correct } = this.model;
    $('previewCardTitle').textContent = card.name;
    $('previewCardStep').textContent = stage === 'front' ? '01 · 查看卡牌' : stage === 'question' ? '02 · 回答問題' : '03 · 作答結果';
    const content = $('previewCardContent');
    const action = $('previewCardAction');
    content.replaceChildren();
    if (stage === 'front') {
      content.append(element('div', `spell-art preview-art ${card.theme}`, card.symbol),
        element('p', 'preview-description', card.description), element('p', 'preview-ability', card.effect || '卡牌能力待定'));
      action.textContent = '使用卡片';
      action.disabled = this.actions && (!this.state?.connected || this.state.busy ||
        Boolean(this.state.room.pending) || this.state.room.phase === 'finished' ||
        (this.state.room.phase === 'playing' && this.state.room.turn !== this.state.playerId));
      action.onclick = () => {
        if (this.actions) this.actions.useCard(card.id);
        else { this.model.flip(); this.renderDialog(); }
      };
    } else if (stage === 'question') {
      content.append(element('p', 'preview-question', card.question));
      const options = element('div', 'preview-options');
      card.options.forEach((label, index) => {
        const button = element('button', `preview-option${choice === index ? ' chosen' : ''}`, `${'ABCD'[index]}　${label}`);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(choice === index));
        button.onclick = () => { this.model.choose(index); this.renderDialog(); };
        options.append(button);
      });
      content.append(options, element('p', 'fine', '本次預覽：答對或答錯都會消耗這張示範卡。'));
      action.textContent = '確認答案'; action.disabled = choice === null;
      action.onclick = () => { if (this.model.submit()) { this.renderDialog(); this.renderCards(); } };
    } else {
      const result = element('div', `preview-result${correct ? ' success' : ''}`);
      result.setAttribute('role', 'status');
      result.append(element('span', 'result-symbol', correct ? '✓' : '×'),
        element('h3', '', correct ? '回答正確，能力已解鎖！' : '差一點！這次未能解鎖'),
        element('p', '', correct ? '卡牌能力待定，本次僅展示使用流程。' : `正確答案：${card.options[card.answer]}`),
        element('p', 'fine', '示範卡已使用，實際手牌與盤面不受影響。'));
      content.append(result);
      action.textContent = '回到手牌'; action.disabled = false;
      action.onclick = () => this.dialog.close();
    }
  }

  render(state) {
    this.state = state;
    const key = `${state.room.code}:${state.playerId}`;
    if (this.key !== key) { this.close(); this.model.reset(); this.key = key; this.renderCards(); }
    if (this.actions && state.room.availableDemoCards) {
      this.model.remaining = state.room.availableDemoCards;
      this.renderCards();
      if (this.model.selected && this.dialog.open) this.renderDialog();
    }
    // Give the host's number confirmation priority over a local preview.
    if (state.room.activeCard || (state.room.pending && state.me.id === state.room.host)) this.close();
  }

  close() { if (this.dialog.open) this.dialog.close(); }
}
