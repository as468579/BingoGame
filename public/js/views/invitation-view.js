import { $ } from './dom.js';

export class InvitationView {
  constructor(address, notify, getRoom) {
    Object.assign(this, { address, notify, getRoom });
    $('publicAddress').value = address.value;
    $('saveAddress').onclick = () => this.save();
    $('copy').onclick = () => this.copyCode();
    $('copyInvite').onclick = () => this.copyInvitation();
  }

  render(room, playerId) {
    $('invitePanel').hidden = room.host !== playerId;
    $('inviteLink').value = this.address.invitation(room.code, location.origin);
    const origin = this.address.value || location.origin;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname);
    $('inviteHint').textContent = local
      ? '目前網址僅限本機使用。請在上方填入 http://你的Public-IP:3000 並儲存。'
      : '朋友開啟連結後只需填暱稱。請先完成路由器轉送與防火牆設定；儲存網址不會自動開通外網。';
  }

  save() {
    try {
      const saved = this.address.save($('publicAddress').value);
      $('publicAddress').value = this.address.value;
      this.render(this.getRoom().room, this.getRoom().playerId);
      this.notify(saved ? '公開網址已儲存，可以複製邀請連結了。' : '已恢復使用目前網站網址。');
    } catch {
      this.notify('請填寫完整網址，例如 http://203.0.113.10:3000，不要包含房號或路徑。');
    }
  }

  async copyCode() {
    const code = this.getRoom().room.code;
    try {
      await navigator.clipboard.writeText(code);
      this.notify(`房號 ${code} 已複製。`);
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents($('roomCode'));
      selection.removeAllRanges();
      selection.addRange(range);
      this.notify(`請複製已選取的房號：${code}`);
    }
  }

  async copyInvitation() {
    const { room, playerId } = this.getRoom();
    this.render(room, playerId);
    try {
      await navigator.clipboard.writeText($('inviteLink').value);
      this.notify('加入連結已複製，傳給朋友就能加入！');
    } catch {
      if ($('invitePanel').hidden) { this.notify(`加入連結：${$('inviteLink').value}`); return; }
      $('inviteLink').focus();
      $('inviteLink').select();
      this.notify('請複製已選取的加入連結，再傳給朋友。');
    }
  }
}
