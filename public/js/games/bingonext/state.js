import { GameState } from '../../state/game-state.js';

// The host edits BingoNext shared-board drafts independently of other game sessions.
export class BingoNextState extends GameState {
  constructor() {
    super();
    this.draft = [];
    this.draftDirty = false;
    this.settingsDirty = false;
  }

  accept(snapshot) {
    const previous = this.room;
    if (!super.accept(snapshot)) return false;
    if (!previous || previous.code !== snapshot.code || previous.boardVersion !== snapshot.boardVersion) {
      this.draftDirty = false;
      this.settingsDirty = false;
    }
    if (this.me && !this.draftDirty) this.draft = [...this.me.board];
    return true;
  }

  editCell(index, number) { this.draft[index] = number; this.draftDirty = true; }

  leave() {
    super.leave();
    this.draft = [];
    this.draftDirty = false;
    this.settingsDirty = false;
  }
}
