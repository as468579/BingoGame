// SVG primitives shared by illustrated game introductions.
export function node(tag, attrs = {}, text) {
  const result = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) result.setAttribute(key, String(value));
  if (text !== undefined) result.textContent = text;
  return result;
}
export function add(parent, tag, attrs, text) { const result = node(tag, attrs, text); parent.append(result); return result; }
export function picture(width, height, label) {
  return node('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': label, focusable: 'false', class: 'game-guide-picture' });
}
export function text(root, x, y, value, size = 20, color = '#5e5136') {
  add(root, 'text', { x, y, 'text-anchor': 'middle', 'font-size': size, 'font-family': 'Microsoft JhengHei, sans-serif', fill: color }, value);
}
export function arrow(root, x, y, length = 42) {
  add(root, 'path', { d: `M${x} ${y}h${length}m-10-8 10 8-10 8`, fill: 'none', stroke: '#927a4d', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
}
