import { element } from './dom.js';

// Shared card stock and face/back artwork; games supply their own content and actions.
export function cardFace({ tag = 'div', className = '', type, art, name, description, footer, watermark = false }) {
  const card = element(tag, `game-card game-card-front ${className}`.trim());
  if (tag === 'button') card.type = 'button';
  if (type) card.append(element('span', 'game-card-type spell-type', type));
  if (art !== undefined) {
    const artwork = element('strong', 'game-card-art spell-art');
    renderCardArt(artwork, art);
    card.append(artwork);
  }
  if (name) card.append(element('strong', 'spell-name', name));
  if (description) card.append(element('span', 'spell-description', description));
  if (footer) card.append(element('span', 'spell-lock', footer));
  if (watermark) card.append(anchorArtwork('card-anchor-watermark'));
  return card;
}

export function cardBack(className = '') {
  const card = element('div', `game-card game-card-back ${className}`.trim());
  card.setAttribute('aria-hidden', 'true');
  card.append(anchorArtwork('card-back-anchor'));
  return card;
}

export function renderCardArt(container, symbol) {
  if (symbol === 'gift') {
    const gift = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [name, value] of Object.entries({ class: 'card-gift', viewBox: '0 0 64 76', width: '56', height: '64', fill: 'none', stroke: '#111', 'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) gift.setAttribute(name, value);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M7 27h50v13H7Z M12 40v29h40V40 M27 27v42 M37 27v42 M32 27C10 27 12 6 23 11c6 3 9 16 9 16Z M32 27C54 27 52 6 41 11c-6 3-9 16-9 16Z');
    gift.append(path); container.replaceChildren(gift); return;
  }
  if (symbol === 'light-bulb') {
    const bulb = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [name, value] of Object.entries({ class: 'card-light-bulb', viewBox: '0 0 64 76', width: '56', height: '64', fill: 'none', stroke: '#111', 'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) bulb.setAttribute(name, value);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M23 53v-5c0-7-10-10-10-23a19 19 0 0 1 38 0c0 13-10 16-10 23v5Z M23 59h18 M25 65h14 M29 71h6 M32 52V33 M25 28l7 5 7-5 M32 1V4 M5 13l5 3 M54 16l5-3 M2 31h6 M56 31h6');
    bulb.append(path); container.replaceChildren(bulb); return;
  }
  if (symbol !== 'pocket-watch') { container.textContent = symbol; return; }
  const watch = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({ class: 'card-pocket-watch', viewBox: '0 0 64 76', width: '56', height: '64', fill: 'none', stroke: '#111', 'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) watch.setAttribute(name, value);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M26 14V8a6 6 0 0 1 12 0v6 M25 18h14 M32 22a24 24 0 1 0 0 48a24 24 0 1 0 0-48 M32 28v3 M32 61v3 M14 46h3 M47 46h3 M32 34v13l9 5');
  watch.append(path);
  container.replaceChildren(watch);
}

function anchorArtwork(className) {
  const anchor = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  anchor.setAttribute('class', className);
  anchor.setAttribute('viewBox', '0 0 100 120');
  anchor.setAttribute('aria-hidden', 'true');
  anchor.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M50 28 a10 10 0 1 0 0 -20 a10 10 0 1 0 0 20 M50 28 V105 M28 44 H72 M12 70 C12 94 29 105 50 105 C71 105 88 94 88 70 M6 78 L12 67 L24 74 M76 74 L88 67 L94 78');
  anchor.append(path);
  return anchor;
}
