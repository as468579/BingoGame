import { $ as lookup, element } from './dom.js';
import { cardFace } from './playing-card.js';

// Temporary presentation only: preserve authoritative card counts without exposing or using unfinished cards.
export class PendingHandView {
  constructor(find = lookup) { this.find = find; }

  render({ hand = [], room }) {
    const demos = room.availableDemoCards || [];
    const total = hand.length + demos.length;
    this.find('handCount').textContent = `${total} 張`;
    this.find('handEmpty').textContent = '待定';
    this.find('handEmpty').hidden = total > 0;
    this.find('previewCardsEmpty').hidden = true;
    for (const [id, cards] of [['handList', hand], ['previewCardList', demos]]) {
      this.find(id).replaceChildren(...cards.map(card => {
        const item = element('li', 'hand-card');
        item.dataset.cardId = card.id;
        item.append(cardFace({ className: 'spell-card pending-hand-card', name: '待定' }));
        return item;
      }));
    }
  }
}
