export class PublicAddress {
  constructor(storage = localStorage) { this.storage = storage; }
  get value() { return this.storage.getItem('bingo-public-origin') || ''; }

  save(value) {
    if (!value.trim()) { this.storage.removeItem('bingo-public-origin'); return false; }
    const address = new URL(value.trim());
    if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password ||
      address.pathname !== '/' || address.search || address.hash) throw new Error('Invalid public address');
    this.storage.setItem('bingo-public-origin', address.origin);
    return true;
  }

  invitation(code, fallbackOrigin) { return `${this.value || fallbackOrigin}/join?room=${code}`; }
}
