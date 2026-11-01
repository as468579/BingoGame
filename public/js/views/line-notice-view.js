import { $, element } from './dom.js';
import { rewardTotals } from './rewards-view.js';

export class LineNoticeView {
  show(players) {
    if (!players.length) return;
    const card = element('div', 'line-notice');
    for (const player of players) {
      card.append(element('p', '', `${player.name} 獲得了 ${rewardTotals(player.rewards).map(({ item, count }) => `${item} × ${count}`).join('、')}！`));
    }
    const close = element('button', 'line-notice-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '關閉獎品通知');
    const timer = setTimeout(() => card.remove(), 6500);
    close.onclick = () => { clearTimeout(timer); card.remove(); };
    card.append(close);
    $('lineNotices').append(card);
  }

  clear() { $('lineNotices').replaceChildren(); }
}
