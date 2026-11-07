import { TeamIntroductionView } from './introduction-view.js';
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
import { GoalProgressView } from './views/goal-progress-view.js';
import { RoundEndView } from './views/round-end-view.js';

export class TeamBingoView {
  constructor(actions, address, notify, getState) {
    this.introduction = new TeamIntroductionView(actions);
    this.players = new PlayersView(actions);
    this.goalProgress = new GoalProgressView();
    this.roundEnd = new RoundEndView();
    this.board = new BoardView(actions);
    this.hostControls = new HostControlsView(actions);
    this.invitation = new InvitationView(address, notify, getState, $);
    this.hand = new HandView(actions);
    // this.cardPreview = new CardPreviewView(count => this.hand.setPreviewCount(count), actions);
    this.handDrawer = new HandDrawerView();
    this.sharedCard = new SharedCardView(actions);
    this.rewards = new RewardsView(actions);
    this.drawCards = new DrawCardView({ animate: false });
    this.hiddenGoal = new HiddenGoalView(actions);
    this.captainHint = new CaptainHintView(actions);
    this.hiddenGuess = new HiddenGuessView(actions);
  }

  render(state) {
    const { room, me, target } = state;
    if (!me || !target) return;
    const introductionState = state;
    if (room.introduction?.open) state = Object.assign(Object.create(state), { busy: true });
    document.title = '團隊賓果 · Alberta';
    $('root').hidden = false;
    $('game').hidden = false;
    $('game').dataset.phase = room.phase;
    $('handPanel').hidden = false;
    $('roomCode').textContent = room.code;
    this.invitation.render(room, state.playerId);
    this.players.render(state);
    this.goalProgress.render(state);
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
    this.introduction.render(introductionState);
    this.roundEnd.render(introductionState);
    $('winner').textContent = room.endReason === 'board-full-draw' ? '盤面已滿，無隊伍達成勝利條件，本局和局。'
      : room.endReason === 'time-exhausted' ? '所有隊伍行動時間已用完，本局無勝者。' : room.winners.length
      ? `✳ ${room.teams.filter(team => room.winners.includes(team.id)).map(team => team.name).join('、')}${room.winners.length > 1 ? ' 並列獲勝' : ' 獲勝'}！` : '';
  }

  hide() {
    this.introduction.hide();
    this.players.hide();
    this.goalProgress.hide();
    this.roundEnd.hide();
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
