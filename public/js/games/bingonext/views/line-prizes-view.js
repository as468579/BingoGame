import { $, element } from '../dom.js';
import { boardLineDefinitions } from '../../../views/board-lines.js';

export const linePrizeItems = ['突襲券', '傳送石', '飄雪結晶', '護身符', '紅色藥水', '活力藥水'];

// Rewards are a projection of the viewed board, so undo and switching players cannot leave stale badges.
export function linePrizes(cells, size, prizes = [], playerId = null) {
  if (cells.length !== size * size) return [];
  const byId = new Map(prizes.map(prize => [prize.id, prize]));
  return boardLineDefinitions(size).map((line, order) => {
    const prize = byId.get(`${line.kind}-${line.index}`);
    const claimedBy = prize?.claimedBy || null;
    return {
      kind: line.kind, index: line.index, item: prize?.item || linePrizeItems[order % linePrizeItems.length],
      completed: line.indices.every(index => cells[index].isCovered === true), claimedBy,
      earned: Boolean(playerId && claimedBy === playerId), taken: Boolean(claimedBy && claimedBy !== playerId)
    };
  });
}

export class LinePrizesView {
  render(cells, size, phase, prizes = [], playerId = null, players = []) {
    const slots = linePrizes(cells, size, prizes, playerId);
    this.names = new Map(players.map(player => [player.id, player.name]));
    const layout = $('boardPrizeLayout');
    layout.dataset.size = size;
    layout.dataset.phase = phase;
    for (const [id, kind, index] of [['rowPrizes', 'row'], ['columnPrizes', 'column'],
      ['topLeftPrize', 'diagonal', 0], ['topRightPrize', 'diagonal', 1]]) {
      $(id).replaceChildren(...slots.filter(slot => slot.kind === kind && (index === undefined || slot.index === index))
        .map(slot => this.slot(slot)));
    }
  }

  slot({ kind, index, item, earned, taken, claimedBy }) {
    const direction = kind === 'row' ? `第 ${index + 1} 條橫線` : kind === 'column' ? `第 ${index + 1} 條直線`
      : index === 0 ? '左上至右下對角線' : '右上至左下對角線';
    const status = earned ? '已取得' : taken ? `已由 ${this.names.get(claimedBy) || '其他玩家'} 取得` : '尚未有人取得';
    const label = `${direction}：${item}（${status}）`;
    const wrapper = element('div', 'line-prize-slot');
    const icon = element('span', `line-prize${earned ? ' is-earned' : taken ? ' is-taken' : ''}`);
    icon.setAttribute('role', 'img'); icon.setAttribute('aria-label', label);
    icon.title = label;
    const img = element('img');
    img.src = `/assets/items/${item}.png`; img.alt = ''; img.width = 32; img.height = 32;
    icon.append(img);
    if (earned) icon.append(element('span', 'line-prize-check', '✓'));
    if (taken) icon.append(element('span', 'line-prize-taken', '×'));
    wrapper.append(icon);
    return wrapper;
  }
}
