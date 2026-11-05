import { $, element } from '../dom.js';
import { cardFace } from '../../../views/playing-card.js';
import { bindDialogDismiss } from '../../../views/dialog.js';

export class HiddenGoalView {
  constructor(actions) {
    this.actions = actions;
    this.dialog = $('hiddenGoalDialog');
    $('viewHiddenGoal').onclick = () => { if (!this.dialog.open) this.dialog.showModal(); };
    bindDialogDismiss({ dialog: this.dialog, closeButton: $('closeHiddenGoal'),
      canDismiss: () => Boolean(this.state?.room.hiddenGoal?.selected || this.state?.room.hostHiddenGoals), onDismiss: () => this.close() });
  }

  render(state) {
    const key = `${state.room.code}:${state.playerId}`;
    if (this.key !== key) this.close();
    this.key = key; this.state = state;
    const choosing = state.room.phase === 'choosing-goal';
    const goal = state.room.hiddenGoal;
    const waiting = choosing && !goal && state.playerId !== state.room.host;
    this.dialog.dataset.waiting = String(waiting);
    if (waiting) {
      this.wasChoosing = false;
      $('viewHiddenGoal').hidden = true;
      $('closeHiddenGoal').hidden = true;
      $('hiddenGoalTitle').textContent = '等待隊長選擇隱藏勝利條件中...';
      $('hiddenGoalHint').textContent = '';
      $('hiddenGoalCards').replaceChildren();
      if (!this.dialog.open) this.dialog.showModal();
      return;
    }
    if (state.playerId === state.room.host && state.room.hostHiddenGoals) {
      this.wasChoosing = false;
      $('viewHiddenGoal').hidden = false;
      $('closeHiddenGoal').hidden = false;
      $('hiddenGoalTitle').textContent = '各隊隱藏勝利條件';
      $('hiddenGoalHint').textContent = '房主可查看各隊已選擇的條件。';
      $('hiddenGoalCards').replaceChildren(...state.room.hostHiddenGoals.map(team => cardFace({
        tag: 'div', className: 'spell-card hidden-goal-card', type: team.teamName,
        art: team.selected?.symbol || '?', name: team.selected?.name || '尚未選擇',
        description: team.selected?.effect || '等待隊長選擇隱藏勝利條件。',
        footer: team.selected ? '已選擇' : '等待選擇'
      })));
      return;
    }
    $('hiddenGoalTitle').textContent = '隱藏勝利條件';
    $('viewHiddenGoal').hidden = !goal?.selected || choosing;
    if (!goal) { this.close(); $('hiddenGoalCards').replaceChildren(); $('hiddenGoalHint').textContent = ''; return; }
    $('closeHiddenGoal').hidden = !goal.selected;
    $('hiddenGoalHint').textContent = goal.selected ? '僅你與房主可查看此條件。' : '選擇一張卡片，結果僅你與房主可查看。條件暫定，不啟用勝利判定。';
    const cards = goal.selected ? [goal.selected] : goal.options;
    $('hiddenGoalCards').replaceChildren(...cards.map(card => {
      const node = cardFace({ tag: goal.selected ? 'div' : 'button', className: 'spell-card hidden-goal-card',
        type: '隱藏勝利條件', art: card.symbol, name: card.name, description: card.effect,
        footer: goal.selected ? '已選擇' : '選擇此條件' });
      if (!goal.selected) {
        node.setAttribute('aria-label', `選擇第 ${goal.options.indexOf(card) + 1} 張隱藏勝利條件卡`);
        node.disabled = Boolean(state.busy || !state.connected || !choosing);
        node.onclick = () => { if (!node.disabled) this.actions.chooseHiddenGoal(card.id); };
      }
      return node;
    }));
    if (choosing && !goal.selected && !this.dialog.open) this.dialog.showModal();
    if (this.wasChoosing && goal.selected) this.close();
    this.wasChoosing = choosing && !goal.selected;
  }

  close() { if (this.dialog.open) this.dialog.close(); }
  hide() {
    this.close(); this.key = null; this.wasChoosing = false;
    this.dialog.dataset.waiting = 'false';
    $('viewHiddenGoal').hidden = true;
    $('hiddenGoalCards').replaceChildren();
    $('hiddenGoalHint').textContent = '';
  }
}
