import { $, element } from '../../views/dom.js';
import { BridgeBoardView, colorNames } from './board-view.js';
import { copyRoomCode } from '../../views/copy-room-code.js';

export class BridgeRoomView {
  constructor(actions = {}, notify = () => {}) {
    this.actions = actions;
    this.board = new BridgeBoardView(actions);
    $('bridgeCopyCode').onclick = () => copyRoomCode(this.state.room.code, $('bridgeRoomCode'), notify);
    for (const id of ['bridgeTeamCount', 'bridgePlayersPerTeam', 'bridgeSize']) $(id).oninput = () => { this.settingsDirty = true; };
    $('bridgeApplySettings').onclick = () => {
      this.actions.bridge('bridgeSettings', { teamCount: Number($('bridgeTeamCount').value),
        playersPerTeam: Number($('bridgePlayersPerTeam').value), size: Number($('bridgeSize').value) });
      this.settingsDirty = false;
    };
    $('bridgeOwnTeam').onchange = () => this.actions.bridge('bridgeTeam', { teamId: $('bridgeOwnTeam').value || null });
    $('bridgeReady').onclick = () => this.actions.bridge('bridgeReady', { ready: !this.state.me.ready });
    $('bridgeStart').onclick = () => this.actions.bridge('bridgeStart');
    $('bridgeScan').onclick = () => this.actions.bridge('bridgeScan');
    $('bridgeReset').onclick = () => { if (confirm('重新開局會清空出牌與手牌，讓所有人重新準備，確定嗎？')) this.actions.bridge('bridgeReset'); };
    $('bridgeCloseResults').onclick = () => this.closeResults();
    $('bridgeViewResults').onclick = () => { if (!$('bridgeResultDialog').open) $('bridgeResultDialog').showModal(); };
  }

  render(state) {
    this.state = state;
    const { room, me, playerId, busy, connected } = state;
    const game = room.bridge;
    const activeTeam = game.teams.find(team => team.id === game.activeTeamId);
    const key = `${room.code}:${room.boardVersion}:${playerId}`;
    const opening = room.phase === 'finished' && (this.phase !== 'finished' || this.key !== key);
    if (this.key !== key) { this.viewedTeam = null; this.settingsDirty = false; this.closeResults(); }
    if (this.ownTeamId !== me.teamId) this.viewedTeam = null;
    this.ownTeamId = me.teamId;
    this.key = key; this.phase = room.phase;
    const viewed = game.teams.find(team => team.id === this.viewedTeam) || game.teams.find(team => team.id === me.teamId) || game.teams[0];
    this.viewedTeam = viewed.id;
    document.title = 'Bridge Bingo · Alberta Events';
    $('bridgeGame').hidden = false;
    $('bridgeRoomCode').textContent = room.code;
    $('bridgePlayerCount').textContent = `${room.players.length} / ${game.teamCount * game.playersPerTeam} 人`;
    $('bridgeSettingsPanel').hidden = room.host !== playerId || room.phase !== 'lobby';
    if (!this.settingsDirty) { $('bridgeTeamCount').value = game.teamCount; $('bridgePlayersPerTeam').value = game.playersPerTeam; $('bridgeSize').value = room.size; }
    for (const id of ['bridgeTeamCount', 'bridgePlayersPerTeam', 'bridgeSize', 'bridgeApplySettings']) $(id).disabled = busy || !connected;
    this.renderTeams(room, playerId, busy || !connected);
    $('bridgeOwnTeam').replaceChildren(...this.teamOptions(game.teams)); $('bridgeOwnTeam').value = me.teamId || '';
    $('bridgeOwnTeam').disabled = busy || !connected;
    $('bridgeJoinControls').hidden = room.phase !== 'lobby';
    $('bridgeReady').textContent = me.ready ? '取消準備' : '準備好了 ✓';
    $('bridgeReady').disabled = busy || !connected || !me.teamId;
    $('bridgeBoardTitle').textContent = `${viewed.name}${viewed.id === me.teamId ? '（你的隊伍）' : ''}`;
    $('bridgeLineCount').textContent = `${viewed.lines} / ${room.goal} 條線`;
    $('bridgeRound').textContent = room.phase === 'lobby' ? `${game.teamCount} 隊 · 每隊 ${game.playersPerTeam} 人 · ${room.size} × ${room.size}` : `第 ${game.round} 輪 · 每人一張${activeTeam ? ` · ${activeTeam.name} 出牌中` : ''}`;
    $('bridgeLeadColor').textContent = viewed.leadColor ? `指定顏色：${colorNames[viewed.leadColor]}` : '指定顏色：首位出牌決定';
    const turnPlayer = room.players.find(player => player.id === viewed.turn);
    $('bridgeStatus').textContent = room.phase === 'lobby' ? '每隊滿員並全員準備後，由房主開始。'
      : room.phase === 'finished' ? '本局已結束，可查看各隊盤面與結果。'
        : viewed.done ? '本隊已完成這一輪，等待其他隊伍一起結算。'
          : activeTeam && activeTeam.id !== viewed.id ? `目前由 ${activeTeam.name} 出牌，請等待輪到${viewed.name}。`
          : viewed.turn === playerId ? '輪到你出牌：先選手牌，再點亮起的空格。' : `等待 ${turnPlayer?.name || '隊員'} 出牌${turnPlayer && !turnPlayer.online ? '（離線，等待重連）' : '…'}`;
    this.board.render(state, viewed);
    $('bridgeStart').hidden = room.host !== playerId || room.phase !== 'lobby';
    $('bridgeScan').hidden = room.host !== playerId || room.phase !== 'lobby';
    $('bridgeScan').disabled = busy || !connected;
    $('bridgeScanHint').hidden = room.host !== playerId || room.phase !== 'lobby';
    $('bridgeScanHint').textContent = room.lastScanAt ? `上次掃描移除 ${room.lastScanRemovedCount} 位離線玩家，目前 ${room.players.length} 人。`
      : '重新掃描會移除已斷線的玩家，保留在線玩家的隊伍與準備狀態。';
    $('bridgeStart').disabled = busy || !connected || room.players.length !== game.teamCount * game.playersPerTeam ||
      room.players.some(player => !player.ready || !player.teamId) || game.teams.some(team => team.playerIds.length !== game.playersPerTeam);
    $('bridgeReset').hidden = room.host !== playerId || room.phase === 'lobby'; $('bridgeReset').disabled = busy || !connected;
    $('bridgeViewResults').hidden = room.phase !== 'finished';
    if (room.phase === 'finished') {
      const winners = game.teams.filter(team => room.winners.includes(team.id));
      $('bridgeResultTitle').textContent = winners.length > 1 ? '比賽結束・平手' : '比賽結束';
      $('bridgeResultText').textContent = winners.length > 1 ? `${winners.map(team => team.name).join('、')} 同輪達標，並列獲勝！`
        : winners.length ? `${winners[0].name} 獲勝！` : '所有隊伍完成比賽！';
      $('bridgeResultScores').replaceChildren(...game.teams.map(team => element('p', '', `${team.name}：${team.lines} 條線`)));
      if (opening && !$('bridgeResultDialog').open) $('bridgeResultDialog').showModal();
    } else this.closeResults();
  }

