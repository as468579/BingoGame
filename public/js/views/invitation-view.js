import { $ } from './dom.js';
import { copyRoomCode } from './copy-room-code.js';

export class InvitationView {
  constructor(address, notify, getRoom, lookup = $) {
    Object.assign(this, { address, notify, getRoom }); this.$ = lookup;
    this.$('publicAddress').value = address.value;
    this.$('saveAddress').onclick = () => this.save();
    this.$('copy').onclick = () => this.copyCode();
    this.$('copyInvite').onclick = () => this.copyInvitation();
  }

  render(room, playerId) {
    this.$('invitePanel').hidden = room.host !== playerId;
    this.$('inviteLink').value = this.address.invitation(room.code, location.origin);
    const origin = this.address.value || location.origin;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname);
    this.$('inviteHint').textContent = local
      ? '目前網址僅限本機使用。請在上方填入 http://你的Public-IP:3000 並儲存。'
      : '朋友開啟連結後只需填暱稱。請先完成路由器轉送與防火牆設定；儲存網址不會自動開通外網。';
  }

  save() {
    try {
      const saved = this.address.save(this.$('publicAddress').value);
      this.$('publicAddress').value = this.address.value;
      this.render(this.getRoom().room, this.getRoom().playerId);
      this.notify(saved ? '公開網址已儲存，可以複製邀請連結了。' : '已恢復使用目前網站網址。');
    } catch {
      this.notify('請填寫完整網址，例如 http://203.0.113.10:3000，不要包含房號或路徑。');
    }
  }

  async copyCode() {
    const code = this.getRoom().room.code;
    return copyRoomCode(code, this.$('roomCode'), this.notify);
  }

  async copyInvitation() {
    const { room, playerId } = this.getRoom();
    this.render(room, playerId);
    try {
      await navigator.clipboard.writeText(this.$('inviteLink').value);
      this.notify('加入連結已複製，傳給朋友就能加入！');
    } catch {
      if (this.$('invitePanel').hidden) { this.notify(`加入連結：${this.$('inviteLink').value}`); return; }
      this.$('inviteLink').focus();
      this.$('inviteLink').select();
      this.notify('請複製已選取的加入連結，再傳給朋友。');
    }
  }
}
