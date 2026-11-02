export class BridgeController {
  constructor(app) { this.app = app; }
  actions() { return { bridge: (kind, data = {}) => this.app.command(kind, data) }; }
}
