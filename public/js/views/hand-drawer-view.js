import { $ } from './dom.js';

export class HandDrawerView {
  constructor() {
    this.dialog = $('handPanel');
    $('openHand').onclick = () => { if (!this.dialog.open) this.dialog.showModal(); };
    $('closeHand').onclick = () => this.close();
    this.dialog.addEventListener('close', () => $('openHand').setAttribute('aria-expanded', 'false'));
    $('openHand').addEventListener('click', () => $('openHand').setAttribute('aria-expanded', 'true'));
    this.dialog.addEventListener('click', event => {
      if (event.target !== this.dialog) return;
      const rect = this.dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.close();
    });
  }

  render(state) {
    const key = `${state.room.code}:${state.playerId}`;
    if (this.key !== key || (state.room.pending && state.me.id === state.room.host)) this.close();
    this.key = key;
    $('handDock').hidden = false;
    document.body.classList.add('has-hand-dock');
  }

  close() { if (this.dialog.open) this.dialog.close(); }

  hide() {
    this.close();
    $('handDock').hidden = true;
    document.body.classList.remove('has-hand-dock');
  }
}
