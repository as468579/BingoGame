import { $ } from '../dom.js';

// A manual popover announces the round without blocking input or pausing clocks.
export class RoundEndView {
  constructor() { this.notice = $('roundEndNotice'); }
  render({ room, playerId }) {
    const key = `${room.code}:${playerId}:${room.boardVersion || 0}`;
    const event = room.roundEnd;
    if (key !== this.key || room.phase !== 'playing' || room.roundNumber < this.round) {
      this.close(); this.key = key; this.lastId = event?.id; this.round = room.roundNumber; return;
    }
    this.round = room.roundNumber;
    if (!event || event.id === this.lastId) return;
    this.lastId = event.id;
    this.close();
    $('roundEndTitle').textContent = `第 ${event.round} 回合結束`;
    $('roundEndMessage').textContent = `進入第 ${event.nextRound} 回合`;
    this.notice.showPopover(); this.visible = true;
    this.timer = setTimeout(() => this.close(), 3000);
    this.timer.unref?.();
  }
  close() { clearTimeout(this.timer); this.timer = null; if (this.visible) this.notice.hidePopover(); this.visible = false; }
  hide() { this.close(); this.key = null; this.lastId = null; this.round = null; }
}
