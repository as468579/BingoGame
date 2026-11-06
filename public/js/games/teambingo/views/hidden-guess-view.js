import { $ } from '../dom.js';
import { bindDialogDismiss } from '../../../views/dialog.js';

export class HiddenGuessView {
  constructor(actions) {
    this.dialog = $('guessDialog');
    bindDialogDismiss({ dialog: this.dialog, canDismiss: () => false, dismissOnBackdrop: false });
    for (const [id, correct] of [['guessCorrect', true], ['guessWrong', false]]) {
      $(id).onclick = () => {
        if (!$(id).disabled && this.guessId) actions.judgeHiddenGoalGuess(this.guessId, correct);
      };
    }
  }

  render({ room, playerId, busy, connected }) {
    const guess = room.hiddenGoalGuess;
    if (!guess) { this.hide(); return; }
    this.guessId = guess.id;
    const host = playerId === room.host;
    $('guessTitle').textContent = `${guess.teamName} 隊長猜測中`;
    $('guessMessage').textContent = `${guess.captainName}，請口頭說出對方的其中一個隱藏條件。等待房主判定，遊戲時間暫停。`;
    $('guessReference').textContent = host ? (room.hostHiddenGoals || []).filter(team => team.teamId !== guess.teamId)
      .map(team => `${team.teamName}：${team.selections?.length ? team.selections.map(card => `${card.name}${card.completed ? '（已達成，不能猜）' : ''}`).join('、') : team.selected?.name || '尚未選擇'}`).join('；') : '';
    $('guessReference').hidden = !host;
    for (const id of ['guessCorrect', 'guessWrong']) {
      $(id).hidden = !host; $(id).disabled = Boolean(busy || !connected);
    }
    if (!this.dialog.open) this.dialog.showModal();
  }

  hide() {
    if (this.dialog.open) this.dialog.close();
    this.guessId = null;
    $('guessReference').textContent = '';
  }
}
