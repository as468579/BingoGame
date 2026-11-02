'use strict';
const teamId = index => `team-${index + 1}`;
function teams(room) {
  return Array.from({ length: room.teamCount }, (_, index) => {
    const id = teamId(index), captainId = room.captains?.[id];
    return { id, name: `隊伍 ${index + 1}`, captainId: room.players?.some(player => player.id === captainId && player.teamId === id) ? captainId : null };
  });
}
function assignPlayer(room, player) {
  if (player.teamId || room.phase !== 'lobby') return;
  player.teamId = teams(room).find(team => room.players.filter(p => p.teamId === team.id).length < room.playersPerTeam)?.id || null;
}
module.exports = { teams, teamId, assignPlayer };