  teamOptions(teams) {
    const none = element('option', '', '未分隊'); none.value = '';
    return [none, ...teams.map(team => { const option = element('option', '', team.name); option.value = team.id; return option; })];
  }

  renderTeams(room, playerId, disabled) {
    const teams = room.bridge.teams.map(team => {
      const group = element('section', `bridge-team${team.id === this.viewedTeam ? ' active' : ''}`);
      const heading = element('button', 'bridge-team-heading', `${team.name} · ${team.lines} / ${room.goal} 條`);
      if (room.bridge.activeTeamId === team.id) heading.append(element('span', 'bridge-active-team-label', '出牌中'));
      heading.onclick = () => { this.viewedTeam = team.id; this.board.selected = null; this.render(this.state); };
      group.append(heading);
      room.players.filter(player => player.teamId === team.id).forEach(player => group.append(this.member(player, room, team.turn, playerId, disabled)));
      group.append(element('p', 'bridge-team-count', `${team.playerIds.length} / ${room.bridge.playersPerTeam} 人${room.phase === 'playing' && team.done ? ' · 本輪完成' : ''}`));
      return group;
    });
    const unassigned = room.players.filter(player => !player.teamId);
    if (unassigned.length) {
      const group = element('section', 'bridge-team'); group.append(element('strong', '', '未分隊'));
      unassigned.forEach(player => group.append(this.member(player, room, null, playerId, disabled))); teams.push(group);
    }
    $('bridgeTeams').replaceChildren(...teams);
  }

  member(player, room, turn, viewerId, disabled) {
    const row = element('div', `bridge-member${turn === player.id ? ' is-turn' : ''}`);
    row.append(element('strong', '', `${turn === player.id ? '▶ ' : ''}${player.name}${player.id === viewerId ? '（你）' : ''}`),
      element('span', '', `${player.online ? '●' : '○ 離線'} · ${room.phase === 'lobby' ? player.ready ? '已準備' : '未準備' : `${player.handCount} 張`}`));
    if (room.phase === 'lobby' && room.host === viewerId) {
      const select = element('select'); select.setAttribute('aria-label', `分配 ${player.name} 的隊伍`);
      select.append(...this.teamOptions(room.bridge.teams)); select.value = player.teamId || ''; select.disabled = disabled;
      select.onchange = () => this.actions.bridge('bridgeTeam', { playerId: player.id, teamId: select.value || null }); row.append(select);
    }
    return row;
  }

  closeResults() { if ($('bridgeResultDialog').open) $('bridgeResultDialog').close(); }
  hide() { $('bridgeGame').hidden = true; this.closeResults(); this.key = null; this.phase = null; this.board.hide(); }
}
