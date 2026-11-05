import { $, element } from '../dom.js';
import { renderBoardLines } from '../../../views/board-lines.js';
import { LinePrizesView } from './line-prizes-view.js';
export class BoardView {
  constructor(actions) {
    this.actions = actions; this.prizes = new LinePrizesView();
    $('shuffle').onclick = actions.shuffle;
    $('saveBoard').onclick = actions.ready;
  }
  render(state) {
    const { room, me, busy, connected, draft } = state, host = room.host === me.id;
    const editing = host && room.phase === 'lobby';
    const team = room.teams.find(t => t.id === me.teamId);
    $('boardTitle').textContent = '全場共用盤面';
    $('lineCount').textContent = host ? '房主觀戰' : `${team?.name || '未分隊'}：${team?.lines || 0} / ${room.goal} 條線`;
    const turn = room.players.find(p => p.id === room.turn);
    $('phaseText').hidden = room.phase === 'finished';
    $('phaseText').textContent = room.hint ? '隊長提示中，遊戲時間暫停。' : room.activeCard ? '卡牌作答中，遊戲暫停。'
      : room.phase === 'choosing-goal' ? `等待 ${room.goalsRemaining ?? room.teams.length} 位隊長選擇隱藏勝利條件，行動與計時暫停。`
      : room.phase === 'lobby' ? host ? '房主可排列共用盤面；每隊至少 1 人且全員準備後即可開始，不需滿員。' : '房主設定共用盤面，選擇隊伍後請準備。'
        : room.turn === me.id ? '輪到你：圈選一個數字，或使用一張隊伍卡牌，本回合只能擇一。' : `等待 ${turn?.name || '玩家'} 行動${turn && !turn.online ? '（離線，等待重連）' : '…'}`;
    this.stopClock();
    const activeTeam = room.teams.find(candidate => candidate.id === turn?.teamId);
    if (room.phase === 'playing' && Number.isFinite(activeTeam?.timeRemainingMs)) {
      this.actionClock = { label: element('span', 'next-action-clock'), name: activeTeam.name, remainingMs: activeTeam.timeRemainingMs,
        running: Boolean(activeTeam.clockRunning), receivedAt: Date.now() };
      this.actionClock.label.setAttribute('role', 'timer');
      $('phaseText').append(this.actionClock.label);
      this.updateClock();
      this.clockTimer = setInterval(() => this.updateClock(), 250);
      this.clockTimer.unref?.();
    }
    $('board').setAttribute('aria-label', `${room.size} 乘 ${room.size} 共用賓果盤面`);
    $('board').dataset.size = room.size; $('board').dataset.phase = room.phase;
    const focused = document.activeElement?.dataset?.cell;
    const cells = editing ? draft.map((number, index) => ({ number, isCovered: false, isSpecial: Boolean(room.cells[index]?.isSpecial) })) : room.cells;
    $('board').replaceChildren(...cells.map((cell, index) => {
      const node = element(editing ? 'input' : 'button', `cell${cell.isCovered ? ' marked' : ''}`);
      const owner = room.teams.find(t => t.id === cell.teamId);
      node.dataset.column = index % room.size % 5;
      node.setAttribute('title', `${cell.number || '未填寫'}`);
      if (cell.isSpecial) node.classList.add('is-special');
      node.setAttribute('aria-label', `號碼 ${cell.number}${cell.isSpecial ? '，特殊格，佔領可獲得一張卡' : ''}，${owner ? `${owner.name} 已佔領` : '未佔領'}`);
      if (editing) {
        Object.assign(node, { type: 'number', min: '1', max: room.size ** 2, inputMode: 'numeric', value: cell.number || '', disabled: busy || !connected });
        node.dataset.cell = index;
        node.oninput = () => this.actions.editCell(index, node.value === '' ? 0 : Number(node.value));
      } else {
        node.append(element('span', 'next-cell-number', cell.number));
        if (cell.isSpecial) {
          const marker = element('span', 'next-special-marker', '✦');
          marker.setAttribute('aria-hidden', 'true'); node.append(marker);
        }
        node.dataset.covered = String(cell.isCovered); node.setAttribute('aria-pressed', String(cell.isCovered));
        if (owner) { node.dataset.team = room.teams.findIndex(t => t.id === owner.id) % 6; node.append(element('span', 'next-cell-team', owner.name)); }
        node.disabled = busy || !connected || Boolean(room.activeCard) || Boolean(room.hint) || Boolean(me.spectating) || room.phase !== 'playing' || room.turn !== me.id || cell.isCovered;
        node.onclick = () => this.actions.call(cell.number);
      }
      return node;
    }));
    $('boardLines').replaceChildren(...(editing ? [] : room.teams.flatMap((t, index) => {
      const lines = renderBoardLines(room.cells.map(c => ({ isCovered: c.isCovered && c.teamId === t.id })), room.size);
      for (const line of lines) line.setAttribute('data-team', index % 6);
      return lines;
    })));
    this.prizes.render(room.cells, room.size, room.phase, room.linePrizes, me.teamId, room.teams);
    $('editTools').hidden = !host || room.phase !== 'lobby';
    $('shuffle').hidden = !host || room.phase !== 'lobby'; $('shuffle').disabled = busy || !connected;
    $('saveBoard').hidden = !editing; $('saveBoard').disabled = busy || !connected;
    $('boardHint').textContent = '特殊格：首次佔領時，隊伍可獲得一張效果卡。';
    if (editing) { this.validate(state); if (focused !== undefined) $('board').querySelector(`[data-cell="${focused}"]`)?.focus(); }
  }
  validate({ room, draft }) {
    [...$('board').children].forEach((cell, i) => cell.classList.toggle('invalid', !Number.isInteger(draft[i]) || draft[i] < 1 || draft[i] > room.size ** 2 || draft.filter(n => n === draft[i]).length > 1));
  }

  updateClock(now = Date.now()) {
    const clock = this.actionClock;
    if (!clock) return;
    const seconds = Math.max(0, Math.ceil((clock.remainingMs - (clock.running ? Math.max(0, now - clock.receivedAt) : 0)) / 1000));
    clock.label.textContent = `${clock.name} 剩餘 ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}${clock.running ? '' : ' · 暫停計時'}`;
  }

  stopClock() { clearInterval(this.clockTimer); this.clockTimer = null; this.actionClock = null; }
  hide() { this.stopClock(); }
}
