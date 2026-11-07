import { add, picture, text, arrow } from '../../views/guide-illustrations.js';
import { element } from '../../views/dom.js';

const ink = { red: '#c94a3d', yellow: '#a87913', blue: '#296c91' };
function card(root, x, y, number, color, width = 88, height = 124) {
  add(root, 'rect', { x, y, width, height, rx: 9, fill: '#fff9e9', stroke: '#9c855c', 'stroke-width': 2 });
  add(root, 'rect', { x: x + 5, y: y + 5, width: width - 10, height: height - 10, rx: 6, fill: 'none', stroke: '#ded0aa' });
  add(root, 'circle', { cx: x + width / 2, cy: y + height * .45, r: width * .31, fill: ink[color], opacity: .08 });
  text(root, x + width / 2, y + height * .58, number, 44, ink[color]);
  text(root, x + width / 2, y + height - 16, { red: '紅色', yellow: '黃色', blue: '藍色' }[color], 17, ink[color]);
}
function board(root, x, y, size = 144, marked = [], blocked = false, numbers) {
  const step = size / 3;
  add(root, 'rect', { x, y, width: size, height: size, rx: 4, fill: '#29493d', stroke: '#a18b62', 'stroke-width': 3 });
  for (let i = 1; i < 3; i++) add(root, 'path', { d: `M${x + i * step} ${y}v${size}M${x} ${y + i * step}h${size}`, fill: 'none', stroke: '#81967b', opacity: .65 });
  for (let i = 0; i < 9; i++) {
    const cx = x + (i % 3 + .5) * step, cy = y + (Math.floor(i / 3) + .5) * step;
    if (blocked && i === 6) {
      text(root, cx - 13, cy - 8, '7', 12, '#d9ddc1'); text(root, cx + 3, cy + 11, '紅4', 19, '#f4b3a3');
    } else text(root, cx, cy + 7, numbers?.[i] ?? i + 1, 22, '#f7f0d2');
    if (marked.includes(i)) add(root, 'ellipse', { cx, cy, rx: step * .38, ry: step * .36, fill: 'none', stroke: '#f07762', 'stroke-width': 3, transform: `rotate(-9 ${cx} ${cy})` });
  }
}
function lines() {
  const svg = picture(720, 228, '連線示意：完整橫線、直線及主要對角線均算連線。圖中使用3乘3示意盤面。');
  const examples = [['橫線', [0, 1, 2]], ['直線', [0, 3, 6]], ['主要對角線', [0, 4, 8]]];
  examples.forEach(([name, cells], i) => {
    const x = 48 + i * 240;
    board(svg, x, 48, 144, cells); text(svg, x + 72, 27, name, 20);
    const start = cells[0], end = cells[2];
    add(svg, 'path', { d: `M${x + (start % 3 + .5) * 48} ${48 + (Math.floor(start / 3) + .5) * 48}L${x + (end % 3 + .5) * 48} ${48 + (Math.floor(end / 3) + .5) * 48}`, stroke: '#f07762', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: .9 });
  });
  return svg;
}
function hands() {
  const svg = picture(720, 206, '數字卡有紅、黃、藍三色；手牌僅自己可見。示例牌為紅3、黃7、藍8。');
  [['red', 3], ['yellow', 7], ['blue', 8]].forEach(([color, number], i) => card(svg, 118 + 200 * i, 22, number, color));
  text(svg, 360, 184, '只看自己的手牌，與隊友討論策略', 20); return svg;
}
function teamBoards() {
  const svg = picture(720, 280, '隊伍A的成員共用A盤面，隊伍B的成員共用B盤面。各隊盤面獨立，排列與佔領進度互不影響。');
  [['A', 180, '#4b776c', [0, 1], undefined], ['B', 540, '#547b9a', [6], [9, 8, 7, 6, 5, 4, 3, 2, 1]]].forEach(([name, cx, color, marked, numbers]) => {
    text(svg, cx, 28, `隊伍${name}的盤面`, 22, color);
    board(svg, cx - 72, 45, 144, marked, false, numbers);
    for (const [i, offset] of [[1, -40], [2, 40]]) {
      const px = cx + offset;
      add(svg, 'path', { d: `M${px} 207L${cx} 192m-7 1 7-1-2 7`, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round' });
      add(svg, 'circle', { cx: px, cy: 229, r: 18, fill: '#fff9e9', stroke: color, 'stroke-width': 2 });
      text(svg, px, 235, `${name}${i}`, 16, color);
    }
    text(svg, cx, 271, '同隊成員共用', 18, color);
  });
  add(svg, 'rect', { x: 303, y: 105, width: 114, height: 40, rx: 20, fill: '#eee2c6' });
  text(svg, 360, 132, '各隊獨立', 20);
  return svg;
}
function placement(missing) {
  const svg = picture(340, 246, missing ? '沒有指定的黃色：可以打出藍8，放在任意空格，例如2號格。' : '手中有指定的黃色：打出黃7，必須放在7號格。');
  text(svg, 170, 28, missing ? '沒有指定顏色' : '手中有指定顏色', 20);
  text(svg, 170, 54, '本輪指定：黃色', 17, ink.yellow);
  card(svg, 22, 78, missing ? 8 : 7, missing ? 'blue' : 'yellow');
  arrow(svg, 127, 138, 36); board(svg, 187, 88, 126, [missing ? 1 : 6]);
  text(svg, 170, 232, missing ? '可放在任意空格' : '放在對應數字7', 18); return svg;
}
function discard() {
  const svg = picture(720, 456, '必須跟黃色時，黃7的對應7號格已被紅4佔領，因此只能丟棄黃7，不能改放其他格。遊戲訣竅：後續玩家若缺少黃色，可將藍7放在其他空格。首位玩家尚無指定顏色，仍須依對應數字放置或棄牌。');
  text(svg, 360, 28, '必須跟黃色，但7號格已被佔領', 21);
  card(svg, 42, 62, 7, 'yellow'); arrow(svg, 151, 126, 50);
  board(svg, 238, 60, 138, [6], true); arrow(svg, 414, 126, 50);
  add(svg, 'rect', { x: 507, y: 72, width: 164, height: 112, rx: 10, fill: '#e8d7bc', stroke: '#b59975', 'stroke-width': 2, 'stroke-dasharray': '7 5' });
  add(svg, 'path', { d: 'M568 94l42 42m0-42-42 42', stroke: ink.red, 'stroke-width': 5, 'stroke-linecap': 'round' });
  text(svg, 589, 165, '只能丟棄', 21, ink.red);
  add(svg, 'path', { d: 'M24 226h672', stroke: '#d9c9a6', 'stroke-width': 1 });
  text(svg, 360, 258, '遊戲訣竅：利用缺色救回被擋住的手牌', 21);
  card(svg, 42, 292, 7, 'blue'); arrow(svg, 151, 356, 50);
  board(svg, 238, 290, 138, [6], true); arrow(svg, 414, 356, 50);
  board(svg, 520, 290, 138, [1], true);
  text(svg, 589, 449, '可改放任意空格', 20, ink.blue); return svg;
}
function round() {
  const svg = picture(720, 210, '同輪結算：A隊全員出完，再由B隊全員出牌。所有隊伍完成該輪後才結算，同輪達標者並列獲勝。');
  text(svg, 360, 29, '全部隊伍完成同一輪，才一起結算', 21);
  [['A隊', 120, '#4b776c'], ['B隊', 366, '#547b9a']].forEach(([name, x, color]) => {
    for (let i = 0; i < 2; i++) {
      const cx = x - 32 + i * 64;
      add(svg, 'circle', { cx, cy: 87, r: 17, fill: color, opacity: .85 });
      add(svg, 'path', { d: `M${cx - 23} 130v-7a23 23 0 0 1 46 0v7`, fill: 'none', stroke: color, 'stroke-width': 5, 'stroke-linecap': 'round' });
    }
    text(svg, x, 163, `${name}全員出完`, 20, color);
  });
  arrow(svg, 215, 106, 42); arrow(svg, 464, 106, 42);
  add(svg, 'circle', { cx: 602, cy: 104, r: 44, fill: '#f2e2b8', stroke: '#b29660', 'stroke-width': 2 });
  text(svg, 602, 112, '結算', 23); text(svg, 360, 197, '同輪達標 → 並列獲勝', 20); return svg;
}

export function bridgeIntroductionIllustration(index) {
  const builders = { 0: lines, 1: hands, 3: discard, 5: round, settlement: round };
  if (index !== 2 && !builders[index]) return null;
  const figure = element('figure', 'game-guide-figure');
  if (index === 2) {
    const pair = element('div', 'game-guide-pair'); pair.append(placement(false), placement(true)); figure.append(pair);
  } else {
    if (index === 1) figure.append(teamBoards());
    figure.append(builders[index]());
  }
  if (index === 0) figure.append(element('figcaption', '', '連線方式示意'));
  return figure;
}
