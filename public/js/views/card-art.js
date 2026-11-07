// All card icons share the same simple black line treatment.
const paths = Object.freeze({
  'math-symbols': 'M8 21h18 M17 12v18 M40 14l16 16 M56 14L40 30 M8 51h18 M40 47h18 M40 57h18',
  'pocket-watch': 'M26 14V8a6 6 0 0 1 12 0v6 M25 18h14 M32 22a24 24 0 1 0 0 48a24 24 0 1 0 0-48 M32 28v3 M32 61v3 M14 46h3 M47 46h3 M32 34v13l9 5',
  'light-bulb': 'M23 53v-5c0-7-10-10-10-23a19 19 0 0 1 38 0c0 13-10 16-10 23v5Z M23 59h18 M25 65h14 M29 71h6 M32 52V33 M25 28l7 5 7-5 M32 1V4 M5 13l5 3 M54 16l5-3 M2 31h6 M56 31h6',
  gift: 'M7 27h50v13H7Z M12 40v29h40V40 M27 27v42 M37 27v42 M32 27C10 27 12 6 23 11c6 3 9 16 9 16Z M32 27C54 27 52 6 41 11c-6 3-9 16-9 16Z',
  thinking: 'M12 14h40v32H31L19 58V46h-7Z M22 30h1 M31 30h1 M40 30h1 M12 63h1 M6 70h1',
  abacus: 'M9 10h46v56H9Z M9 25h9 M26 25h29 M9 39h25 M42 39h13 M9 53h9 M26 53h8 M42 53h13 M18 19h8v12h-8Z M34 33h8v12h-8Z M18 47h8v12h-8Z M34 47h8v12h-8Z',
  'near-line': 'M6 24h52v28H6Z M19 24v28 M32 24v28 M45 24v28 M9 39l3 3 4-7 M22 39l3 3 4-7 M35 39l3 3 4-7',
  flag: 'M14 68V10 M14 12C26 5 38 21 52 12v29c-14 9-26-9-38-1 M8 68h12',
  running: 'M39 10a6 6 0 1 0 0 12a6 6 0 1 0 0-12 M25 29l10-4 9 14 12 2 M34 26l-8 19 13 9-7 16 M27 45l-9 14H6 M25 29l-8 11H7',
  book: 'M32 20C23 12 14 12 5 16v44c9-4 18-4 27 4 9-8 18-8 27-4V16c-9-4-18-4-27 4Z M32 20v44 M12 25c4-1 8 0 12 2 M12 35c4-1 8 0 12 2 M12 45c4-1 8 0 12 2 M40 27c4-2 8-3 12-2 M40 37c4-2 8-3 12-2 M40 47c4-2 8-3 12-2',
  'book-cross': 'M32 20C23 12 14 12 5 16v44c9-4 18-4 27 4 9-8 18-8 27-4V16c-9-4-18-4-27 4Z M32 20v44 M12 25c4-1 8 0 12 2 M12 35c4-1 8 0 12 2 M12 45c4-1 8 0 12 2 M39 29l14 18 M53 29L39 47',
  'ordered-numbers': 'M4 38h14v22H4Z M25 26h14v22H25Z M46 14h14v22H46Z M10 45v9 M29 32h6l-6 9h6 M50 20h6l-4 5 4 5h-6 M8 68h45l-5-5 M53 68l-5 5',
  'double-six': 'M26 18C9 9 6 32 7 47c1 22 23 22 23 3C30 32 8 32 7 47 M56 18C39 9 36 32 37 47c1 22 23 22 23 3C60 32 38 32 37 47',
  'double-four': 'M22 12L6 45h23 M22 12v54 M52 12L36 45h23 M52 12v54',
  'double-five': 'M28 14H9v23c22-9 26 26 7 28-6 1-10-2-12-5 M58 14H39v23c22-9 26 26 7 28-6 1-10-2-12-5',
  'double-seven': 'M6 16h23L13 64 M35 16h23L42 64 M10 39h16 M39 39h16',
  'double-eight': 'M18 38a10 12 0 1 0 0-24a10 12 0 1 0 0 24 M18 38a11 13 0 1 0 0 26a11 13 0 1 0 0-26 M46 38a10 12 0 1 0 0-24a10 12 0 1 0 0 24 M46 38a11 13 0 1 0 0 26a11 13 0 1 0 0-26',
  'question-mark': 'M19 24a13 13 0 0 1 26 0c0 10-13 12-13 22v5 M32 63h1'
});

export function renderCardArt(container, symbol) {
  if (!Object.hasOwn(paths, symbol)) { container.replaceChildren(); container.textContent = symbol ?? ''; return; }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({ class: `card-${symbol}`, viewBox: '0 0 64 76', width: '56', height: '64', fill: 'none', stroke: '#111', 'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(name, value);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[symbol]);
  svg.append(path); container.replaceChildren(svg);
}
