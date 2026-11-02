import { element } from './dom.js';

// Game-neutral team UI. Adapters supply data and commands; this component owns all markup and interaction.
export class TeamRosterView {
  constructor({ list, controls, ownTeam, ready, count, summary }, { onAssign, onReady, onInspect } = {}) {
    Object.assign(this, { list, controls, ownTeam, ready, count, summary, onAssign, onReady, onInspect });
    list.className = 'team-roster-list';
    controls.className = 'team-roster-controls';
    ownTeam.className = 'team-roster-select';
    ownTeam.setAttribute('aria-label', '我的隊伍');
    ready.className = 'primary team-roster-ready';
    count.className = 'team-roster-total';
    if (summary) summary.className = 'team-roster-summary';
    const label = element('label', '', '我的隊伍');
    if (ownTeam.id) label.setAttribute('for', ownTeam.id);
    controls.replaceChildren(label, ownTeam, ready);
    ownTeam.onchange = () => {
      if (!ownTeam.disabled) this.onAssign?.(this.model.viewerId, ownTeam.value || null);
    };
    ready.onclick = () => {
      if (!ready.disabled) this.onReady?.(!this.viewer.ready);
    };
  }

  render(model) {
    this.model = model;
    const { teams, members, viewerId, hostId, phase, busy, connected, playersPerTeam, goal, selectedTeamId, activeTeamId, paused } = model;
    this.viewer = members.find(member => member.id === viewerId);
    const lobby = phase === 'lobby', disabled = busy || !connected || !lobby || paused;
    this.count.textContent = `${members.length} / ${teams.length * playersPerTeam} 人`;
    if (this.summary) this.summary.textContent = `在線 ${members.filter(member => member.online).length} 人 ／共 ${members.length} 人${lobby ? ` · ${members.filter(member => member.ready).length} 人已準備` : ''}`;
    this.controls.hidden = !lobby;
    this.ownTeam.replaceChildren(...this.options(teams));
    this.ownTeam.value = this.viewer?.teamId || '';
    this.ownTeam.disabled = Boolean(disabled);
    this.ready.textContent = this.viewer?.ready ? '取消準備' : '準備好了 ✓';
    this.ready.disabled = Boolean(disabled || !this.viewer?.teamId);
    const scroll = this.list.scrollTop;
    const groups = teams.map(team => {
      const group = element('section', `team-roster-team${team.id === selectedTeamId ? ' is-selected' : ''}`);
      const heading = element(this.onInspect ? 'button' : 'div', 'team-roster-heading', `${team.name} · ${team.lines} / ${goal} 條`);
      if (this.onInspect) { heading.type = 'button'; heading.onclick = () => this.onInspect(team.id); }
      if (team.id === activeTeamId) heading.append(element('span', 'team-roster-active', '出牌中'));
      group.append(heading);
      if (team.rewardCount !== undefined) group.append(element('p', 'team-roster-rewards', `獎品 ${team.rewardCount} 份`));
      members.filter(member => member.teamId === team.id).forEach(member => group.append(this.member(member, team.turn, disabled)));
      const size = members.filter(member => member.teamId === team.id).length;
      group.append(element('p', 'team-roster-count', `${size} / ${playersPerTeam} 人${phase === 'playing' && team.done ? ' · 本輪完成' : ''}`));
      return group;
    });
    const unassigned = members.filter(member => !member.teamId);
    if (unassigned.length) {
      const group = element('section', 'team-roster-team');
      group.append(element('strong', 'team-roster-unassigned', '未分隊'));
      unassigned.forEach(member => group.append(this.member(member, null, disabled)));
      groups.push(group);
    }
    this.list.replaceChildren(...groups);
    this.list.scrollTop = scroll;
  }

  member(member, turn, disabled) {
    const { phase, viewerId, hostId, teams } = this.model;
    const row = element('div', `team-roster-member${phase === 'playing' && turn === member.id ? ' is-turn' : ''}`);
    row.append(element('strong', '', `${phase === 'playing' && turn === member.id ? '▶ ' : ''}${member.name}${member.id === viewerId ? '（你）' : ''}`),
      element('span', '', `${member.online ? '●' : '○ 離線'} · ${phase === 'lobby' ? member.ready ? '已準備' : '未準備' : `手牌 ${member.handCount} 張`}`));
    if (phase === 'lobby' && hostId === viewerId) {
      const select = element('select', 'team-roster-select');
      select.setAttribute('aria-label', `分配 ${member.name} 的隊伍`);
      select.append(...this.options(teams));
      select.value = member.teamId || ''; select.disabled = Boolean(disabled);
      select.onchange = () => { if (!select.disabled) this.onAssign?.(member.id, select.value || null); };
      row.append(select);
    }
    return row;
  }

  options(teams) {
    const none = element('option', '', '未分隊'); none.value = '';
    return [none, ...teams.map(team => { const option = element('option', '', team.name); option.value = team.id; return option; })];
  }
}
