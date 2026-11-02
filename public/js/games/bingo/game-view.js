import { $ } from '../../views/dom.js';
import { PlayersView } from './views/players-view.js';
import { BoardView } from './views/board-view.js';
import { HostControlsView } from './views/host-controls-view.js';
import { ApprovalView } from './views/approval-view.js';
import { InvitationView } from '../../views/invitation-view.js';
import { HandView } from './views/hand-view.js';
import { CardPreviewView } from './views/card-preview-view.js';
import { HandDrawerView } from './views/hand-drawer-view.js';
import { SharedCardView } from './views/shared-card-view.js';
import { RewardsView } from './views/rewards-view.js';
import { DrawCardView } from './views/draw-card-view.js';

export class BingoView {
  constructor(actions, address, notify, getState) {
    this.players = new PlayersView(actions.selectPlayer);
    this.board = new BoardView(actions);
    this.hostControls = new HostControlsView(actions);
    this.approval = new ApprovalView(actions);
    this.invitation = new InvitationView(address, notify, getState);
    this.hand = new HandView(actions);
    this.cardPreview = new CardPreviewView(count => this.hand.setPreviewCount(count), actions);
    this.handDrawer = new HandDrawerView();
    this.sharedCard = new SharedCardView(actions);
    this.rewards = new RewardsView();
    this.drawCards = new DrawCardView();
  }

  render(state) {
    const { room, me, target } = state;
    if (!me || !target) return;
    document.title = 'Bingo · Alberta Events';
    $('game').hidden = false;
    $('game').dataset.phase = room.phase;
    $('handPanel').hidden = false;
    $('roomCode').textContent = room.code;
    this.invitation.render(room, state.playerId);
    this.players.render(state);
    this.board.render(state);
    this.hostControls.render(state);
    this.cardPreview.render(state);
    this.handDrawer.render(state);
    this.approval.render(state);
    this.hand.render(state);
    this.sharedCard.render(state);
    this.rewards.render(state);
    this.drawCards.render(state);
    $('rulesText').textContent = `本局 ${room.size} × ${room.size}，數字 1～${room.size ** 2}。每回合選號並抽一張卡，或使用一張卡；使用卡牌後換人。房主確認選號後同步標記並發卡，先完成 ${room.goal} 條線獲勝，可同時獲勝。`;
    $('winner').textContent = room.winners.length
      ? `✳ ${room.players.filter(player => room.winners.includes(player.id)).map(player => player.name).join('、')} Bingo！` : '';
  }

  hide() {
    $('game').hidden = true;
    $('handPanel').hidden = true;
    this.approval.close();
    this.cardPreview.close();
    this.handDrawer.hide();
    this.sharedCard.close();
    this.rewards.hide();
    this.drawCards.hide();
  }
}
