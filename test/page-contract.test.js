const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Validate public markup contracts without a browser dependency. Interactive views are tested separately.
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const tags = [...html.matchAll(/<([a-z][\w:-]*)\b([^<>]*?)\/?>/gi)].map(match => ({
  name: match[1].toLowerCase(), start: match.index, end: match.index + match[0].length,
  attrs: Object.fromEntries([...match[2].matchAll(/([^\s=]+)\s*=\s*(["'])(.*?)\2/g)].map(attribute => [attribute[1], attribute[3]]))
}));
const hasClass = (tag, name) => (tag.attrs.class || '').split(/\s+/).includes(name);
const byId = id => {
  const tag = tags.find(tag => tag.attrs.id === id);
  assert.ok(tag, `Missing public element: ${id}`);
  return tag;
};
function content(tag) {
  const end = html.indexOf(`</${tag.name}>`, tag.end);
  assert.ok(end >= tag.end, `Missing closing tag for ${tag.name}`);
  return html.slice(tag.end, end);
}
const text = tag => content(tag).replace(/<[^>]*>/g, '').trim();

test('page IDs are unique and labels and accessibility relationships resolve across all game roots', () => {
  const ids = tags.filter(tag => tag.attrs.id).map(tag => tag.attrs.id);
  assert.equal(new Set(ids).size, ids.length, 'Duplicate IDs can bind controls to the wrong game');
  for (const id of ['welcome', 'game', 'bridgeGame', 'next-root']) byId(id);
  for (const tag of tags) for (const attribute of ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls']) {
    for (const id of (tag.attrs[attribute] || '').split(/\s+/).filter(Boolean)) {
      assert.ok(ids.includes(id), `${tag.name} ${attribute} points to missing ${id}`);
    }
  }
});

test('header exposes Alberta once with a leading decorative anchor and a single readable marquee phrase', () => {
  const brand = tags.find(tag => tag.name === 'a' && hasClass(tag, 'brand'));
  assert.ok(brand); assert.equal(brand.attrs.href, '/'); assert.equal(text(brand), 'Alberta');
  const anchor = tags.find(tag => hasClass(tag, 'brand-anchor'));
  assert.equal(anchor.name, 'svg'); assert.equal(anchor.attrs['aria-hidden'], 'true');
  assert.equal(anchor.attrs.focusable, 'false'); assert.ok(content(brand).trimStart().startsWith('<svg'));
  const marquee = tags.find(tag => hasClass(tag, 'tag-marquee'));
  const copies = tags.filter(tag => hasClass(tag, 'tag-copy'));
  assert.equal(copies.length, 1, 'Marquee must not duplicate the phrase');
  assert.equal(text(copies[0]), '好帕魯不怕吃苦，大家一起努力練等');
  assert.notEqual(copies[0].attrs['aria-hidden'], 'true');
  assert.ok(brand.start < marquee.start && marquee.start < byId('connection').start);
  const footer = tags.find(tag => tag.name === 'footer');
  assert.doesNotMatch(text(footer), /alberta/i);
  assert.ok(byId('switchPlayer').start > footer.start); assert.ok(byId('leave').start > footer.start);
});

test('simplified login keeps its accessible title and create/join controls without obsolete introduction content', () => {
  assert.equal(text(byId('loginTitle')), '登入');
  const entry = tags.find(tag => hasClass(tag, 'entry'));
  assert.equal(entry.attrs['aria-labelledby'], 'loginTitle');
  for (const id of ['name', 'code']) {
    assert.equal(byId(id).name, 'input');
    assert.ok(tags.some(tag => tag.name === 'label' && tag.attrs.for === id), `${id} needs a label`);
  }
  for (const id of ['create', 'join']) assert.equal(byId(id).name, 'button');
  assert.equal(tags.some(tag => hasClass(tag, 'intro')), false);
  for (const id of ['welcomeTitle', 'welcomeText', 'entryTitle', 'entryHint']) assert.equal(tags.some(tag => tag.attrs.id === id), false);
});

test('Chinese game selection and Team Bingo board title retain stable game and route identifiers', () => {
  const options = tags.filter(tag => tag.name === 'option' && tag.start > byId('gameType').start && tag.start < html.indexOf('</select>', byId('gameType').end));
  assert.deepEqual(options.map(tag => [tag.attrs.value, text(tag)]), [
    ['bingo', '單人賓果'], ['bridge-bingo', '橋牌賓果'], ['teambingo', '團隊賓果']
  ]);
  const teamTitle = tags.find(tag => hasClass(tag, 'bingo-sign') && tag.start > byId('next-root').start);
  const titleMarkup = content(teamTitle).split('<span')[0].trim();
  assert.equal(titleMarkup, 'Team Bingo');
  const settings = byId('next-boardSize');
  const selected = tags.find(tag => tag.name === 'option' && tag.start > settings.start && tag.start < html.indexOf('</select>', settings.end) && /\bselected\b/.test(html.slice(tag.start, tag.end)));
  assert.equal(selected.attrs.value, '6');
});

test('draw panels stay disabled while Team Bingo exposes a card award notification dialog', () => {
  assert.equal(tags.some(tag => hasClass(tag, 'draw-card-panel')), false);
  for (const prefix of ['', 'next-']) {
    for (const id of ['openHand', 'handPanel', 'sharedCardDialog']) byId(prefix + id);
  }
  assert.equal(tags.some(tag => tag.attrs.id === 'drawnCardDialog'), false);
  assert.equal(byId('next-drawnCardDialog').name, 'dialog');
  assert.equal(byId('next-hiddenGoalDialog').name, 'dialog');
  assert.equal(tags.some(tag => tag.attrs.id === 'next-cancelSharedCard'), false);
  for (const id of ['sharedCardDialog', 'next-sharedCardDialog', 'next-hiddenGoalDialog']) assert.ok(hasClass(byId(id), 'game-dialog'));
  assert.ok(tags.some(tag => tag.name === 'link' && tag.attrs.href === '/styles/game-dialog.css'));
  assert.equal(byId('next-viewHiddenGoal').name, 'button');
  assert.equal(byId('next-hintDialog').name, 'dialog');
  assert.equal(byId('next-captainHint').name, 'button');
  assert.equal(byId('next-hintProgress').name, 'circle');
  assert.doesNotMatch(content(byId('next-drawnCardDialog')), /drawn-card-caption|獲得一張效果卡/);
  assert.doesNotMatch(content(byId('next-openHand')), /inventory-slots|✧|❈|☽/);
  assert.match(content(byId('next-openHand')), /隊伍手牌/);
  assert.equal(text(byId('next-closeDrawnCard')), '知道了');
  const layouts = tags.filter(tag => hasClass(tag, 'game-layout'));
  assert.equal(layouts.length, 2); assert.ok(layouts.every(tag => hasClass(tag, 'no-draw')));
});
