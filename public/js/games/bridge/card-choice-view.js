import { $ } from '../../views/dom.js';
import { bindDialogDismiss } from '../../views/dialog.js';
import { cardFace } from '../../views/playing-card.js';

const colors = { red: '紅色', yellow: '黃色', blue: '藍色' };

// Explain the server-provided legal moves; the server still validates the actual placement.
export function cardPlayIssue(state, team, number) {
  const { room, me, playerId, busy, connected } = state;
  if (!connected) return '目前已斷線，請等待重新連線後再出牌。';
  if (busy) return '上一個操作正在處理中，請稍候。';
  if (room.phase === 'lobby') return '遊戲尚未開始，請等待所有玩家準備完成。';
  if (room.phase === 'finished') return '本局已結束，不能再使用卡片。';
  if (team.id !== me.teamId) return '你目前正在查看其他隊伍，請先切回自己的隊伍。';
  if (team.done) return '本隊已完成這一輪；每人每輪只能出一張牌，請等待其他隊伍完成。';
  if (room.bridge.activeTeamId && room.bridge.activeTeamId !== team.id) {
    const active = room.bridge.teams.find(candidate => candidate.id === room.bridge.activeTeamId);
    return `請等待輪到你的隊伍，目前由 ${active?.name || '其他隊伍'} 出牌。各隊依清單由上到下進行。`;
  }
  if (team.turn !== playerId) {
    const player = room.players.find(candidate => candidate.id === team.turn);
    return `尚未輪到你出牌，請等待${player ? ` ${player.name}` : '隊員'}完成出牌。`;
  }
  const hand = me.hand || [], card = hand.find(candidate => candidate.number === number);
  if (!card) return '這張卡片已不在你的手牌中，請依最新手牌重新選擇。';
  if (team.leadColor && card.color !== team.leadColor && hand.some(candidate => candidate.color === team.leadColor)) {
    return `本輪指定${colors[team.leadColor]}，你仍持有${colors[team.leadColor]}卡片，必須跟色，不能出${colors[card.color]}卡片。自由牌也必須遵守跟色規則。`;
  }
  if (!room.bridge.legalMoves?.find(move => move.cardNumber === number)?.targets.length) return '這張卡片目前沒有合法落點。已被佔領的格子不能重複放置，請依最新盤面重新選牌。';
  return '';
}

export class BridgeCardChoiceView {
  constructor(getContext, onConfirm) {
    this.getContext = getContext;
    this.onConfirm = onConfirm;
    bindDialogDismiss({ dialog: $('bridgeCardChoiceDialog'), closeButton: $('bridgeCloseCardChoice'), onDismiss: () => this.close() });
    $('bridgeCancelCardChoice').onclick = () => this.close();
    $('bridgeConfirmCardChoice').onclick = () => {
      const { state, team } = this.getContext();
      if (this.number === null || this.key !== this.contextKey(state, team)) return this.close();
      if (cardPlayIssue(state, team, this.number)) return this.display();
      const number = this.number;
      this.close();
      this.onConfirm(number);
    };
  }

  contextKey(state, team) {
    return `${state.room.code}:${state.room.boardVersion}:${state.room.phase}:${state.room.bridge.round}:${state.playerId}:${team.id}`;
  }

  open(number) {
    const { state, team } = this.getContext();
    this.number = number;
    this.key = this.contextKey(state, team);
    this.display();
    if (!$('bridgeCardChoiceDialog').open) $('bridgeCardChoiceDialog').showModal();
  }

  refresh() {
    if (!$('bridgeCardChoiceDialog').open) return;
    const { state, team } = this.getContext();
    if (this.key !== this.contextKey(state, team)) return this.close();
    this.display();
  }

  display() {
    const { state, team } = this.getContext();
    const issue = cardPlayIssue(state, team, this.number);
    const card = state.me.hand?.find(candidate => candidate.number === this.number);
    $('bridgeCardChoiceTitle').textContent = issue ? '無法使用這張卡片' : `使用${colors[card.color]} ${card.number}？`;
    $('bridgeCardChoiceReason').textContent = issue || '確認後，請點選盤面上亮起的空格放置';
    $('bridgeConfirmCardChoice').hidden = Boolean(issue);
    $('bridgeCancelCardChoice').textContent = issue ? '知道了' : '取消';
    const content = $('bridgeCardChoiceCard');
    content.replaceChildren();
    if (card) {
      const face = cardFace({ className: `bridge-number-card ${card.color}`, type: colors[card.color], art: card.number });
      content.append(face);
    }
  }

  close() {
    if ($('bridgeCardChoiceDialog').open) $('bridgeCardChoiceDialog').close();
    this.number = null;
    this.key = null;
  }
}
