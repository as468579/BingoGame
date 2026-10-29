import { $ } from './dom.js';

export class EntryView {
  constructor(session, onEnter) {
    this.query = new URLSearchParams(location.search);
    this.joinPage = /^\/join\/?$/.test(location.pathname);
    if (this.joinPage) {
      document.title = '加入朋友的房間 · Alberta Events';
      $('welcomeTitle').textContent = '你的座位，已經留好。';
      $('welcomeText').textContent = '輸入玩家 ID 與房號，就能和朋友一起玩。同一房間使用相同 ID，會恢復原本的玩家與盤面。';
      $('entryTitle').textContent = '加入朋友的房間';
      $('create').hidden = true;
      $('joinDivider').hidden = true;
      $('hostEntry').hidden = false;
      $('entryHint').textContent = '每位玩家請使用不同 ID；恢復原玩家時，請輸入完全相同的 ID（區分大小寫）。';
      document.body.classList.add('join-page');
    }
    $('code').value = this.query.get('room') || session.roomCode;
    $('name').value = session.name;
    $('create').onclick = () => onEnter('create');
    $('join').onclick = () => onEnter('join');
    for (const id of ['name', 'code']) $(id).addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) onEnter('join');
    });
  }

  get identity() { return { name: $('name').value, code: $('code').value.trim().toUpperCase() }; }
  get path() { return this.joinPage ? '/join' : '/'; }

  shouldRestore(code) {
    return Boolean(code && ((!this.joinPage && !this.query.get('room')) || this.query.get('room')?.toUpperCase() === code));
  }

  setBusy(busy) { document.querySelectorAll('.entry button').forEach(button => { button.disabled = busy; }); }
  show() { $('welcome').hidden = false; }
  hide() { $('welcome').hidden = true; }
  useRoom(code) { $('code').value = code; }
  switchPlayer(code) { this.useRoom(code); $('name').value = ''; $('name').focus(); }
}
