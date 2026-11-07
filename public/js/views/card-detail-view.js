import { element } from './dom.js';
import { cardFace } from './playing-card.js';
import { bindDialogDismiss } from './dialog.js';

// Read-only card enlargement. It never selects or uses the displayed card.
export class CardDetailView {
  constructor(titleId) {
    this.dialog = element('dialog', 'game-dialog card-detail-dialog');
    this.dialog.setAttribute('aria-labelledby', titleId);
    this.closeButton = element('button', 'preview-close', '×');
    this.closeButton.type = 'button'; this.closeButton.setAttribute('aria-label', '關閉卡片詳情');
    this.title = element('h2'); this.title.id = titleId;
    this.content = element('div', 'card-detail-content');
    this.dialog.append(this.closeButton, this.title, this.content);
    bindDialogDismiss({ dialog: this.dialog, closeButton: this.closeButton });
    document.body.append(this.dialog);
  }

  show(card) {
    this.title.textContent = card.name;
    this.content.replaceChildren(cardFace({ className: 'card-detail-card', type: card.type || '隱藏勝利條件',
      art: card.symbol, name: card.name, description: card.effect }));
    this.dialog.scrollTop = 0;
    if (!this.dialog.open) this.dialog.showModal();
  }

  close() { if (this.dialog.open) this.dialog.close(); }
}
