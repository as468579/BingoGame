import { $ } from './dom.js';
import { PlayersView } from './players-view.js';
import { BoardView } from './board-view.js';
import { HostControlsView } from './host-controls-view.js';
import { ApprovalView } from './approval-view.js';
import { InvitationView } from './invitation-view.js';
import { HandView } from './hand-view.js';
import { CardPreviewView } from './card-preview-view.js';
import { HandDrawerView } from './hand-drawer-view.js';
import { SharedCardView } from './shared-card-view.js';
import { RewardsView } from './rewards-view.js';
import { DrawCardView } from './draw-card-view.js';

export class RoomView {
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
    $('leave').onclick = actions.leave;
    $('switchPlayer').onclick = actions.switchPlayer;
  }

  render(state) {
    const { room, me, target } = state;
    if (!me || !target) return;
    $('welcome').hidden = true;
    $('game').hidden = false;
    $('game').dataset.phase = room.phase;
    $('leave').hidden = false;
    $('switchPlayer').hidden = false;
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

  connection(connected) {
    $('connection').textContent = connected ? '● 已連線 · 即時同步' : '◌ 連線中斷 · 自動重連中';
  }

  hide() {
    $('game').hidden = true;
    $('leave').hidden = true;
    $('switchPlayer').hidden = true;
    $('handPanel').hidden = true;
    this.approval.close();
    this.cardPreview.close();
    this.handDrawer.hide();
    this.sharedCard.close();
    this.rewards.hide();
    this.drawCards.hide();
    $('connection').textContent = '● 尚未加入';
  }
}
