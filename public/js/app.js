import { GameState } from './state/game-state.js';
import { PlayerSession } from './storage/player-session.js';
import { PublicAddress } from './storage/public-address.js';
import { ApiClient } from './network/api-client.js';
import { RoomConnection } from './network/room-connection.js';
import { EntryView } from './views/entry-view.js';
import { RoomView } from './views/room-view.js';
import { Notice } from './views/notice.js';
import { getClientGame } from './games/index.js';

export class GameApp {
  constructor() {
    this.state = new GameState();
    this.session = new PlayerSession();
    this.notice = new Notice();
    this.controllers = new Map();
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
    this.view = new RoomView(this.actions(), new PublicAddress(), this.notify, () => this.state, type => this.controller(type).actions());
  }

  start() {
    if (this.entry.shouldRestore(this.session.roomCode)) {
      this.entry.useRoom(this.session.roomCode);
      this.perform(() => this.enter('join'));
    }
  }

  render() { if (this.state.room) this.view.render(this.state); }
  controller(type) {
    if (!this.controllers.has(type)) this.controllers.set(type, getClientGame(type).createController(this));
    return this.controllers.get(type);
  }
  update(snapshot) {
    const previous = this.state.room;
    const game = getClientGame(snapshot.gameType);
    if (this.activeType !== game.id) {
      this.controllers.get(this.activeType)?.leave?.();
      const { playerId, selected, busy, connected } = this.state;
      this.state = Object.assign(game.createState(), { playerId, selected, busy, connected });
      this.activeType = game.id;
    }
    if (!this.state.accept(snapshot)) return;
    this.render();
    this.controller(game.id).onSnapshot?.(previous, snapshot);
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
    const path = getClientGame(result.room.gameType).roomPath(this.entry.path);
    history.replaceState(null, '', `${path}?room=${result.room.code}`);
    this.update(result.room);
    this.connection.open(result.room.code, this.session.token);
  }

  leave() {
    this.controllers.get(this.activeType)?.leave?.();
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

  actions() { return { leave: () => this.leave(), switchPlayer: () => this.switchPlayer() }; }
}
