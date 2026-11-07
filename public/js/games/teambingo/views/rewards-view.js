import { $, element } from '../dom.js';

import { rewardTotals } from '../../../views/reward-totals.js';
export { rewardTotals } from '../../../views/reward-totals.js';

export class RewardsView {
  constructor(actions = {}) {
    this.actions = actions;
    $('closeGameResults').onclick = () => this.close();
    $('viewGameResults').onclick = () => {
      if (this.phase === 'finished' && !$('gameResultsDialog').open) $('gameResultsDialog').showModal();
    };
  }

  close() { if ($('gameResultsDialog').open) $('gameResultsDialog').close(); }
  hide() { this.close(); this.phase = null; this.code = null; }

  render({ room, busy, connected }) {
    this.busy = busy; this.connected = connected;
    const opening = room.phase === 'finished' && (this.phase !== 'finished' || this.code !== room.code);
    this.phase = room.phase;
    this.code = room.code;
    $('viewGameResults').hidden = room.phase !== 'finished';
    if (room.phase === 'finished') {
      const winners = room.teams.filter(team => room.winners.includes(team.id));
      $('gameResultsTitle').textContent = room.endReason === 'board-full-draw' ? '遊戲結束・和局'
        : !winners.length ? '遊戲結束・無勝者' : winners.length > 1 ? '遊戲結束・平手' : `${winners[0].name}獲勝`;
      $('gameResultsList').replaceChildren(...this.rows(room.teams));
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
      const totals = rewardTotals([...(player.rewards || []), ...(player.bonusRewards || [])]);
      heading.append(element('strong', '', player.name), element('span', '', `${totals.reduce((sum, reward) => sum + reward.count, 0)} 份`));
      row.append(heading);
      if (player.winnerReward) {
        const reward = player.winnerReward;
        const choice = element('div', 'winner-reward-choice');
        choice.append(element('strong', '', reward.selected ? `獲勝獎勵：${reward.selected.item} ×1` : '獲勝獎勵：由隊長擇一'));
        if (reward.canChoose) for (const item of reward.options) {
          const button = element('button', 'primary', `${item} ×1`);
          button.disabled = Boolean(this.busy || this.connected === false);
          button.onclick = () => {
            if (button.disabled) return;
            for (const node of choice.children) if (node.tagName.toLowerCase() === 'button') node.disabled = true;
            this.actions.winnerReward?.(item, reward.sessionId);
          };
          choice.append(button);
        }
        row.append(choice);
      }
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
