import { $ } from './dom.js';

export class ApprovalView {
  constructor(actions) {
    $('confirmCall').addEventListener('cancel', event => event.preventDefault());
    $('approveCall').onclick = () => actions.decide('approve');
    $('rejectCall').onclick = () => actions.decide('reject');
    $('undoPending').onclick = actions.undo;
  }

  render({ room, me, busy, connected }) {
    if (room.phase !== 'playing' || !room.pending || me.id !== room.host) return this.close();
    const player = room.players.find(candidate => candidate.id === room.pending.playerId);
    $('confirmDescription').textContent = `${player?.name || '玩家'} 選擇了以下號碼，是否確認？`;
    $('pendingNumber').textContent = room.pending.number;
    $('approveCall').disabled = busy || !connected;
    $('rejectCall').disabled = busy || !connected;
    $('undoPending').disabled = busy || !connected || !room.canUndo;
    if (!$('confirmCall').open) $('confirmCall').showModal();
  }

  close() { if ($('confirmCall').open) $('confirmCall').close(); }
}
