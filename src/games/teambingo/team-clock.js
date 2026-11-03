'use strict';
const { teams } = require('./teams');
const { advanceTurn } = require('./turns');
const { settleVictory } = require('./victory');
const { fail } = require('../../domain/errors');
const DEFAULT_TEAM_MINUTES = 8;
const TEAM_TIME_MS = DEFAULT_TEAM_MINUTES * 60 * 1000;

function validateTeamMinutes(minutes) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) fail('每隊行動時間請設定為 1～120 分鐘的整數。');
  return minutes;
}
function teamBudgetMs(room) { return (room.teamTimeMinutes ?? DEFAULT_TEAM_MINUTES) * 60000; }

function initializeTeamClock(room, now = Date.now()) {
  room.teamClock = { remaining: Object.fromEntries(teams(room).map(team => [team.id, teamBudgetMs(room)])), bonuses: {}, activeTeamId: null, startedAt: null };
  syncTeamClock(room, now);
}

function addTeamTime(room, teamId, amount, now = Date.now()) {
  if (!room.teamClock) initializeTeamClock(room, now);
  const clock = room.teamClock;
  if (clock.activeTeamId === teamId) {
    clock.remaining[teamId] = remainingTime(room, teamId, now);
    clock.startedAt = now;
  }
  clock.remaining[teamId] = (clock.remaining[teamId] ?? teamBudgetMs(room)) + amount;
  clock.bonuses ||= {};
  clock.bonuses[teamId] = (clock.bonuses[teamId] || 0) + amount;
}

function remainingTime(room, teamId, now = Date.now()) {
  const clock = room.teamClock;
  const saved = clock?.remaining[teamId] ?? teamBudgetMs(room);
  const elapsed = clock?.activeTeamId === teamId && clock.startedAt !== null ? Math.max(0, now - clock.startedAt) : 0;
  return Math.max(0, saved - elapsed);
}

// Called after a successful action. Failed actions leave the running deadline intact.
function syncTeamClock(room, now = Date.now()) {
  const clock = room.teamClock;
  if (!clock) return;
  if (clock.activeTeamId) clock.remaining[clock.activeTeamId] = remainingTime(room, clock.activeTeamId, now);
  clock.activeTeamId = null; clock.startedAt = null;
  if (room.phase !== 'playing' || room.activeCard) return;
  let member = room.players.find(player => player.id === room.turn);
  if (member && (clock.remaining[member.teamId] ?? teamBudgetMs(room)) <= 0) {
    advanceTurn(room);
    member = room.players.find(player => player.id === room.turn);
  }
  if (room.phase === 'playing' && member) { clock.activeTeamId = member.teamId; clock.startedAt = now; }
}

// A delayed timer may cross multiple deadlines. Charge each team only for its actual interval.
function expireTeamClock(room, now = Date.now()) {
  let changed = false;
  while (room.phase === 'playing' && room.teamClock?.activeTeamId && !room.activeCard) {
    const clock = room.teamClock, teamId = clock.activeTeamId;
    const deadline = clock.startedAt + clock.remaining[teamId];
    if (now < deadline) break;
    clock.remaining[teamId] = 0; clock.activeTeamId = null; clock.startedAt = null;
    changed = true;
    if (!settleVictory(room)) advanceTurn(room);
    syncTeamClock(room, deadline);
  }
  return changed;
}

module.exports = { DEFAULT_TEAM_MINUTES, TEAM_TIME_MS, teamBudgetMs, validateTeamMinutes, initializeTeamClock, remainingTime, syncTeamClock, expireTeamClock, addTeamTime };
