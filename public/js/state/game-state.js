// Shared room/identity state. Game-specific editor or rule state belongs to its game module.
export class GameState {
  constructor() {
    this.room = null; this.playerId = null; this.selected = null; this.busy = false; this.connected = false;
  }
  get me() { return this.room?.players.find(player => player.id === this.playerId); }
  get target() { return this.room?.players.find(player => player.id === this.selected) || this.me; }
  get hand() { return this.me?.hand || []; }
  accept(snapshot) {
    if (this.room?.code === snapshot.code && snapshot.revision < this.room.revision) return false;
    this.room = snapshot;
    if (!snapshot.players.some(player => player.id === this.selected)) this.selected = this.playerId;
    return true;
  }
  leave() { this.room = null; this.connected = false; this.selected = null; }
}
