import { $, element } from '../dom.js';
import { cardFace, cardBack } from '../../../views/playing-card.js';

// The server grants special-cell cards; this view announces the result without changing the hand.
export class DrawCardView {
  constructor({ animate = true } = {}) {
    this.animate = animate;
    $('closeDrawnCard').onclick = () => this.close();
    if (!animate) $('gameResultsDialog').addEventListener('close', () => this.showResult());
  }

  render({ room, playerId }) {
    const key = room.code + ':' + playerId + ':' + (room.boardVersion || 0);
    const undone = room.called.length < (this.calledCount || 0);
    if (this.key !== key || (room.phase === 'lobby' && this.phase !== 'lobby') || undone) this.reset();
    this.key = key;
    this.phase = room.phase;
    this.calledCount = room.called.length;
    this.blocked = Boolean(room.activeCard) || Boolean(room.pending);
    if (room.lastDraw && room.lastDraw.id !== this.lastId) {
      this.reset();
      this.lastId = room.lastDraw.id;
      const drawn = room.lastDraw;
      this.drawing = this.animate && room.phase === 'playing' && !undone;
      if (this.drawing) {
        $('drawCardDisplay').classList.add('is-drawing');
        this.timer = setTimeout(() => this.reveal(drawn), 550);
      } else this.reveal(drawn, !undone);
    }
    this.showResult();
  }

  reset() {
    clearTimeout(this.timer);
    this.drawing = false;
    this.card = null;
    this.lastId = null;
    this.pendingResult = false;
    this.close();
    if (this.animate) {
      const back = cardBack('draw-card-back');
      $('drawCardDisplay').classList.remove('is-drawing');
      $('drawCardDisplay').replaceChildren(back);
    }
  }

  reveal(drawn, announce = true) {
    this.drawing = false;
    this.card = drawn;
    $('drawnCardTitle').textContent = drawn.teamName ? `${drawn.teamName} 獲得「${drawn.name}」` : drawn.name;
    const card = cardFace({ className: 'spell-card draw-card-face ' + drawn.theme, type: drawn.type, art: drawn.symbol });
    const effect = element('p', 'drawn-card-effect', `卡牌效果：${drawn.effect || '卡牌能力待定'}`);
    $('drawnCardContent').replaceChildren(card, effect);
    if (this.animate) $('drawCardDisplay').classList.remove('is-drawing');
    this.pendingResult = announce;
    this.showResult();
  }

  showResult() {
    if (this.pendingResult && !this.blocked && (this.animate || !$('gameResultsDialog').open) && !$('drawnCardDialog').open) {
      $('drawnCardDialog').showModal();
      this.pendingResult = false;
    }
  }

  close() { if ($('drawnCardDialog').open) $('drawnCardDialog').close(); }

  hide() { this.reset(); this.key = null; this.phase = null; this.calledCount = 0; }
}
