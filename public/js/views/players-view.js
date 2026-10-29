import { $, element } from './dom.js';
import { lineMeter } from './line-meter.js';

export class PlayersView {
  constructor(onSelect) { this.onSelect = onSelect; this.visibleTurnKey = null; }

  render({ room, playerId, target }) {
    const readyCount = room.players.filter(player => player.ready).length;
    $('playerCount').textContent = room.phase === 'lobby' ? `${readyCount} / ${room.players.length} 已準備` : `${room.players.length} / 16`;
    const ranked = room.players.map((player, index) => ({ ...player, joinOrder: index }))
      .sort((a, b) => b.lines - a.lines || a.joinOrder - b.joinOrder);
    const list = $('players');
    const previousScroll = list.scrollTop;
    list.replaceChildren(...ranked.map((player, rank) => this.playerCard(player, rank, room, playerId, target.id)));
    list.scrollTop = previousScroll;
    this.revealTurn(room, list);
  }

  playerCard(player, rank, room, playerId, selectedId) {
    const isTurn = room.phase === 'playing' && player.id === room.turn;
    const button = element('button', `player${player.id === selectedId ? ' active' : ''}${isTurn ? ' is-turn' : ''}`);
    const avatar = element('span', 'avatar', room.phase === 'lobby' ? player.name.slice(0, 1) : rank + 1);
    avatar.title = room.phase === 'lobby' ? player.name : `排名第 ${rank + 1}`;
    const label = element('span', 'player-name');
    const heading = element('span', 'player-heading');
    heading.append(element('strong', '', `${player.name}${player.id === playerId ? '（你）' : ''}`),
      element('span', 'player-role', player.id === room.host ? '房主' : '玩家'));
    if (isTurn) label.append(element('span', 'turn-badge', '▶ 選號中'));
    label.append(heading);
    if (room.phase === 'lobby') {
      label.append(element('span', `ready-badge ${player.ready ? 'is-ready' : 'not-ready'}`, player.ready ? '✓ 已準備' : '◷ 待準備'));
    } else {
      const score = element('span', 'player-score');
      score.append(element('strong', 'score-number', player.lines), element('span', 'score-unit', '條線'));
      label.append(score, lineMeter(player.lines, room.goal));
    }
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
