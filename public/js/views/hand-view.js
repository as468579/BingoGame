import { $, element } from './dom.js';

export class HandView {
  constructor() { this.handCount = 0; this.previewCount = 0; }

  setPreviewCount(count) { this.previewCount = count; this.renderCount(); }

  renderCount() {
    const total = this.handCount + this.previewCount;
    $('handCount').textContent = `${total} 張`;
    $('handEmpty').hidden = total > 0;
  }

  render({ hand }) {
    this.handCount = hand.length;
    this.renderCount();
    $('handList').replaceChildren(...hand.map((card, index) => {
      const item = element('li', 'hand-card');
      item.dataset.cardId = card.id;
      item.append(element('span', 'hand-card-symbol', '✦'), element('strong', '', card.name || `手牌 ${index + 1}`));
      return item;
    }));
  }
}
