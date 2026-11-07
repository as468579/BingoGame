import { $ } from '../dom.js';
import { bindDialogDismiss } from '../../../views/dialog.js';

export class CaptainHintView {
  constructor(actions) {
    this.dialog = $('hintDialog');
    this.button = $('captainHint');
    this.endButton = $('endHint');
    this.endButton.onclick = () => { if (!this.endButton.disabled && this.hintId) actions.endHint(this.hintId); };
    bindDialogDismiss({ dialog: this.dialog, canDismiss: () => false, dismissOnBackdrop: false });
    $('captainHint').onclick = () => { if (!$('captainHint').disabled) actions.hint(); };
  }

  render({ room, me, playerId, busy, connected }) {
    if (room.introduction?.open) { this.close(); this.key = null; this.button.disabled = true; return; }
    $('captainHint').hidden = !me?.spectating || room.phase !== 'playing';
    $('captainHint').textContent = `提示隊員（${room.teams.find(team => team.id === me?.teamId)?.hintUsesRemaining ?? 3} 次）`;
    $('captainHint').disabled = Boolean(busy || !connected || !room.canHint);
    const key = `${room.code}:${room.hint?.id || ''}`;
    if (!room.hint) { this.close(); this.key = null; return; }
    this.hintId = room.hint.id;
    const viewerId = me?.id ?? playerId;
    this.endButton.hidden = viewerId !== room.host && viewerId !== room.hint.captainId;
    this.endButton.disabled = Boolean(busy || !connected);
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

  close() { clearInterval(this.timer); this.timer = null; this.hintId = null; this.endButton.hidden = true; if (this.dialog.open) this.dialog.close(); }
  hide() { this.close(); this.key = null; this.button.hidden = true; }
}
