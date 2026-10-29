import { $ } from './dom.js';

export class HostControlsView {
  constructor(actions) {
    $('boardSize').onchange = actions.settingsChanged;
    $('applySize').onclick = () => actions.applySize(Number($('boardSize').value));
    for (const kind of ['start', 'skip', 'reset']) $(kind).onclick = () => {
      if (kind === 'reset' && !confirm('要結束目前這一局並讓所有玩家重新準備嗎？')) return;
      actions.command(kind);
    };
    $('undo').onclick = actions.undo;
  }

  render({ room, me, busy, connected, settingsDirty }) {
    const size = room.size || 5;
    $('settingsPanel').hidden = me.id !== room.host || room.phase !== 'lobby';
    if (!settingsDirty) $('boardSize').value = size;
    $('boardSize').disabled = busy || !connected;
    $('applySize').disabled = busy || !connected;
    $('sizeHint').textContent = `目前 ${size} × ${size} · 數字 1～${size ** 2} · 先完成 ${room.goal} 條線獲勝`;
    $('hostTools').hidden = me.id !== room.host;
    const readyCount = room.players.filter(player => player.ready).length;
    $('start').hidden = room.phase !== 'lobby';
    $('start').disabled = busy || !connected || room.players.length < 2 || readyCount !== room.players.length;
    $('start').textContent = room.players.length < 2 ? '等待至少 2 位玩家加入'
      : readyCount < room.players.length ? `等待 ${room.players.length - readyCount} 位玩家準備` : '全員已準備，開始遊戲 →';
    const turn = room.players.find(player => player.id === room.turn);
    $('skip').hidden = room.phase !== 'playing' || Boolean(room.pending) || !turn || turn.online;
    $('skip').disabled = busy || !connected;
    $('reset').hidden = room.phase === 'lobby';
    $('reset').disabled = busy || !connected;
    $('undo').hidden = room.phase === 'lobby';
    $('undo').title = room.canUndo ? '撤回最近一次操作，可一路退回本局剛開始' : '已到本局剛開始';
    $('undo').disabled = busy || !connected || !room.canUndo;
  }
}
