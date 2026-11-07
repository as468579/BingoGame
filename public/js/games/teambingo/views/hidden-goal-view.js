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
    if (state.room.introduction?.open) { this.close(); return; }
    const key = `${state.room.code}:${state.playerId}`;
    if (this.key !== key) { this.close(); this.pendingId = null; }
    this.key = key; this.state = state;
    const choosing = state.room.phase === 'choosing-goal';
    const goal = state.room.hiddenGoal;
    this.dialog.dataset.selecting = 'false';
    if (!choosing || goal?.selected || !goal?.options?.some(card => card.id === this.pendingId)) this.pendingId = null;
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
      $('hiddenGoalCards').replaceChildren(...state.room.hostHiddenGoals.flatMap(team => (team.selections?.length ? team.selections : [team.selected]).map(card => cardFace({
        tag: 'div', className: 'spell-card hidden-goal-card', type: team.teamName,
        art: card?.symbol || '?', name: card?.name || '尚未選擇',
        description: card?.effect || '等待隊長選擇隱藏勝利條件。',
        reward: card ? card.reward || null : undefined,
        footer: card?.completed ? '已達成' : (card?.progress || team.progress) ? `進度：${(card?.progress || team.progress).current} / ${(card?.progress || team.progress).target}` : card ? '已選擇' : '等待選擇'
      }))));
      return;
    }
    $('hiddenGoalTitle').textContent = '隱藏勝利條件';
    $('viewHiddenGoal').hidden = !goal?.selected || choosing;
    if (!goal) { this.close(); $('hiddenGoalCards').replaceChildren(); $('hiddenGoalHint').textContent = ''; return; }
    const selections = goal.selections || (goal.selected ? [goal.selected] : []);
    $('closeHiddenGoal').hidden = !goal.selected;
    const pending = goal.options.find(card => card.id === this.pendingId);
    this.dialog.dataset.selecting = String(choosing && !goal.selected && !pending);
    $('hiddenGoalTitle').textContent = pending ? '確認隱藏勝利條件' : '隱藏勝利條件';
    $('hiddenGoalHint').textContent = pending ? '確定選擇此條件？確認後無法更換。' : goal.selected ? '僅你與房主可查看此條件，全部達成即可獲勝。' : `選擇 ${goal.requiredCount || 1} 個不同隱藏勝利條件，已選 ${selections.length} 個。${selections.length ? `已選：${selections.map(card => card.name).join('、')}。` : ''}僅你與房主可查看。`;
    const cards = goal.selected ? selections : pending ? [pending] : goal.options;
    $('hiddenGoalCards').replaceChildren(...cards.map(card => {
      const node = cardFace({ tag: goal.selected || pending ? 'div' : 'button', className: 'spell-card hidden-goal-card',
        type: '隱藏勝利條件', art: card.symbol, name: card.name, description: card.effect, reward: card.reward || null,
        footer: card.completed ? '已達成' : (card.progress || (cards.length === 1 && goal.progress)) ? `進度：${(card.progress || goal.progress).current} / ${(card.progress || goal.progress).target}` : goal.selected ? '已選擇' : pending ? '待確認' : '選擇此條件' });
      if (!goal.selected && !pending) {
        node.setAttribute('aria-label', `選擇第 ${goal.options.indexOf(card) + 1} 張隱藏勝利條件卡`);
        node.disabled = Boolean(state.busy || !state.connected || !choosing);
        node.onclick = () => { if (!node.disabled) { this.pendingId = card.id; this.render(this.state); } };
      }
      return node;
    }));
    if (pending) {
      const controls = element('div', 'hidden-goal-confirm-actions');
      const cancel = element('button', 'secondary', '返回選擇');
      const confirm = element('button', 'primary', '確認選擇');
      confirm.disabled = Boolean(state.busy || !state.connected);
      cancel.onclick = () => { this.pendingId = null; this.render(this.state); };
      confirm.onclick = () => {
        if (confirm.disabled || this.pendingId !== pending.id) return;
        confirm.disabled = true;
        this.actions.chooseHiddenGoal(pending.id);
      };
      controls.append(cancel, confirm);
      $('hiddenGoalCards').append(controls);
    }
    if (selections.some(card => card.id === 'anticipate-opponent') && state.room.phase === 'playing') {
      const button = element('button', 'primary hidden-goal-guess-button', goal.guessUsed ? `第 ${goal.round} 回合已猜測` : `提出猜測（第 ${goal.round} 回合）`);
      button.disabled = Boolean(state.busy || !state.connected || !goal.canGuess);
      button.onclick = () => { if (!button.disabled) this.actions.guessHiddenGoal(); };
      $('hiddenGoalCards').append(button);
    }
    if (state.room.hiddenGoalGuess) this.close();
    if (choosing && !goal.selected && !this.dialog.open) this.dialog.showModal();
    if (this.wasChoosing && goal.selected) this.close();
    this.wasChoosing = choosing && !goal.selected;
  }

  close() { if (this.dialog.open) this.dialog.close(); }
  hide() {
    this.close(); this.key = null; this.wasChoosing = false; this.pendingId = null;
    this.dialog.dataset.waiting = 'false';
    this.dialog.dataset.selecting = 'false';
    $('viewHiddenGoal').hidden = true;
    $('hiddenGoalCards').replaceChildren();
    $('hiddenGoalHint').textContent = '';
  }
}
