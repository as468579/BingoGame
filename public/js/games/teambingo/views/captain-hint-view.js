import { $ } from '../dom.js';
import { bindDialogDismiss } from '../../../views/dialog.js';

export class CaptainHintView {
  constructor(actions) {
    this.dialog = $('hintDialog');
    this.button = $('captainHint');
    bindDialogDismiss({ dialog: this.dialog, canDismiss: () => false, dismissOnBackdrop: false });
    $('captainHint').onclick = () => { if (!$('captainHint').disabled) actions.hint(); };
  }

  render({ room, me, busy, connected }) {
    $('captainHint').hidden = !me?.spectating || room.phase !== 'playing';
    $('captainHint').textContent = `提示隊員（${room.teams.find(team => team.id === me?.teamId)?.hintUsesRemaining ?? 3} 次）`;
    $('captainHint').disabled = Boolean(busy || !connected || !room.canHint);
    const key = `${room.code}:${room.hint?.id || ''}`;
    if (!room.hint) { this.close(); this.key = null; return; }
    const deadline = Date.now() + room.hint.remainingMs;
    this.deadline = this.key === key ? Math.min(this.deadline, deadline) : deadline;
    this.key = key;
    $('hintTitle').textContent = `${room.hint.teamName} 隊長提示中`;
    if (this.deadline > Date.now() && !this.dialog.open) this.dialog.showModal();
    this.update();
    if (!this.timer && this.deadline > Date.now()) {
      this.timer = setInterval(() => this.update(), 100);
      this.timer.unref?.();
    }
  }

  update(now = Date.now()) {
    const remaining = Math.max(0, this.deadline - now);
    const seconds = String(Math.ceil(remaining / 1000));
    if ($('hintCount').textContent !== seconds) $('hintCount').textContent = seconds;
    $('hintProgress').setAttribute('stroke-dashoffset', String(314.159 * (1 - Math.min(1, remaining / 30000))));
    if (!remaining) this.close();
  }

  close() { clearInterval(this.timer); this.timer = null; if (this.dialog.open) this.dialog.close(); }
  hide() { this.close(); this.key = null; this.button.hidden = true; }
}
