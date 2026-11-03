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
    const ownTeam = room.bridge.teams.find(candidate => candidate.id === me.teamId);
    const draftKey = `${room.code}:${room.boardVersion}:${me.teamId}:${ownTeam?.boardVersion || 0}`;
    if (this.draftKey !== draftKey) {
      this.draftKey = draftKey;
      this.draft = ownTeam?.cells.map(cell => cell.number) || [];
    }
    const editing = room.phase === 'lobby' && mine && !me.ready;
    const focused = document.activeElement?.dataset?.bridgeCell;
    const canPlay = room.phase === 'playing' && mine && team.turn === playerId && !busy && connected;
    const hand = me.hand || [], moves = room.bridge.legalMoves || [];
    if (this.key !== `${room.code}:${room.boardVersion}` || !canPlay || !hand.some(card => card.number === this.selected)) this.selected = null;
    this.key = `${room.code}:${room.boardVersion}`;
    const selected = hand.find(card => card.number === this.selected);
    const missingSuit = Boolean(team.leadColor && !hand.some(card => card.color === team.leadColor));
    const targets = selected ? moves.find(move => move.cardNumber === selected.number)?.targets || [] : [];
    $('bridgeBoard').dataset.size = room.size;
    $('bridgeBoard').setAttribute('aria-label', `${team.name} ${room.size} 乘 ${room.size} 盤面`);
    $('bridgeBoard').replaceChildren(...team.cells.map((cell, index) => {
      if (editing) {
        const input = element('input', 'cell');
        Object.assign(input, { type: 'number', min: '1', max: room.size ** 2, inputMode: 'numeric', value: this.draft[index] || '', disabled: busy || !connected });
        input.dataset.bridgeCell = index;
        input.setAttribute('title', String(this.draft[index] || '未填寫'));
        input.setAttribute('aria-label', `${team.name} 第 ${Math.floor(index / room.size) + 1} 列第 ${index % room.size + 1} 格`);
        input.oninput = () => {
          this.draft[index] = input.value === '' ? 0 : Number(input.value);
          input.setAttribute('title', String(this.draft[index] || '未填寫'));
          this.validate();
        };
        return input;
      }
      const button = element('button', `cell${cell.card ? ' marked' : ''}${targets.includes(cell.number) ? ' bridge-target' : ''}`);
      button.append(element('span', 'bridge-cell-base', cell.number));
      button.setAttribute('title', `${cell.number}`);
      if (cell.card) button.append(element('span', `bridge-placed-card ${cell.card.color}`, `${colorNames[cell.card.color][0]} ${cell.card.number}`));
      button.setAttribute('aria-label', `格號 ${cell.number}${cell.card ? `，${colorNames[cell.card.color]} ${cell.card.number} 已佔領` : '，空格'}`);
      button.disabled = !canPlay || !targets.includes(cell.number);
      button.onclick = () => this.actions.bridge('bridgePlay', { cardNumber: this.selected, targetNumber: cell.number, round: room.bridge.round });
      return button;
    }));
    if (editing) {
      this.validate();
      if (focused !== undefined) $('bridgeBoard').querySelector(`[data-bridge-cell="${focused}"]`)?.focus();
    }
    $('bridgeLines').replaceChildren(...renderBoardLines(team.cells.map(cell => ({ isCovered: Boolean(cell.card) })), room.size));
    $('bridgeMoveHint').textContent = selected ? `${colorNames[selected.color]} ${selected.number}：${missingSuit ? '手中缺少指定顏色，可自由放置' : '須放在相同數字格'}，請點亮起的空格。`
      : room.phase === 'lobby' ? ''
        : !mine ? '正在查看其他隊伍，點選自己的隊伍即可返回出牌。' : '';
    $('bridgeMoveHint').hidden = !$('bridgeMoveHint').textContent;
    $('bridgeHandCount').textContent = '';
    $('bridgeHandCount').hidden = true;
    $('bridgeHand').replaceChildren(...[...hand].sort((a, b) => a.number - b.number).map(card => {
      const move = moves.find(move => move.cardNumber === card.number), legal = move?.targets || [];
      const button = cardFace({ tag: 'button', className: `bridge-number-card ${card.color}${card.number === this.selected ? ' selected' : ''}${!canPlay || (!legal.length && !move?.canDiscard) ? ' is-unplayable' : ''}`, type: colorNames[card.color], art: card.number, watermark: true });
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
    if (room.phase === 'lobby' && !hand.length) $('bridgeHand').append(cardBack('bridge-hand-back card-back-parchment'));
    $('bridgeHandEmpty').textContent = room.phase === 'lobby' || hand.length ? '' : '手牌已用完，之後回合會自動略過你。';
    $('bridgeHandEmpty').hidden = !$('bridgeHandEmpty').textContent;
    this.choice.refresh();
  }

  validate() {
    const count = this.state.room.size ** 2;
    const valid = number => Number.isInteger(number) && number >= 1 && number <= count && this.draft.filter(n => n === number).length === 1;
    [...$('bridgeBoard').children].forEach((cell, index) => cell.classList.toggle('invalid', !valid(this.draft[index])));
    if (!this.state.me.ready) $('bridgeReady').disabled = this.state.busy || !this.state.connected || !this.draft.every(valid);
  }

  ready(ready) {
    const ownTeam = this.state.room.bridge.teams.find(team => team.id === this.state.me.teamId);
    this.actions.bridge('bridgeReady', ready ? { ready, board: [...this.draft], boardVersion: ownTeam.boardVersion || 0 } : { ready });
  }

  hide() { this.selected = null; this.draftKey = null; this.choice.close(); }
}
