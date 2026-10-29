export class GameState {
  constructor() {
    this.room = null;
    this.playerId = null;
    this.selected = null;
    this.busy = false;
    this.connected = false;
    this.draft = [];
    this.draftDirty = false;
    this.settingsDirty = false;
  }

  get me() { return this.room?.players.find(player => player.id === this.playerId); }
  get target() { return this.room?.players.find(player => player.id === this.selected) || this.me; }

  accept(snapshot) {
    if (this.room?.code === snapshot.code && snapshot.revision < this.room.revision) return false;
    if (this.room && (this.room.code !== snapshot.code || this.room.boardVersion !== snapshot.boardVersion)) {
      this.draftDirty = false;
      this.settingsDirty = false;
    }
    this.room = snapshot;
    if (!snapshot.players.some(player => player.id === this.selected)) this.selected = this.playerId;
    if (this.me && !this.draftDirty) this.draft = [...this.me.board];
    return true;
  }

  editCell(index, number) {
    this.draft[index] = number;
    this.draftDirty = true;
  }

  leave() {
    this.room = null;
    this.connected = false;
    this.draftDirty = false;
    this.settingsDirty = false;
  }
}
