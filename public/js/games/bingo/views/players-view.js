import { $, element } from '../../../views/dom.js';
import { lineMeter } from '../../../views/line-meter.js';

export class PlayersView {
  constructor(onSelect) { this.onSelect = onSelect; this.visibleTurnKey = null; }

  render({ room, playerId, target }) {
    const roster = room.players.filter(player => player.participating !== false);
    const readyCount = roster.filter(player => player.ready).length;
    $('playerCount').textContent = room.phase === 'lobby' ? `${readyCount} / ${roster.length} 已準備` : `${roster.length} 人參與`;
    $('presenceSummary').textContent = `在線 ${room.onlineCount} 人 ／共 ${room.players.length} 人`;
    const ranked = room.players.map((player, index) => ({ ...player, joinOrder: index }))
      .sort((a, b) => Number(b.participating !== false) - Number(a.participating !== false) || b.lines - a.lines || a.joinOrder - b.joinOrder);
    const list = $('players');
    const previousScroll = list.scrollTop;
    list.replaceChildren(...ranked.map((player, rank) => this.playerCard(player, rank, room, playerId, target.id)));
    list.scrollTop = previousScroll;
    this.revealTurn(room, list);
  }

  playerCard(player, rank, room, playerId, selectedId) {
    const isTurn = room.phase === 'playing' && player.id === room.turn;
    const inactive = player.participating === false;
    const button = element('button', `player${player.id === selectedId ? ' active' : ''}${isTurn ? ' is-turn' : ''}${inactive ? ' is-inactive' : ''}`);
    const avatar = element('span', 'avatar', inactive ? '—' : room.phase === 'lobby' ? player.name.slice(0, 1) : rank + 1);
    avatar.title = inactive ? '未列入本局' : room.phase === 'lobby' ? player.name : `排名第 ${rank + 1}`;
    const label = element('span', 'player-name');
    const heading = element('span', 'player-heading');
    heading.append(element('strong', '', `${player.name}${player.id === playerId ? '（你）' : ''}`),
      element('span', 'player-role', player.id === room.host ? '房主' : '玩家'));
    if (isTurn) label.append(element('span', 'turn-badge', '▶ 選號中'));
    label.append(heading);
    if (room.phase === 'lobby') {
      label.append(element('span', `ready-badge ${!inactive && player.ready ? 'is-ready' : 'not-ready'}`, inactive ? '暫不參與' : player.ready ? '✓ 已準備' : '◷ 待準備'));
      label.append(element('span', 'hand-count', `手牌 ${player.handCount} 張`));
    } else {
      if (inactive) label.append(element('span', 'spectator-badge', '本局觀戰'));
      const score = element('span', 'player-score');
      score.append(element('strong', 'score-number', player.lines), element('span', 'score-unit', '條線'),
        element('span', 'hand-count', `手牌 ${player.handCount} 張`));
      label.append(score, lineMeter(player.lines, room.goal));
    }
    if (!player.online) label.append(element('span', 'offline-badge', '已離線'));
    const dot = element('span', `dot${player.online ? ' online' : ''}`);
    dot.title = player.online ? '在線上' : '已離線';
    button.append(avatar, label, dot);
    button.onclick = () => this.onSelect(player.id);
    return button;
  }

  revealTurn(room, list) {
    const key = `${room.code}:${room.phase === 'playing' ? room.turn : ''}`;
    if (key === this.visibleTurnKey) return;
    this.visibleTurnKey = key;
    const current = list.querySelector('.is-turn');
    if (!current) return;
    const bounds = list.getBoundingClientRect();
    const playerBounds = current.getBoundingClientRect();
    const scale = bounds.height / list.clientHeight || 1;
    if (playerBounds.top < bounds.top || playerBounds.bottom > bounds.bottom) {
      list.scrollTop += (playerBounds.top - bounds.top - (bounds.height - playerBounds.height) / 2) / scale;
    }
  }
}
