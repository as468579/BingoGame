import { $, element } from '../../../views/dom.js';

export function rewardTotals(rewards = []) {
  const totals = new Map();
  for (const reward of rewards) totals.set(reward.item, (totals.get(reward.item) || 0) + 1);
  return [...totals].map(([item, count]) => ({ item, count }));
}

export class RewardsView {
  constructor() {
    $('closeGameResults').onclick = () => this.close();
    $('viewGameResults').onclick = () => {
      if (this.phase === 'finished' && !$('gameResultsDialog').open) $('gameResultsDialog').showModal();
    };
  }

  close() { if ($('gameResultsDialog').open) $('gameResultsDialog').close(); }
  hide() { this.close(); this.phase = null; this.code = null; }

  render({ room }) {
    const opening = room.phase === 'finished' && (this.phase !== 'finished' || this.code !== room.code);
    this.phase = room.phase;
    this.code = room.code;
    $('viewGameResults').hidden = room.phase !== 'finished';
    if (room.phase === 'finished') {
      $('gameResultsList').replaceChildren(...this.rows(room.players));
      if (opening && !$('gameResultsDialog').open) $('gameResultsDialog').showModal();
    } else {
      this.close();
      $('gameResultsList').replaceChildren();
    }
  }

  rows(players) {
    return players.map(player => {
      const row = element('li', 'reward-player');
      const heading = element('div', 'reward-player-heading');
      heading.append(element('strong', '', player.name), element('span', '', `${player.rewards?.length || 0} 份`));
      row.append(heading);
      const totals = rewardTotals(player.rewards);
      if (!totals.length) row.append(element('p', 'reward-none', '尚未獲得獎品'));
      for (const { item, count } of totals) {
        const entry = element('div', 'reward-item');
        const img = element('img'); img.src = `/assets/items/${encodeURIComponent(item)}.png`; img.alt = '';
        img.width = 24; img.height = 24;
        entry.append(img, element('span', '', item), element('strong', '', `× ${count}`));
        row.append(entry);
      }
      return row;
    });
  }
}
