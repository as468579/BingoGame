import { $, element } from './dom.js';

export class HandView {
  render({ hand }) {
    $('handCount').textContent = `${hand.length} 張`;
    $('handEmpty').hidden = hand.length > 0;
    $('handList').replaceChildren(...hand.map((card, index) => {
      const item = element('li', 'hand-card');
      item.dataset.cardId = card.id;
      item.append(element('span', 'hand-card-symbol', '✦'), element('strong', '', card.name || `手牌 ${index + 1}`));
      return item;
    }));
  }
}
