import { $, element } from '../dom.js';
import { cardFace, cardBack } from '../../../views/playing-card.js';

// Cards are dealt by the server as part of approving a number. This view only animates that result.
export class DrawCardView {
  constructor() {
    $('closeDrawnCard').onclick = () => this.close();
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
      this.drawing = room.phase === 'playing' && !undone;
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
    const back = cardBack('draw-card-back');
    $('drawCardDisplay').classList.remove('is-drawing');
    $('drawCardDisplay').replaceChildren(back);
  }

  reveal(drawn, announce = true) {
    this.drawing = false;
    this.card = drawn;
    $('drawnCardTitle').textContent = drawn.name;
    const card = cardFace({ className: 'spell-card draw-card-face ' + drawn.theme, type: drawn.type, art: drawn.symbol, description: drawn.description });
    const effect = element('p', 'drawn-card-effect', `卡牌效果：${drawn.effect || '卡牌能力待定'}`);
    $('drawnCardContent').replaceChildren(card, effect);
    $('drawCardDisplay').classList.remove('is-drawing');
    this.pendingResult = announce;
    this.showResult();
  }

  showResult() {
    if (this.pendingResult && !this.blocked && !$('drawnCardDialog').open) {
      $('drawnCardDialog').showModal();
      this.pendingResult = false;
    }
  }

  close() { if ($('drawnCardDialog').open) $('drawnCardDialog').close(); }

  hide() { this.reset(); this.key = null; this.phase = null; this.calledCount = 0; }
}
