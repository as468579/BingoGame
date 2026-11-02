import { element } from './dom.js';

// Shared card stock and face/back artwork; games supply their own content and actions.
export function cardFace({ tag = 'div', className = '', type, art, name, description, footer }) {
  const card = element(tag, `game-card game-card-front ${className}`.trim());
  if (tag === 'button') card.type = 'button';
  if (type) card.append(element('span', 'game-card-type spell-type', type));
  card.append(element('strong', 'game-card-art spell-art', art));
  if (name) card.append(element('strong', 'spell-name', name));
  if (description) card.append(element('span', 'spell-description', description));
  if (footer) card.append(element('span', 'spell-lock', footer));
  return card;
}

export function cardBack(className = '') {
  const card = element('div', `game-card game-card-back ${className}`.trim());
  card.setAttribute('aria-hidden', 'true');
  const anchor = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  anchor.setAttribute('class', 'card-back-anchor');
  anchor.setAttribute('viewBox', '0 0 100 120');
  anchor.setAttribute('aria-hidden', 'true');
  anchor.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M50 28 a10 10 0 1 0 0 -20 a10 10 0 1 0 0 20 M50 28 V105 M28 44 H72 M12 70 C12 94 29 105 50 105 C71 105 88 94 88 70 M6 78 L12 67 L24 74 M76 74 L88 67 L94 78');
  anchor.append(path);
  card.append(anchor);
  return card;
}
