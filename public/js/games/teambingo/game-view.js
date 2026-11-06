import { $ } from './dom.js';
import { PlayersView } from './views/players-view.js';
import { BoardView } from './views/board-view.js';
import { HostControlsView } from './views/host-controls-view.js';
import { InvitationView } from '../../views/invitation-view.js';
import { HandView } from './views/hand-view.js';
import { HandDrawerView } from './views/hand-drawer-view.js';
import { SharedCardView } from './views/shared-card-view.js';
import { RewardsView } from './views/rewards-view.js';
import { DrawCardView } from './views/draw-card-view.js';
import { HiddenGoalView } from './views/hidden-goal-view.js';
import { CaptainHintView } from './views/captain-hint-view.js';
import { HiddenGuessView } from './views/hidden-guess-view.js';

export class TeamBingoView {
  constructor(actions, address, notify, getState) {
    this.players = new PlayersView(actions);
    this.board = new BoardView(actions);
    this.hostControls = new HostControlsView(actions);
    this.invitation = new InvitationView(address, notify, getState, $);
    this.hand = new HandView(actions);
    // this.cardPreview = new CardPreviewView(count => this.hand.setPreviewCount(count), actions);
    this.handDrawer = new HandDrawerView();
    this.sharedCard = new SharedCardView(actions);
    this.rewards = new RewardsView();
    this.drawCards = new DrawCardView({ animate: false });
    this.hiddenGoal = new HiddenGoalView(actions);
    this.captainHint = new CaptainHintView(actions);
    this.hiddenGuess = new HiddenGuessView(actions);
  }

  render(state) {
    const { room, me, target } = state;
    if (!me || !target) return;
    document.title = '團隊賓果 · Alberta';
    $('root').hidden = false;
    $('game').hidden = false;
    $('game').dataset.phase = room.phase;
    $('handPanel').hidden = false;
    $('roomCode').textContent = room.code;
    this.invitation.render(room, state.playerId);
    this.players.render(state);
    this.board.render(state);
    this.hostControls.render(state);
    // this.cardPreview.render(state);
    this.handDrawer.render(state);
    this.hand.render(state);
    this.sharedCard.render(state);
    this.hiddenGuess.render(state);
    this.rewards.render(state);
    this.drawCards.render(state);
    this.hiddenGoal.render(state);
    this.captainHint.render(state);
    $('rulesText').textContent = `每回合只能圈選一個數字或使用一張隊伍卡牌，二擇一。圈選後直接佔領並換人；卡牌作答完成後，無論正誤都換人。建立或隨機排列時，隨機選出總格數 × 20%（無條件進位）個特殊格，圈選特殊格可獲得一張卡，當回合不能接著使用。整條線必須屬於同隊才可獲獎。先完成 ${room.goal} 條線或達成所選隱藏勝利條件即獲勝；盤面滿時按連線數結算。`;
    $('winner').textContent = room.endReason === 'time-exhausted' ? '所有隊伍行動時間已用完，本局無勝者。' : room.winners.length
      ? `✳ ${room.teams.filter(team => room.winners.includes(team.id)).map(team => team.name).join('、')}${room.winners.length > 1 ? ' 並列獲勝' : ' 獲勝'}！` : '';
  }

  hide() {
    this.players.hide();
    this.board.hide();
    $('root').hidden = true;
    $('game').hidden = true;
    $('handPanel').hidden = true;
    // this.cardPreview.close();
    this.handDrawer.hide();
    this.sharedCard.close();
    this.rewards.hide();
    this.drawCards.hide();
    this.hiddenGoal.hide();
    this.captainHint.hide();
    this.hiddenGuess.hide();
  }
}
