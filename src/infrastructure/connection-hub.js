'use strict';

class ConnectionHub {
  constructor() { this.streams = new Map(); }

  isOnline(playerId) { return Boolean(this.streams.get(playerId)?.size); }

  subscribe(playerId, response) {
    if (!this.streams.has(playerId)) this.streams.set(playerId, new Set());
    this.streams.get(playerId).add(response);
    const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15000);
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      this.streams.get(playerId)?.delete(response);
      if (!this.streams.get(playerId)?.size) this.streams.delete(playerId);
    };
  }

  broadcast(playerIds, snapshot) {
    for (const id of playerIds) {
      const data = `data: ${JSON.stringify(typeof snapshot === 'function' ? snapshot(id) : snapshot)}\n\n`;
      for (const response of this.streams.get(id) || []) response.write(data);
    }
  }
}

module.exports = { ConnectionHub };
