import { GameState } from './state/game-state.js';
import { PlayerSession } from './storage/player-session.js';
import { PublicAddress } from './storage/public-address.js';
import { ApiClient } from './network/api-client.js';
import { RoomConnection } from './network/room-connection.js';
import { EntryView } from './views/entry-view.js';
import { RoomView } from './views/room-view.js';
import { Notice } from './views/notice.js';
import { LineNoticeView } from './views/line-notice-view.js';
import { rewardGains } from './state/line-progress.js';
import { shuffledBoard } from './utils.js';

export class BingoApp {
  constructor() {
    this.state = new GameState();
    this.session = new PlayerSession();
    this.notice = new Notice();
    this.lineNotice = new LineNoticeView();
    this.notify = message => this.notice.show(message);
    this.api = new ApiClient({ session: this.session, getRoomCode: () => this.state.room?.code, notify: this.notify });
    this.connection = new RoomConnection({
      onConnection: connected => {
        this.state.connected = connected;
        this.view.connection(connected);
        this.render();
      },
      onSnapshot: snapshot => this.update(snapshot)
    });
    this.entry = new EntryView(this.session, kind => this.perform(() => this.enter(kind)));
    this.view = new RoomView(this.actions(), new PublicAddress(), this.notify, () => this.state);
  }

  start() {
    if (this.entry.shouldRestore(this.session.roomCode)) {
      this.entry.useRoom(this.session.roomCode);
      this.perform(() => this.enter('join'));
    }
  }

  render() { if (this.state.room) this.view.render(this.state); }
  update(snapshot) {
    const previous = this.state.room;
    if (!this.state.accept(snapshot)) return;
    if (previous?.code !== snapshot.code || snapshot.phase === 'lobby' ||
        snapshot.called.length < (previous?.called.length || 0)) this.lineNotice.clear();
    this.render();
    this.lineNotice.show(rewardGains(previous, snapshot));
  }

  async perform(callback) {
    if (this.state.busy) return;
    this.state.busy = true;
    this.entry.setBusy(true);
    this.render();
    try { await callback(); } catch (error) { this.notify(error.message); }
    finally {
      this.state.busy = false;
      this.entry.setBusy(false);
      this.render();
    }
  }

  async enter(kind) {
    const identity = this.entry.identity;
    const result = await this.api.send(kind, identity);
    this.session.remember(result.token, identity.name, result.room.code);
    this.state.playerId = result.playerId;
    this.state.selected = result.playerId;
    this.state.draftDirty = false;
    history.replaceState(null, '', `?room=${result.room.code}`);
    this.update(result.room);
    this.connection.open(result.room.code, this.session.token);
  }

  leave() {
    this.lineNotice.clear();
    this.connection.close();
    this.state.leave();
    this.session.clearRoom();
    history.replaceState(null, '', this.entry.path);
    this.view.hide();
    this.entry.show();
  }

  switchPlayer() {
    if (this.state.busy) return;
    const code = this.state.room.code;
    this.leave();
    this.session.clearName();
    this.entry.switchPlayer(code);
    history.replaceState(null, '', `${this.entry.path}?room=${code}`);
    this.notify('請輸入玩家 ID：同 ID 恢復原玩家，不同 ID 加入為新玩家。');
  }

  command(kind, data = {}, after) {
    return this.perform(async () => {
      const result = await this.api.send(kind, data);
      this.update(result.room);
      after?.(result);
    });
  }

  actions() {
    return {
      useCard: cardId => this.command('cardUse', { cardId }),
      cancelCard: cardSessionId => this.command('cardCancel', { cardSessionId }),
      answerCard: (cardSessionId, choice) => this.command('cardAnswer', { cardSessionId, choice }),
      judgeCard: (cardSessionId, correct) => this.command('cardJudge', { cardSessionId, correct }),
      finishCard: cardSessionId => this.command('cardFinish', { cardSessionId }),
      selectPlayer: id => { this.state.selected = id; this.render(); },
      editCell: (index, number) => { this.state.editCell(index, number); this.view.board.validate(this.state); },
      shuffle: () => {
        this.state.draft = shuffledBoard(this.state.room.size);
        this.state.draftDirty = true;
        this.render();
      },
      ready: () => this.perform(async () => {
        const { me, room, draft } = this.state;
        const result = await this.api.send('board', { board: me.ready ? me.board : draft, ready: !me.ready, boardVersion: room.boardVersion });
        this.state.draftDirty = false;
        this.update(result.room);
      }),
      settingsChanged: () => { this.state.settingsDirty = true; },
      applySize: size => this.perform(async () => {
        const result = await this.api.send('settings', { size });
        this.state.settingsDirty = false;
        this.update(result.room);
        this.notify(`已套用 ${size} × ${size}，請所有玩家確認盤面並準備。`);
      }),
      call: number => this.command('call', { number }),
      decide: kind => {
        const pendingId = this.state.room?.pending?.id;
        if (pendingId) this.command(kind, { pendingId });
      },
      undo: () => this.command('undo', { revision: this.state.room.revision }, result => {
        this.notify(!result.room.canUndo ? '已回到本局剛開始，由第一位玩家重新選號。' : '已回到上一步，所有玩家的盤面與回合同步恢復。');
      }),
      command: kind => this.perform(async () => {
        const result = await this.api.send(kind);
        if (kind !== 'scan') this.state.draftDirty = false;
        this.update(result.room);
        if (kind === 'rerollPrizes') this.notify('獎品已重新隨機，所有玩家同步更新。');
        if (kind === 'scan') {
          this.notify(`掃描完成：已刪除 ${result.room.lastScanRemovedCount} 位離線玩家，目前 ${result.room.players.length} 人。`);
        }
      }),
      leave: () => this.leave(),
      switchPlayer: () => this.switchPlayer()
    };
  }
}
