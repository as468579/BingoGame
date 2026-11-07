import { $, element } from '../dom.js';
import { bindDialogDismiss } from '../../../views/dialog.js';
import { renderCardArt } from '../../../views/playing-card.js';

export class SharedCardView {
  constructor(actions) {
    this.actions = actions;
    this.dialog = $('sharedCardDialog');
    bindDialogDismiss({ dialog: this.dialog, canDismiss: () => false, dismissOnBackdrop: false });
  }

  render(state) {
    this.state = state;
    const { room, me, busy, connected } = state;
    if (room.introduction?.open) { this.close(); return; }
    const active = room.activeCard;
    if (!active) { this.close(); this.sessionId = null; return; }
    if (this.sessionId !== active.id) { this.choice = null; this.sessionId = active.id; this.answerDeadline = undefined; }
    const owner = room.players.find(player => player.id === active.playerId);
    const mine = active.playerId === me.id;
    const result = active.stage === 'result';
    const reviewing = active.stage === 'review';
    const oral = active.card.questionType === 'oral';
    $('sharedCardStatus').dataset.countdown = String(active.stage === 'question' && Number.isFinite(active.answerRemainingMs));
    $('sharedCardTitle').textContent = `${owner?.name || '玩家'} 使用了「${active.card.name}」`;
    renderCardArt($('sharedCardSymbol'), active.card.symbol || '✦');
    $('sharedCardDescription').textContent = '';
    $('sharedCardDescription').hidden = true;
    $('sharedCardEffect').hidden = result && active.correct !== true;
    $('sharedCardEffect').textContent = result && active.correct !== true ? '' : `卡牌效果：${active.card.effect || '能力待定'}`;
    const status = result ? (room.phase === 'playing' ? '房主判定結果 · 確認後換下一位' : '房主判定結果 · 確認後繼續遊戲')
      : reviewing ? active.timedOut ? '作答逾時 · 等待房主判定' : '遊戲暫停 · 等待房主判定' : '遊戲暫停 · 等待作答';
    $('sharedCardStatus').textContent = status;
    const question = $('sharedCardQuestion');
    question.replaceChildren();
    if (active.card.questionCategory) question.append(element('span', 'question-category', `[${active.card.questionCategory}]: `));
    question.append(element('strong', '', active.card.question));
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
      : reviewing ? `${owner?.name || '玩家'} ${active.timedOut ? '未於時限內作答' : '已提交答案'}，等待房主判定。`
        : mine ? oral ? '請口頭回答，完成後按「已回答」。' : '請選擇答案。' : `等待 ${owner?.name || '玩家'} 回答…`;
    if (result) resultText.append(
      element('strong', `card-verdict ${active.correct ? 'is-correct' : 'is-wrong'}`, active.correct ? '回答正確！' : '回答錯誤')
    );
    if (reviewing && me.id === room.host) {
      const reference = element('span', 'host-reference-answer');
      reference.append(element('strong', '', '正確答案：'), element('span', '', active.referenceAnswer || ''));
      resultText.append(reference);
    }
    const answer = $('answerSharedCard');
    answer.hidden = !mine || result || reviewing;
    answer.textContent = oral ? '已回答' : '確認答案';
    answer.disabled = busy || !connected || (!oral && this.choice === null);
    answer.onclick = () => oral ? this.actions.answerCard(active.id, null, true) : this.actions.answerCard(active.id, this.choice);
    for (const [id, correct] of [['judgeCardCorrect', true], ['judgeCardWrong', false]]) {
      const judge = $(id);
      judge.hidden = !reviewing || me.id !== room.host;
      judge.disabled = busy || !connected;
      judge.onclick = () => this.actions.judgeCard(active.id, correct);
    }
    const finish = $('finishSharedCard');
    const next = $('nextQuestion');
    next.hidden = me.id !== room.host || result;
    next.disabled = busy || !connected;
    next.onclick = () => this.actions.nextQuestion(active.id);
    finish.hidden = me.id !== room.host && !(mine && result);
    finish.disabled = busy || !connected;
    finish.textContent = result ? (room.phase === 'playing' ? '結束回合，換下一位' : '繼續遊戲') : '結束作答';
    finish.onclick = () => this.actions.finishCard(active.id);
    clearInterval(this.answerTimer); this.answerTimer = null;
    if (active.stage === 'question' && Number.isFinite(active.answerRemainingMs)) {
      const deadline = Date.now() + active.answerRemainingMs;
      this.answerDeadline = Math.min(this.answerDeadline ?? deadline, deadline);
      this.updateAnswerClock();
      this.answerTimer = setInterval(() => this.updateAnswerClock(), 250);
      this.answerTimer.unref?.();
    }
    if (!this.dialog.open) this.dialog.showModal();
  }

  updateAnswerClock(now = Date.now()) {
    const seconds = Math.max(0, Math.ceil((this.answerDeadline - now) / 1000));
    $('sharedCardStatus').textContent = seconds > 0 ? `作答剩餘 ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : '作答時間已到 · 等待房主判定';
    if (seconds === 0) {
      $('answerSharedCard').disabled = true;
      for (const option of $('sharedCardOptions').children) option.disabled = true;
    }
  }

  close() {
    clearInterval(this.answerTimer); this.answerTimer = null; this.answerDeadline = undefined;
    if (this.dialog.open) this.dialog.close();
  }

}
