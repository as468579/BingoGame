import { $, element } from './dom.js';

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
        const button = element('button', `spell-card ${card.theme}`);
        button.type = 'button';
        button.setAttribute('aria-label', `使用${card.name}`);
        button.append(element('span', 'spell-type', card.type), element('span', 'spell-art', card.symbol),
          element('strong', 'spell-name', card.name), element('span', 'spell-description', card.description),
          element('span', 'spell-lock', '使用卡片 →'));
        button.disabled = busy || !connected || room.phase !== 'playing' || room.turn !== playerId || Boolean(room.pending) || Boolean(room.activeCard);
        button.onclick = () => this.actions.useCard(card.id);
        item.append(button);
      } else item.append(element('span', 'hand-card-symbol', '✦'), element('strong', '', card.name || `手牌 ${index + 1}`));
      return item;
    }));
  }
}
