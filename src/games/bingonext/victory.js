'use strict';
const { teams } = require('./teams');
const { teamLines } = require('./prizes');
const { winningLineGoal } = require('./board');

// Reserved for the future hidden rule. No condition can trigger it yet.
function hasHiddenVictory(room, teamId) { return false; }

function winningTeams(room, hiddenRule = hasHiddenVictory) {
  return teams(room).filter(team => teamLines(room, team.id) >= winningLineGoal() || hiddenRule(room, team.id)).map(team => team.id);
}

function settleVictory(room, hiddenRule = hasHiddenVictory) {
  if (room.phase !== 'playing') return false;
  room.winners = winningTeams(room, hiddenRule);
  const full = room.cells.every(cell => cell.isCovered);
  if (!room.winners.length && !full) return false;
  if (!room.winners.length) {
    // Preserve the existing full-board tie settlement when every team is blocked.
    const best = Math.max(...teams(room).map(team => teamLines(room, team.id)));
    room.winners = teams(room).filter(team => teamLines(room, team.id) === best).map(team => team.id);
  }
  room.phase = 'finished'; room.turn = null;
  return true;
}

module.exports = { hasHiddenVictory, winningTeams, settleVictory };
