'use strict';
const { fail } = require('../../domain/errors');
const { teams } = require('./teams');
const { startTurn } = require('./turns');

// Placeholder choices have no victory predicate. Captains choose; hosts may review selected goals.
function beginHiddenGoals(room) {
  if (teams(room).some(team => !team.captainId)) fail('請先為每隊指定隊長。');
  room.hiddenGoals = { choices: {}, offers: Object.fromEntries(teams(room).map(team => [team.id,
    [1, 2, 3].map(index => ({ id: `pending-${index}`, name: '待定', symbol: '?', effect: '隱藏勝利條件待定' }))])) };
  room.phase = 'choosing-goal';
  room.turn = null;
}

function chooseHiddenGoal(room, player, data) {
  if (room.phase !== 'choosing-goal') fail('目前不是選擇隱藏勝利條件的階段。', 409);
  const team = teams(room).find(candidate => candidate.id === player.teamId);
  if (!team || team.captainId !== player.id) fail('只有該隊隊長可以選擇隱藏勝利條件。', 403);
  if (room.hiddenGoals.choices[team.id]) fail('已選擇隱藏勝利條件，無法更換。', 409);
  if (!room.hiddenGoals.offers[team.id]?.some(card => card.id === data.goalId)) fail('請選擇有效的隱藏勝利條件。');
  room.hiddenGoals.choices[team.id] = data.goalId;
  if (teams(room).every(candidate => room.hiddenGoals.choices[candidate.id])) {
    room.phase = 'playing';
    startTurn(room);
  }
}

function privateHiddenGoal(room, player) {
  if (!room.hiddenGoals || !player || player.id === room.host || room.captains?.[player.teamId] !== player.id) return null;
  const options = room.hiddenGoals.offers[player.teamId] || [];
  const selected = options.find(card => card.id === room.hiddenGoals.choices[player.teamId]) || null;
  return { options: selected ? [] : options, selected };
}

function hostHiddenGoals(room, viewerId) {
  if (viewerId !== room.host || !room.hiddenGoals) return null;
  return teams(room).map(team => ({ teamId: team.id, teamName: team.name,
    selected: (room.hiddenGoals.offers[team.id] || []).find(card => card.id === room.hiddenGoals.choices[team.id]) || null }));
}

module.exports = { beginHiddenGoals, chooseHiddenGoal, privateHiddenGoal, hostHiddenGoals };
