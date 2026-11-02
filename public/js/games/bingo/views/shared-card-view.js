import { $, element } from '../../../views/dom.js';
import { bindDialogDismiss } from '../../../views/dialog.js';

export class SharedCardView {
  constructor(actions) {
    this.actions = actions;
    this.dialog = $('sharedCardDialog');
    bindDialogDismiss({ dialog: this.dialog, closeButton: $('cancelSharedCard'), onDismiss: () => this.cancel() });
  }

  render(state) {
    this.state = state;
    const { room, me, busy, connected } = state;
    const active = room.activeCard;
    if (!active) { this.close(); this.sessionId = null; return; }
    if (this.sessionId !== active.id) { this.choice = null; this.sessionId = active.id; }
    const owner = room.players.find(player => player.id === active.playerId);
    const mine = active.playerId === me.id;
    const result = active.stage === 'result';
    const reviewing = active.stage === 'review';
    $('cancelSharedCard').hidden = !mine || active.stage !== 'question';
    $('cancelSharedCard').disabled = busy || !connected;
    $('sharedCardTitle').textContent = `${owner?.name || '玩家'} 使用了「${active.card.name}」`;
    $('sharedCardSymbol').textContent = active.card.symbol || '✦';
    $('sharedCardDescription').textContent = active.card.description || '';
    $('sharedCardEffect').textContent = `卡牌效果：${active.card.effect || '能力待定'}`;
    $('sharedCardStatus').textContent = result ? (room.phase === 'playing' ? '房主判定結果 · 確認後換下一位' : '房主判定結果 · 確認後繼續遊戲')
      : reviewing ? '遊戲暫停 · 等待房主判定' : '遊戲暫停 · 等待作答';
    $('sharedCardQuestion').textContent = active.card.question;
    $('sharedCardOptions').replaceChildren(...active.card.options.map((label, index) => {
      const selected = result || reviewing ? active.choice === index : this.choice === index;
      const button = element('button', `preview-option${selected ? ' chosen' : ''}`, `${'ABCD'[index]}　${label}`);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = !mine || result || reviewing || busy || !connected;
      button.onclick = () => { this.choice = index; this.render(state); };
      return button;
    }));
    const resultText = $('sharedCardResult');
    resultText.textContent = result ? ''
      : reviewing ? `${owner?.name || '玩家'} 已提交答案，等待房主判定。`
        : mine ? '請選擇答案。' : `等待 ${owner?.name || '玩家'} 回答…`;
    if (result) resultText.append(
      element('strong', `card-verdict ${active.correct ? 'is-correct' : 'is-wrong'}`, active.correct ? '回答正確！' : '回答錯誤')
    );
    const answer = $('answerSharedCard');
    answer.hidden = !mine || result || reviewing;
    answer.disabled = busy || !connected || this.choice === null;
    answer.onclick = () => this.actions.answerCard(active.id, this.choice);
    for (const [id, correct] of [['judgeCardCorrect', true], ['judgeCardWrong', false]]) {
      const judge = $(id);
      judge.hidden = !reviewing || me.id !== room.host;
      judge.disabled = busy || !connected;
      judge.onclick = () => this.actions.judgeCard(active.id, correct);
    }
    const finish = $('finishSharedCard');
    finish.hidden = me.id !== room.host && !(mine && result);
    finish.disabled = busy || !connected;
    finish.textContent = result ? (room.phase === 'playing' ? '結束回合，換下一位' : '繼續遊戲') : '結束作答';
    finish.onclick = () => this.actions.finishCard(active.id);
    if (!this.dialog.open) this.dialog.showModal();
  }

  close() { if (this.dialog.open) this.dialog.close(); }

  cancel() {
    const { room, me, busy, connected } = this.state || {};
    if (room?.activeCard?.stage === 'question' && room.activeCard.playerId === me.id && !busy && connected) {
      this.actions.cancelCard?.(room.activeCard.id);
    }
  }
}
