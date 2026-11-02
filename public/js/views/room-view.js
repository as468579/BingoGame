import { $ } from './dom.js';
import { getClientGame } from '../games/index.js';

// Owns the common chrome and view lifecycle; inactive game views are never constructed or rendered.
export class RoomView {
  constructor(actions, address, notify, getState, getActions = () => actions) {
    this.context = { address, notify, getState }; this.getActions = getActions; this.instances = new Map();
    $('leave').onclick = actions.leave; $('switchPlayer').onclick = actions.switchPlayer;
  }
  render(state) {
    const game = getClientGame(state.room.gameType);
    if (this.activeType !== game.id) {
      this.gameView?.hide();
      if (!this.instances.has(game.id)) this.instances.set(game.id, game.createView(this.getActions(game.id), this.context));
      this.gameView = this.instances.get(game.id); this.activeType = game.id;
    }
    $('welcome').hidden = true; $('leave').hidden = false; $('switchPlayer').hidden = false;
    this.gameView.render(state);
  }
  connection(connected) { $('connection').textContent = connected ? '● 已連線 · 即時同步' : '◌ 連線中斷 · 自動重連中'; }
  hide() {
    this.gameView?.hide(); this.gameView = null; this.activeType = null;
    $('leave').hidden = true; $('switchPlayer').hidden = true; $('connection').textContent = '● 尚未加入';
  }
}
