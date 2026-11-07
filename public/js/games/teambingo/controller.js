import { LineNoticeView } from './views/line-notice-view.js';
import { rewardGains } from './state/reward-progress.js';
import { shuffledBoard } from '../../utils.js';
import { $ } from './dom.js';

export class TeamBingoController {
  constructor(app) { this.app = app; this.lineNotice = new LineNoticeView(); }
  get state() { return this.app.state; }
  onSnapshot(previous, snapshot) {
    if (previous?.code !== snapshot.code || snapshot.phase === 'lobby' || snapshot.called.length < (previous?.called?.length || 0)) this.lineNotice.clear();
    this.lineNotice.show(rewardGains(previous, snapshot));
  }
  leave() { this.lineNotice.clear(); }
  actions() {
    return {
      winnerReward: (item, sessionId) => this.app.command('winnerReward', { item, sessionId }),
      introduction: data => this.app.command('introduction', data),
      team: (playerId, teamId) => this.app.command('team', { playerId, teamId }),
      captain: (teamId, playerId) => this.app.command('captain', { teamId, playerId }),
      chooseHiddenGoal: goalId => this.app.command('hiddenGoal', { goalId }),
      guessHiddenGoal: () => this.app.command('hiddenGoalGuess'),
      judgeHiddenGoalGuess: (guessId, correct) => this.app.command('hiddenGoalJudge', { guessId, correct }),
      hint: () => this.app.command('captainHint'),
      endHint: hintId => this.app.command('endHint', { hintId }),
      useCard: cardId => this.app.command('cardUse', { cardId }),
      answerCard: (cardSessionId, choice, answered = false) => this.app.command('cardAnswer', answered ? { cardSessionId, answered: true } : { cardSessionId, choice }),
      judgeCard: (cardSessionId, correct) => this.app.command('cardJudge', { cardSessionId, correct }),
      nextQuestion: cardSessionId => this.app.command('cardNextQuestion', { cardSessionId }),
      finishCard: cardSessionId => this.app.command('cardFinish', { cardSessionId }),
      selectPlayer: id => { this.state.selected = id; this.app.render(); },
      editCell: (index, number) => { this.state.editCell(index, number); this.app.view.gameView.board.validate(this.state); },
      shuffle: () => this.app.perform(async () => {
        const { room } = this.state;
        const result = await this.app.api.send('board', { board: shuffledBoard(room.size), boardVersion: room.boardVersion, rerollSpecial: true });
        this.state.draftDirty = false;
        this.app.update(result.room);
      }),
      ready: () => this.app.perform(async () => {
        const { me, room, draft } = this.state;
        const result = await this.app.api.send(me.id === room.host ? 'board' : 'ready',
          me.id === room.host ? { board: draft, boardVersion: room.boardVersion } : { ready: !me.ready });
        this.state.draftDirty = false;
        this.app.update(result.room);
      }),
      settingsChanged: () => { this.state.settingsDirty = true; },
      applySize: size => this.app.perform(async () => {
        const result = await this.app.api.send('settings', { size, hiddenGoalCount: Number($('hiddenGoalCount').value), teamCount: Number($('teamCount').value), playersPerTeam: Number($('playersPerTeam').value) });
        this.state.settingsDirty = false;
        this.app.update(result.room);
        this.app.notify(`已套用 ${size} × ${size}，請所有玩家確認盤面並準備。`);
      }),
      call: number => this.app.command('call', { number }),
      undo: () => this.app.command('undo', { revision: this.state.room.revision }, result => {
        this.app.notify(!result.room.canUndo ? '已回到本局剛開始，由第一位玩家重新選號。' : '已回到上一步，所有玩家的盤面與回合同步恢復。');
      }),
      command: kind => this.app.perform(async () => {
        const result = await this.app.api.send(kind);
        if (kind !== 'scan') this.state.draftDirty = false;
        this.app.update(result.room);
        if (kind === 'rerollPrizes') this.app.notify('獎品已重新隨機，所有玩家同步更新。');
        if (kind === 'scan') {
          this.app.notify(`掃描完成：已刪除 ${result.room.lastScanRemovedCount} 位離線玩家，目前 ${result.room.participantCount} 人。`);
        }
      }),
    };
  }
}
