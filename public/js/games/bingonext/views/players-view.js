import { $ } from '../dom.js';
import { TeamRosterView } from '../../../views/team-roster-view.js';

// Adapt BingoNext's room shape and commands to the same roster used by Bridge Bingo.
export class PlayersView {
  constructor(actions) {
    this.roster = new TeamRosterView({ list: $('players'), controls: $('joinControls'), ownTeam: $('ownTeam'), ready: $('ready'),
      count: $('playerCount'), summary: $('presenceSummary') }, {
      onAssign: (playerId, teamId) => actions.team(playerId, teamId), onReady: () => actions.ready(),
      onCaptain: (teamId, playerId) => actions.captain(teamId, playerId)
    });
  }
  render({ room, me, playerId, busy, connected }) {
    this.roster.render({ teams: room.teams.map(team => ({ ...team, rewardCount: team.rewards.length,
      turn: team.playerIds.includes(room.turn) ? room.turn : null })), members: room.players, viewerId: playerId,
      hostId: room.host, phase: room.phase, busy, connected, playersPerTeam: room.playersPerTeam, goal: room.goal,
      selectedTeamId: me?.teamId || room.players.find(player => player.id === playerId)?.teamId, sharedHands: true, paused: Boolean(room.activeCard) });
    if (!this.clockTimer && room.phase === 'playing') {
      this.clockTimer = setInterval(() => this.roster.updateClocks(), 250);
      this.clockTimer.unref?.();
    }
    if (room.phase !== 'playing') this.hide();
  }

  hide() { clearInterval(this.clockTimer); this.clockTimer = null; }
}
