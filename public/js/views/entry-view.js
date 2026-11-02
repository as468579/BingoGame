import { $ } from './dom.js';

export class EntryView {
  constructor(session, onEnter) {
    this.query = new URLSearchParams(location.search);
    this.joinPage = /^\/(?:join|bridge-bingo)\/?$/.test(location.pathname);
    $('gameChoice').hidden = this.joinPage;
    if (this.joinPage) {
      document.title = '加入朋友的房間 · Alberta Events';
      $('create').hidden = true;
      $('joinDivider').hidden = true;
      $('hostEntry').hidden = false;
      document.body.classList.add('join-page');
    }
    $('code').value = this.query.get('room') || (this.joinPage ? session.roomCode : '');
    $('name').value = session.name;
    $('create').onclick = () => onEnter('create');
    $('join').onclick = () => onEnter('join');
    for (const id of ['name', 'code']) $(id).addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) onEnter('join');
    });
  }

  get identity() { return { name: $('name').value, code: $('code').value.trim().toUpperCase(), gameType: $('gameType').value }; }
  get path() { return this.joinPage ? '/join' : '/'; }

  shouldRestore(code) {
    return Boolean(code && this.query.get('room')?.toUpperCase() === code.toUpperCase());
  }

  setBusy(busy) { document.querySelectorAll('.entry button').forEach(button => { button.disabled = busy; }); }
  show() {
    $('welcome').hidden = false;
    document.title = this.joinPage ? '加入朋友的房間 · Alberta Events' : 'Alberta Events · 多人賓果';
  }
  hide() { $('welcome').hidden = true; }
  useRoom(code) { $('code').value = code; }
  switchPlayer(code) { this.useRoom(code); $('name').value = ''; $('name').focus(); }
}
