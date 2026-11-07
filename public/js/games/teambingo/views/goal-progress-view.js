import { $, element } from '../dom.js';

// Render only the server's last round report; never derive live progress from cells.
export class GoalProgressView {
  constructor() {
    this.panel = $('goalProgressPanel');
    this.list = $('goalProgressList');
  }
  render({ room }) {
    const teams = room.teams.filter(team => team.hiddenProgress);
    this.panel.hidden = !teams.length;
    const scroll = this.list.scrollTop;
    this.list.replaceChildren(...teams.map(team => {
      const section = element('section', 'team-roster-team');
      const report = team.hiddenProgress;
      section.append(element('h3', 'team-roster-heading', team.name), element('p', 'team-roster-count', report.round ? `第 ${report.round} 輪結算` : '等待本輪結算'));
      const list = element('ol', 'goal-progress-conditions');
      report.conditions.forEach((condition, index) => {
        const item = element('li', 'team-roster-member');
        const row = element('div', 'goal-progress-row');
        row.append(element('strong', '', `條件 ${index + 1}`),
          element('span', 'goal-progress-value', `：目前進度 ${condition.percentage} %`));
        item.append(row);
        list.append(item);
      });
      section.append(list); return section;
    }));
    this.list.scrollTop = scroll;
  }
  hide() { this.panel.hidden = true; this.list.replaceChildren(); }
}
