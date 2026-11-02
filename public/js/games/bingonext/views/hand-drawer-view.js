import { $ } from '../dom.js';
import { bindDialogDismiss } from '../../../views/dialog.js';

export class HandDrawerView {
  constructor() {
    this.dialog = $('handPanel');
    $('openHand').onclick = () => { if (!this.dialog.open) this.dialog.showModal(); };
    bindDialogDismiss({ dialog: this.dialog, closeButton: $('closeHand'), onDismiss: () => this.close() });
    this.dialog.addEventListener('close', () => $('openHand').setAttribute('aria-expanded', 'false'));
    $('openHand').addEventListener('click', () => $('openHand').setAttribute('aria-expanded', 'true'));

  }

  render(state) {
    if (state.room.phase === 'finished') { this.hide(); return; }
    const key = `${state.room.code}:${state.playerId}`;
    if (this.key !== key || state.room.activeCard || (state.room.pending && state.me.id === state.room.host)) this.close();
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
