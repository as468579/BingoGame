import { $, element } from './dom.js';
import { lineMeter } from './line-meter.js';
import { renderBoardLines } from './board-lines.js';

function phaseText(room, me) {
  if (room.activeCard) return '卡牌作答中，遊戲暫停；使用卡牌取代本回合選號，結束後換下一位。';
  if (room.phase === 'lobby') return me.ready ? `✓ 你已準備完成，等待房主開始（${room.size} × ${room.size}）。`
    : `填入 1～${room.size ** 2}，不重複排列，完成後按下準備。`;
  if (room.phase === 'finished') return '本局已結束，好運屬於每個參與的人！';
  if (room.pending) {
    const player = room.players.find(candidate => candidate.id === room.pending.playerId);
    return `${player?.name || '玩家'} 選擇了 ${room.pending.number}，等待房主確認…`;
  }
  const turn = room.players.find(candidate => candidate.id === room.turn);
  const rejection = room.lastDecision && !room.lastDecision.approved ? `房主已拒絕號碼 ${room.lastDecision.number}，換下一位。` : '';
  return rejection + (turn?.id === me.id ? '輪到你了！點擊自己盤面上尚未選過的號碼。'
    : `等待 ${turn?.name || ''} 選號${turn && !turn.online ? '（目前離線，等待重連或由房主略過）' : '…'}`);
}

export class BoardView {
  constructor(actions) {
    this.actions = actions;
    $('shuffle').onclick = actions.shuffle;
    $('ready').onclick = actions.ready;
  }

  render(state) {
    const { room, me, target, busy, connected, draft } = state;
    const mine = target.id === me.id;
    const editing = mine && room.phase === 'lobby' && !me.ready;
    const size = room.size || 5;
    $('boardTitle').textContent = mine ? '我 的盤面' : `${target.name} 的盤面`;
    $('lineCount').replaceChildren(element('strong', 'line-total', target.lines),
      element('span', 'line-goal', `/ ${room.goal} 條線`), lineMeter(target.lines, room.goal));
    $('phaseText').textContent = phaseText(room, me);
    $('board').dataset.size = size;
    $('board').dataset.phase = room.phase;
    $('board').setAttribute('aria-label', `${size} 乘 ${size} 賓果盤面`);
    const focused = document.activeElement?.dataset?.cell;
    const marked = new Set(room.called);
    const cells = editing ? draft.map(number => ({ number, isCovered: false })) : target.cells;
    $('board').replaceChildren(...cells.map(({ number, isCovered }, index) => {
      const cell = element(editing ? 'input' : 'button', 'cell');
      cell.dataset.column = index % size % 5;
      cell.setAttribute('aria-label', `第 ${Math.floor(index / size) + 1} 列第 ${index % size + 1} 格，號碼 ${number}`);
      if (editing) {
        Object.assign(cell, { type: 'number', min: '1', max: size ** 2, inputMode: 'numeric', value: number || '', disabled: busy });
        cell.dataset.cell = index;
        cell.oninput = () => this.actions.editCell(index, cell.value === '' ? 0 : Number(cell.value));
      } else {
        cell.textContent = number;
        cell.dataset.covered = String(isCovered);
        cell.setAttribute('aria-pressed', String(isCovered));
        if (isCovered) cell.classList.add('marked');
        if (number === room.called.at(-1)) cell.classList.add('latest');
        cell.disabled = busy || !connected || Boolean(room.activeCard) || !mine || room.phase !== 'playing' || Boolean(room.pending) || room.turn !== me.id || marked.has(number) || isCovered;
        cell.onclick = () => this.actions.call(number);
      }
      return cell;
    }));
    $('boardLines').replaceChildren(...(editing ? [] : renderBoardLines(cells, size)));
    if (editing && focused !== undefined) $('board').querySelector(`[data-cell="${focused}"]`)?.focus();
    if (editing) this.validate(state);
    $('editTools').hidden = !mine || room.phase !== 'lobby';
    $('shuffle').hidden = me.ready;
    $('shuffle').disabled = busy;
    $('ready').textContent = me.ready ? '修改盤面 / 取消準備' : '確認盤面，準備好了 ✓';
    $('ready').disabled = busy || !connected;
    $('boardHint').textContent = !mine ? '正在查看朋友的盤面；點擊自己的名字即可返回。' : editing
      ? `每個格子都可以直接輸入數字，1～${size ** 2} 各使用一次。` : '盤面已保存；重新整理或短暫斷線後會自動恢復。';
  }

  validate({ room, draft }) {
    [...$('board').children].forEach((cell, index) => cell.classList.toggle('invalid',
      !Number.isInteger(draft[index]) || draft[index] < 1 || draft[index] > (room.size || 5) ** 2 ||
      draft.filter(number => number === draft[index]).length > 1));
  }
}
