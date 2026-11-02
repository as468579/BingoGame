import { $ } from './dom.js';
import { PlayersView } from './views/players-view.js';
import { BoardView } from './views/board-view.js';
import { HostControlsView } from './views/host-controls-view.js';
import { InvitationView } from '../../views/invitation-view.js';
import { HandView } from './views/hand-view.js';
import { CardPreviewView } from './views/card-preview-view.js';
import { HandDrawerView } from './views/hand-drawer-view.js';
import { SharedCardView } from './views/shared-card-view.js';
import { RewardsView } from './views/rewards-view.js';
import { DrawCardView } from './views/draw-card-view.js';

export class BingoNextView {
  constructor(actions, address, notify, getState) {
    this.players = new PlayersView(actions);
    this.board = new BoardView(actions);
    this.hostControls = new HostControlsView(actions);
    this.invitation = new InvitationView(address, notify, getState, $);
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
    document.title = 'BingoNext · Alberta Events';
    $('root').hidden = false;
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
    this.hand.render(state);
    this.sharedCard.render(state);
    this.rewards.render(state);
    this.drawCards.render(state);
    $('rulesText').textContent = `全場共用盤面，選號後直接為自己的隊伍佔領並抽卡，或改用一張手牌。整條線必須屬於同隊才可獲獎。先完成 ${room.goal} 條線獲勝；盤面滿時按連線數結算。`;
    $('winner').textContent = room.winners.length
      ? `✳ ${room.teams.filter(team => room.winners.includes(team.id)).map(team => team.name).join('、')}${room.winners.length > 1 ? ' 並列獲勝' : ' 獲勝'}！` : '';
  }

  hide() {
    $('root').hidden = true;
    $('game').hidden = true;
    $('handPanel').hidden = true;
    this.cardPreview.close();
    this.handDrawer.hide();
    this.sharedCard.close();
    this.rewards.hide();
    this.drawCards.hide();
  }
}
