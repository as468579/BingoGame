'use strict';
const teamId = index => `team-${index + 1}`;
function teams(room) {
  return Array.from({ length: room.teamCount }, (_, index) => ({ id: teamId(index), name: `隊伍 ${index + 1}` }));
}
function assignPlayer(room, player) {
  if (player.teamId || room.phase !== 'lobby') return;
  player.teamId = teams(room).find(team => room.players.filter(p => p.teamId === team.id).length < room.playersPerTeam)?.id || null;
}
module.exports = { teams, teamId, assignPlayer };
