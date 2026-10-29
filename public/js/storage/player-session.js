import { uuid } from '../utils.js';

export class PlayerSession {
  constructor(tabStorage = sessionStorage, sharedStorage = localStorage) {
    this.storage = tabStorage;
    this.token = tabStorage.getItem('bingo-token');
    if (this.token) return;
    const legacyToken = sharedStorage.getItem('bingo-token');
    this.token = legacyToken || uuid();
    tabStorage.setItem('bingo-token', this.token);
    if (!legacyToken) return;
    for (const key of ['bingo-name', 'bingo-room']) {
      const value = sharedStorage.getItem(key);
      if (value) tabStorage.setItem(key, value);
    }
    for (const key of ['bingo-token', 'bingo-name', 'bingo-room']) sharedStorage.removeItem(key);
  }

  get name() { return this.storage.getItem('bingo-name') || ''; }
  get roomCode() { return this.storage.getItem('bingo-room') || ''; }

  remember(token, name, code) {
    this.token = token;
    this.storage.setItem('bingo-token', token);
    this.storage.setItem('bingo-name', name.trim());
    this.storage.setItem('bingo-room', code);
  }

  clearRoom() { this.storage.removeItem('bingo-room'); }
  clearName() { this.storage.removeItem('bingo-name'); }
}
