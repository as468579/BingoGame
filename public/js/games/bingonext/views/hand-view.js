import { $, element } from '../dom.js';
import { cardFace } from '../../../views/playing-card.js';

export class HandView {
  constructor(actions = null) { this.actions = actions; this.handCount = 0; this.previewCount = 0; }

  setPreviewCount(count) { this.previewCount = count; this.renderCount(); }

  renderCount() {
    const total = this.handCount + this.previewCount;
    $('handCount').textContent = `${total} 張`;
    $('handEmpty').hidden = total > 0;
  }

  render({ hand, room, playerId, busy, connected }) {
    this.handCount = hand.length;
    this.renderCount();
    $('handList').replaceChildren(...hand.map((card, index) => {
      const item = element('li', 'hand-card');
      item.dataset.cardId = card.id;
      if (this.actions && card.definitionId) {
        const button = cardFace({ tag: 'button', className: `spell-card ${card.theme}`, type: card.type, art: card.symbol, name: card.name, description: card.description, footer: '使用卡片 →' });
        button.type = 'button';
        button.setAttribute('aria-label', `使用${card.name}`);
        button.disabled = busy || !connected || room.phase !== 'playing' || room.turn !== playerId || Boolean(room.pending) || Boolean(room.activeCard);
        button.onclick = () => this.actions.useCard(card.id);
        item.append(button);
      } else item.append(element('span', 'hand-card-symbol', '✦'), element('strong', '', card.name || `手牌 ${index + 1}`));
      return item;
    }));
  }
}
