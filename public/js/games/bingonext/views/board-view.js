import { $, element } from '../dom.js';
import { renderBoardLines } from '../../../views/board-lines.js';
import { LinePrizesView } from './line-prizes-view.js';
export class BoardView {
  constructor(actions) {
    this.actions = actions; this.prizes = new LinePrizesView();
    $('shuffle').onclick = actions.shuffle;
  }
  render(state) {
    const { room, me, busy, connected, draft } = state, host = room.host === me.id;
    const editing = host && room.phase === 'lobby' && !me.ready;
    const team = room.teams.find(t => t.id === me.teamId);
    $('boardTitle').textContent = '全場共用盤面';
    $('lineCount').textContent = `${team?.name || '未分隊'}：${team?.lines || 0} / ${room.goal} 條線`;
    const turn = room.players.find(p => p.id === room.turn);
    $('phaseText').hidden = room.phase === 'finished';
    $('phaseText').textContent = room.activeCard ? '卡牌作答中，遊戲暫停。'
      : room.phase === 'lobby' ? host ? '房主可排列共用盤面；每隊至少 1 人且全員準備後即可開始，不需滿員。' : '房主設定共用盤面，選擇隊伍後請準備。'
        : room.turn === me.id ? '輪到你：選一個空格為自己的隊伍佔領並抽卡，或使用一張手牌。' : `等待 ${turn?.name || '玩家'} 選號${turn && !turn.online ? '（離線，等待重連）' : '…'}`;
    $('board').setAttribute('aria-label', `${room.size} 乘 ${room.size} 共用賓果盤面`);
    $('board').dataset.size = room.size; $('board').dataset.phase = room.phase;
    const focused = document.activeElement?.dataset?.cell;
    const cells = editing ? draft.map(number => ({ number, isCovered: false })) : room.cells;
    $('board').replaceChildren(...cells.map((cell, index) => {
      const node = element(editing ? 'input' : 'button', `cell${cell.isCovered ? ' marked' : ''}`);
      const owner = room.teams.find(t => t.id === cell.teamId);
      node.dataset.column = index % room.size % 5;
      node.setAttribute('aria-label', `號碼 ${cell.number}，${owner ? `${owner.name} 已佔領` : '未佔領'}`);
      if (editing) {
        Object.assign(node, { type: 'number', min: '1', max: room.size ** 2, inputMode: 'numeric', value: cell.number || '', disabled: busy || !connected });
        node.dataset.cell = index;
        node.oninput = () => this.actions.editCell(index, node.value === '' ? 0 : Number(node.value));
      } else {
        node.append(element('span', 'next-cell-number', cell.number));
        node.dataset.covered = String(cell.isCovered); node.setAttribute('aria-pressed', String(cell.isCovered));
        if (owner) { node.dataset.team = room.teams.findIndex(t => t.id === owner.id) % 6; node.append(element('span', 'next-cell-team', owner.name)); }
        node.disabled = busy || !connected || Boolean(room.activeCard) || room.phase !== 'playing' || room.turn !== me.id || cell.isCovered;
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
    $('editTools').hidden = !editing;
    $('shuffle').hidden = !editing; $('shuffle').disabled = busy || !connected;
    $('boardHint').textContent = '格子標示佔領隊伍；只有整條線都屬於同隊，該隊才能獲得獎品。';
    if (editing) { this.validate(state); if (focused !== undefined) $('board').querySelector(`[data-cell="${focused}"]`)?.focus(); }
  }
  validate({ room, draft }) {
    [...$('board').children].forEach((cell, i) => cell.classList.toggle('invalid', !Number.isInteger(draft[i]) || draft[i] < 1 || draft[i] > room.size ** 2 || draft.filter(n => n === draft[i]).length > 1));
  }
}
