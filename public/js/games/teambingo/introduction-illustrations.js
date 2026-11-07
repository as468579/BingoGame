import { renderCardArt } from '../../views/card-art.js';
import { element } from '../../views/dom.js';
import { picture } from '../../views/guide-illustrations.js';
import { cardFace } from '../../views/playing-card.js';
import { renderBoardLines } from '../../views/board-lines.js';
import { teamBoardCell } from './views/board-cell.js';

const exampleTeams = [{ id: 'example-1', name: '隊伍 1' }, { id: 'example-2', name: '隊伍 2' }];
const exampleCard = { type: '時間', art: 'pocket-watch', name: '加時', description: '隊伍行動時間增加 2 分鐘' };
function sampleCard(values) { return cardFace({ className: 'spell-card team-guide-card', ...values }); }
function conditionCard(values, inspect) {
  const card = sampleCard({ ...values, tag: inspect ? 'button' : 'div' });
  if (inspect) {
    card.setAttribute('aria-label', `放大查看${values.name}`); card.setAttribute('aria-haspopup', 'dialog');
    card.onclick = () => inspect({ name: values.name, symbol: values.art, effect: values.description });
  }
  return card;
}
function caption(root, value) { root.append(element('figcaption', '', value)); }
function miniBoard(room, blocked = false, specialOnly = false) {
  const size = room.size || 6, cells = Array.from({ length: size ** 2 }, (_, index) => ({ number: index + 1,
    isCovered: !specialOnly && index < size, isSpecial: specialOnly && index === 0,
    teamId: !specialOnly && index < size ? exampleTeams[blocked && index === Math.floor(size / 2) ? 1 : 0].id : null }));
  const wrapper = element('div', 'team-guide-board-wrap');
  const board = element('div', 'board team-guide-board'); board.dataset.size = size;
  board.setAttribute('aria-label', `${size} 乘 ${size} 示意盤面`);
  board.append(...cells.map((cell, index) => {
    const node = teamBoardCell(cell, index, size, exampleTeams);
    node.disabled = true; node.tabIndex = -1; return node;
  }));
  wrapper.append(board);
  if (!specialOnly) {
    const svg = picture(100, 100, blocked ? '其他隊伍佔領中間一格，無法連線' : '同隊佔滿第一橫線');
    svg.setAttribute('class', 'chalk-lines');
    const lines = renderBoardLines(cells.map(cell => ({ isCovered: cell.teamId === exampleTeams[0].id })), size);
    for (const line of lines) line.setAttribute('data-team', '0');
    svg.append(...lines); wrapper.append(svg);
  }
  return wrapper;
}
function sharedBoard(room) {
  const pair = element('div', 'game-guide-pair');
  for (const [label, blocked] of [['同隊連線', false], ['對手佔領，阻擋連線', true]]) {
    const example = element('div'); example.append(element('strong', 'team-guide-label', label), miniBoard(room, blocked)); pair.append(example);
  }
  return pair;
}
function strategies() {
  const row = element('div', 'team-guide-strategies');
  for (const [art, title, description] of [
    ['thinking', '溝通與推理', '合作完成隱藏條件'],
    ['pocket-watch', '特殊格與卡牌', '答對取得獎勵或優勢'],
    ['flag', '連線與阻擋', '完成本隊，阻止對手']
  ]) {
    const example = element('div', 'team-guide-strategy');
    const icon = element('span', 'team-guide-strategy-icon'); renderCardArt(icon, art);
    example.append(icon, element('strong', '', title), element('span', '', description)); row.append(example);
  }
  return row;
}
function cards(room) {
  const row = element('div', 'team-guide-example-row');
  const number = Math.min(12, (room.size || 6) ** 2);
  const normal = element('div', 'team-guide-normal-example');
  const normalCell = teamBoardCell({ number, isCovered: false, isSpecial: false }, 0, room.size || 6, exampleTeams);
  normalCell.disabled = true; normalCell.tabIndex = -1;
  const normalSquare = element('div', 'board team-guide-board team-guide-special-cell'); normalSquare.append(normalCell);
  normal.append(element('strong', 'team-guide-label', '一般格'), normalSquare);
  const special = element('div', 'team-guide-special-example');
  const cell = teamBoardCell({ number, isCovered: false, isSpecial: true }, 0, room.size || 6, exampleTeams);
  cell.disabled = true; cell.tabIndex = -1;
  const square = element('div', 'board team-guide-board team-guide-special-cell'); square.append(cell);
  special.append(element('strong', 'team-guide-label', '特殊格'), square);
  const hand = element('div'); hand.append(element('strong', 'team-guide-label', '隊伍手牌'), sampleCard({ ...exampleCard, footer: '使用卡片 →' }));
  row.append(normal, special, element('span', 'team-guide-arrow', '→'), hand); return row;
}
function captain(room, inspect) {
  const row = element('div', 'team-guide-example-row team-guide-victory-illustration');
  const goal = conditionCard({ type: '隱藏勝利條件', art: 'abacus', name: '數學家', description: `同隊佔領至少 ${(room.size || 6) - 1} 個質數格。1 不算質數。`, footer: '點擊放大' }, inspect);
  const hiddenVictory = element('div', 'team-guide-hidden-victory');
  hiddenVictory.append(element('strong', 'team-guide-label', '隱藏勝利條件'), goal);
  const lineVictory = element('div', 'team-guide-victory-board');
  lineVictory.append(element('strong', 'team-guide-label', '連線勝利'), miniBoard(room));
  const divider = element('span', 'team-guide-victory-divider'); divider.setAttribute('aria-hidden', 'true');
  row.append(hiddenVictory, divider, lineVictory); return row;
}
function hiddenConditions(room, inspect) {
  const row = element('div', 'team-guide-example-row');
  row.append(
    conditionCard({ type: '隱藏勝利條件', art: 'abacus', name: '數學家', description: `同隊佔領至少 ${(room.size || 6) - 1} 個質數格。1 不算質數。`, footer: '點擊放大' }, inspect),
    conditionCard({ type: '隱藏勝利條件', art: 'flag', name: '四角佔領', description: '同隊佔領盤面四個角落。', footer: '點擊放大' }, inspect)
  );
  return row;
}
function clock() {
  const row = element('div', 'team-guide-clock-example');
  const heading = element('div', 'team-guide-team-heading');
  heading.append(element('strong', '', '隊伍 1 · 0 / 1 條'), element('span', 'team-roster-clock', '剩餘 06:42'));
  row.append(heading, element('p', '', '輪到隊伍 1 選號／選卡 → 扣隊伍時間'),
    element('div', 'team-guide-answer-clock', '作答／判題／隊長提示 → 暫停隊伍計時'));
  return row;
}
export function teamIntroductionIllustration(index, room = {}, inspect) {
  const builder = [captain, hiddenConditions, sharedBoard, cards, clock, strategies][index];
  if (!builder) return null;
  const figure = element('figure', 'game-guide-figure team-guide-example');
  figure.append(builder(room, inspect)); caption(figure, '介面示例，非本局即時資料'); return figure;
}
