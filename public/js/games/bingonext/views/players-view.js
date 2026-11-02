import { $ } from '../dom.js';
import { TeamRosterView } from '../../../views/team-roster-view.js';

// Adapt BingoNext's room shape and commands to the same roster used by Bridge Bingo.
export class PlayersView {
  constructor(actions) {
    this.roster = new TeamRosterView({ list: $('players'), controls: $('joinControls'), ownTeam: $('ownTeam'), ready: $('ready'),
      count: $('playerCount'), summary: $('presenceSummary') }, {
      onAssign: (playerId, teamId) => actions.team(playerId, teamId), onReady: () => actions.ready()
    });
  }
  render({ room, me, playerId, busy, connected }) {
    this.roster.render({ teams: room.teams.map(team => ({ ...team, rewardCount: team.rewards.length,
      turn: team.playerIds.includes(room.turn) ? room.turn : null })), members: room.players, viewerId: playerId,
      hostId: room.host, phase: room.phase, busy, connected, playersPerTeam: room.playersPerTeam, goal: room.goal,
      selectedTeamId: me?.teamId || room.players.find(player => player.id === playerId)?.teamId, paused: Boolean(room.activeCard) });
  }
}
