import { element } from './dom.js';
import { bindDialogDismiss } from './dialog.js';

// Shared read-only host guide: games supply content and illustrations, never game actions.
export class GameIntroductionView {
  constructor({ lookup, ids, sections, illustration, supplement, contentKey = room => `${room.size}:${room.goal}`, phases = ['lobby', 'playing'] }) {
    this.sections = sections; this.illustration = illustration; this.supplement = supplement; this.getContentKey = contentKey; this.phases = phases;
    this.button = lookup(ids.button); this.dialog = lookup(ids.dialog); this.body = lookup(ids.body);
    this.previous = lookup(ids.previous); this.next = lookup(ids.next); this.pageLabel = lookup(ids.page);
    this.page = 0; this.pages = [];
    this.previous.onclick = () => this.showPage(this.page - 1);
    this.next.onclick = () => this.showPage(this.page + 1);
    this.dialog.onkeydown = event => {
      if (!this.available || !this.dialog.open || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); this.showPage(this.page + (event.key === 'ArrowRight' ? 1 : -1));
    };
    this.button.onclick = () => {
      if (!this.available || this.dialog.open) return;
      this.dialog.scrollTop = 0; this.body.scrollTop = 0; this.dialog.showModal();
    };
    bindDialogDismiss({ dialog: this.dialog, closeButton: lookup(ids.close) });
  }

  render({ room, playerId }) {
    const key = `${room.code}:${playerId}`;
    const changedRoom = this.key !== key;
    if (changedRoom) { this.close(); this.page = 0; }
    this.key = key;
    this.available = playerId === room.host && this.phases.includes(room.phase);
    this.button.hidden = !this.available;
    if (!this.available) { this.close(); return; }
    const contentKey = this.getContentKey(room);
    if (this.contentKey === contentKey) { if (changedRoom) this.showPage(0); return; }
    this.contentKey = contentKey;
    this.pages = this.sections(room).map(([title, rules, subsection], index) => {
      const section = element('section', 'game-introduction-section');
      const list = element('ul');
      list.append(...rules.map(rule => {
        if (typeof rule === 'object') {
          const item = element('li', 'game-introduction-topic');
          item.append(element('h4', 'game-introduction-topic-title', rule.title), element('p', '', rule.description));
          return item;
        }
        if (!rule.startsWith('遊戲訣竅：')) return element('li', '', rule);
        const tip = element('li', 'game-introduction-tip');
        tip.append(element('strong', '', '遊戲訣竅：'), element('span', '', rule.slice('遊戲訣竅：'.length)));
        return tip;
      }));
      const heading = element('h3', '', title);
      const supplement = this.supplement?.(index, room);
      if (supplement?.heading) {
        const header = element('div', 'game-introduction-heading');
        header.append(heading, supplement.heading); section.append(header);
      } else section.append(heading);
      const illustration = this.illustration(index, room);
      if (illustration) section.append(illustration);
      section.append(list);
      if (supplement?.content) section.append(supplement.content);
      else if (supplement && !supplement.heading) section.append(supplement);
      if (subsection) {
        const extra = element('ul'); extra.append(...subsection[1].map(rule => element('li', '', rule)));
        section.append(element('h4', '', subsection[0]));
        if (subsection[2]) section.append(this.illustration(subsection[2], room));
        section.append(extra);
      }
      return section;
    });
    this.body.replaceChildren(...this.pages);
    this.showPage(Math.min(this.page, this.pages.length - 1));
  }

  showPage(index) {
    if (!this.available || index < 0 || index >= this.pages.length) return;
    this.page = index;
    this.pages.forEach((page, position) => { page.hidden = position !== index; });
    this.previous.disabled = index === 0; this.next.disabled = index === this.pages.length - 1;
    this.pageLabel.textContent = `${index + 1} / ${this.pages.length}`;
    this.body.scrollTop = 0;
  }

  close() { if (this.dialog.open) this.dialog.close(); }
  hide() { this.close(); this.available = false; this.key = null; this.contentKey = null; this.button.hidden = true; this.body.replaceChildren(); this.pages = []; this.page = 0; this.pageLabel.textContent = ''; this.previous.disabled = this.next.disabled = true; }
}
