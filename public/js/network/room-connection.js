export class RoomConnection {
  constructor({ onConnection, onSnapshot, EventSourceType = EventSource }) {
    Object.assign(this, { onConnection, onSnapshot, EventSourceType });
    this.source = null;
  }

  open(code, token) {
    this.close();
    const source = new this.EventSourceType(`/events?code=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`);
    this.source = source;
    source.onopen = () => { if (this.source === source) this.onConnection(true); };
    source.onmessage = event => {
      if (this.source !== source) return;
      this.onConnection(true);
      this.onSnapshot(JSON.parse(event.data));
    };
    source.onerror = () => { if (this.source === source) this.onConnection(false); };
  }

  close() { this.source?.close(); this.source = null; }
}
