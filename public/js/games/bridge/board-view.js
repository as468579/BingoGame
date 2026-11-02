import { $, element } from '../../views/dom.js';
import { renderBoardLines } from '../../views/board-lines.js';
import { BridgeCardChoiceView } from './card-choice-view.js';
import { cardFace, cardBack } from '../../views/playing-card.js';

export const colorNames = { red: '紅色', yellow: '黃色', blue: '藍色' };

export class BridgeBoardView {
  constructor(actions) {
    this.actions = actions; this.selected = null;
    this.choice = new BridgeCardChoiceView(() => ({ state: this.state, team: this.team }), (number, discard) => {
      if (discard) return this.actions.bridge('bridgePlay', { cardNumber: number, discard: true, round: this.state.room.bridge.round });
      this.selected = number;
      this.render(this.state, this.team);
    });
  }

  render(state, team) {
    this.state = state; this.team = team;
    const { room, me, playerId, busy, connected } = state;
    const mine = team.id === me.teamId;
    const canPlay = room.phase === 'playing' && mine && team.turn === playerId && !busy && connected;
    const hand = me.hand || [], moves = room.bridge.legalMoves || [];
    if (this.key !== `${room.code}:${room.boardVersion}` || !canPlay || !hand.some(card => card.number === this.selected)) this.selected = null;
    this.key = `${room.code}:${room.boardVersion}`;
    const selected = hand.find(card => card.number === this.selected);
    const missingSuit = Boolean(team.leadColor && !hand.some(card => card.color === team.leadColor));
    const targets = selected ? moves.find(move => move.cardNumber === selected.number)?.targets || [] : [];
    $('bridgeBoard').dataset.size = room.size;
    $('bridgeBoard').setAttribute('aria-label', `${team.name} ${room.size} 乘 ${room.size} 盤面`);
    $('bridgeBoard').replaceChildren(...team.cells.map(cell => {
      const button = element('button', `cell${cell.card ? ' marked' : ''}${targets.includes(cell.number) ? ' bridge-target' : ''}`);
      button.append(element('span', 'bridge-cell-base', cell.number));
      if (cell.card) button.append(element('span', `bridge-placed-card ${cell.card.color}`, `${colorNames[cell.card.color][0]} ${cell.card.number}`));
      button.setAttribute('aria-label', `格號 ${cell.number}${cell.card ? `，${colorNames[cell.card.color]} ${cell.card.number} 已佔領` : '，空格'}`);
      button.disabled = !canPlay || !targets.includes(cell.number);
      button.onclick = () => this.actions.bridge('bridgePlay', { cardNumber: this.selected, targetNumber: cell.number, round: room.bridge.round });
      return button;
    }));
    $('bridgeLines').replaceChildren(...renderBoardLines(team.cells.map(cell => ({ isCovered: Boolean(cell.card) })), room.size));
    $('bridgeMoveHint').textContent = selected ? `${colorNames[selected.color]} ${selected.number}：${missingSuit ? '手中缺少指定顏色，可自由放置' : '須放在相同數字格'}，請點亮起的空格。`
      : room.phase === 'lobby' ? '開始時所有隊伍共用相同盤面與配色，獨立隨機發牌。'
        : !mine ? '正在查看其他隊伍，點選自己的隊伍即可返回出牌。' : '點選手牌查看放置或棄牌說明；標示「只能丟棄」的卡片，確認後會結束本次出牌。';
    $('bridgeHandCount').textContent = `${hand.length} 張 · 僅自己可見`;
    $('bridgeHand').replaceChildren(...[...hand].sort((a, b) => a.number - b.number).map(card => {
      const move = moves.find(move => move.cardNumber === card.number), legal = move?.targets || [];
      const button = cardFace({ tag: 'button', className: `bridge-number-card ${card.color}${card.number === this.selected ? ' selected' : ''}${!canPlay || (!legal.length && !move?.canDiscard) ? ' is-unplayable' : ''}`, type: colorNames[card.color], art: card.number });
      if (move?.canDiscard) button.append(element('span', 'bridge-card-rule', '只能丟棄'));
      button.setAttribute('aria-label', `${colorNames[card.color]} ${card.number}${move?.canDiscard ? '，只能丟棄' : missingSuit ? '，缺色可自由放置' : ''}${legal.length ? '，可出牌' : move?.canDiscard ? '' : '，目前不可出牌'}`);
      button.setAttribute('aria-pressed', String(card.number === this.selected));
      button.onclick = () => {
        this.selected = null;
        this.render(this.state, this.team);
        this.choice.open(card.number);
      };
      return button;
    }));
    if (room.phase === 'lobby' && !hand.length) $('bridgeHand').append(cardBack('bridge-number-card'));
    $('bridgeHandEmpty').textContent = room.phase === 'lobby' ? '開始後只在這裡查看自己的手牌。' : hand.length ? '' : '手牌已用完，之後回合會自動略過你。';
    this.choice.refresh();
  }

  hide() { this.selected = null; this.choice.close(); }
}
