// Existing rule tests proceed past setup; dedicated hidden-goal tests exercise it directly.
const { randomUUID } = require('node:crypto');
const { createIdentity } = require('../../src/domain/identity');
const HOST_ACTIONS = new Set(['settings', 'start', 'reset', 'undo', 'skip', 'scan', 'rerollPrizes', 'board', 'captain', 'cardJudge', 'cardNextQuestion', 'cardFinish']);
function separateHost(room) {
  const former = room.players.find(player => player.id === room.host);
  if (former && !former.teamId) former.teamId = 'team-1';
  const manager = { ...createIdentity('Test Manager', randomUUID()), teamId: null, ready: false, hand: [], usedDemoCards: [] };
  room.players.push(manager); room.host = manager.id;
  return manager;
}
function hostAction(room, player, kind) {
  return player.id === room.players[0].id && HOST_ACTIONS.has(kind) ? room.players.find(member => member.id === room.host) : player;
}
function prepareCaptains(room) {
  const members = room.players.filter(player => player.id !== room.host);
  if (room.phase !== 'lobby' || members.some(player => !player.ready || !player.teamId) ||
      new Set(members.map(player => player.teamId)).size !== room.teamCount) return;
  room.captains ||= {};
  for (let index = 1; index <= room.teamCount; index++) {
    const teamId = `team-${index}`, members = room.players.filter(player => player.teamId === teamId);
    if (members.length && !members.some(player => player.id === room.captains[teamId])) {
      const captain = { ...createIdentity(`Captain ${index}`, randomUUID()), teamId, ready: true, hand: [], usedDemoCards: [] };
      room.players.push(captain);
      room.captains[teamId] = captain.id;
      room.playersPerTeam = Math.max(room.playersPerTeam, members.length + 1);
    }
  }
}
function completeGoalSelection(room, choose) {
  if (room.phase !== 'choosing-goal') return;
  for (let index = 1; index <= room.teamCount; index++) {
    const captain = room.players.find(player => player.id === room.captains[`team-${index}`]);
    choose(captain, 'pending-1');
  }
}
module.exports = { prepareCaptains, completeGoalSelection, separateHost, hostAction, HOST_ACTIONS };
