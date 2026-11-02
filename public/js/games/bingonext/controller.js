import { LineNoticeView } from './views/line-notice-view.js';
import { rewardGains } from './state/reward-progress.js';
import { shuffledBoard } from '../../utils.js';
import { $ } from './dom.js';

export class BingoNextController {
  constructor(app) { this.app = app; this.lineNotice = new LineNoticeView(); }
  get state() { return this.app.state; }
  onSnapshot(previous, snapshot) {
    if (previous?.code !== snapshot.code || snapshot.phase === 'lobby' || snapshot.called.length < (previous?.called?.length || 0)) this.lineNotice.clear();
    this.lineNotice.show(rewardGains(previous, snapshot));
  }
  leave() { this.lineNotice.clear(); }
  actions() {
    return {
      team: (playerId, teamId) => this.app.command('team', { playerId, teamId }),
      useCard: cardId => this.app.command('cardUse', { cardId }),
      cancelCard: cardSessionId => this.app.command('cardCancel', { cardSessionId }),
      answerCard: (cardSessionId, choice) => this.app.command('cardAnswer', { cardSessionId, choice }),
      judgeCard: (cardSessionId, correct) => this.app.command('cardJudge', { cardSessionId, correct }),
      finishCard: cardSessionId => this.app.command('cardFinish', { cardSessionId }),
      selectPlayer: id => { this.state.selected = id; this.app.render(); },
      editCell: (index, number) => { this.state.editCell(index, number); this.app.view.gameView.board.validate(this.state); },
      shuffle: () => {
        this.state.draft = shuffledBoard(this.state.room.size);
        this.state.draftDirty = true;
        this.app.render();
      },
      ready: () => this.app.perform(async () => {
        const { me, room, draft } = this.state;
        const result = await this.app.api.send(me.id === room.host ? 'board' : 'ready',
          me.id === room.host ? { board: me.ready ? room.board : draft, ready: !me.ready, boardVersion: room.boardVersion } : { ready: !me.ready });
        this.state.draftDirty = false;
        this.app.update(result.room);
      }),
      settingsChanged: () => { this.state.settingsDirty = true; },
      applySize: size => this.app.perform(async () => {
        const result = await this.app.api.send('settings', { size, teamCount: Number($('teamCount').value), playersPerTeam: Number($('playersPerTeam').value) });
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
          this.app.notify(`掃描完成：已刪除 ${result.room.lastScanRemovedCount} 位離線玩家，目前 ${result.room.players.length} 人。`);
        }
      }),
    };
  }
}
