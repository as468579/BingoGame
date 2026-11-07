import { element } from '../../../views/dom.js';

// The sidebar and game guide share the same reward explanation and artwork.
export function winnerRewardInfo() {
  const section = element('section', 'winner-reward-info');
  section.append(element('h3', '', '獲勝獎勵'), element('p', '', '獲勝隊伍的隊長可於結算視窗擇一，每隊每局限選一次。'));
  const options = element('div', 'winner-reward-info-options');
  for (const item of ['龍王項鍊', '楓葉祝福20']) {
    const option = element('div', 'winner-reward-info-item');
    const image = element('img'); image.src = `/assets/items/${encodeURIComponent(item)}.png`; image.alt = ''; image.width = 32; image.height = 32;
    option.append(image, element('span', '', `${item} ×1`)); options.append(option);
  }
  section.append(options); return section;
}
