import { element } from '../../../views/dom.js';

// Read-only cell presentation shared by the live board and rule illustrations.
export function teamBoardCell(cell, index, size, teams, editing = false) {
  const node = element(editing ? 'input' : 'button', `cell${cell.isCovered ? ' marked' : ''}`);
  const owner = teams.find(t => t.id === cell.teamId);
  node.dataset.column = index % size % 5;
  node.setAttribute('title', `${cell.number || '未填寫'}`);
  if (cell.isSpecial) node.classList.add('is-special');
  node.setAttribute('aria-label', `號碼 ${cell.number}${cell.isSpecial ? '，特殊格，佔領可獲得一張卡' : ''}，${owner ? `${owner.name} 已佔領` : '未佔領'}`);
  if (!editing) {
    node.append(element('span', 'next-cell-number', cell.number));
    if (cell.isSpecial) {
      const marker = element('span', 'next-special-marker', '✦');
      marker.setAttribute('aria-hidden', 'true'); node.append(marker);
    }
    node.dataset.covered = String(cell.isCovered); node.setAttribute('aria-pressed', String(cell.isCovered));
    if (owner) { node.dataset.team = teams.findIndex(t => t.id === owner.id) % 6; node.append(element('span', 'next-cell-team', owner.name)); }
  }
  return node;
}
