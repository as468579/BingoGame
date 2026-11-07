'use strict';
const { teams } = require('./teams');
const { advanceTurn } = require('./turns');
const { settleVictory } = require('./victory');
const { fail } = require('../../domain/errors');
const { participants, isCaptain } = require('./participants');
const DEFAULT_TEAM_MINUTES = 8;
const TEAM_TIME_MS = DEFAULT_TEAM_MINUTES * 60 * 1000;
const OVERTIME_TURN_MS = 3000;

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

function overtimeState(room, now = Date.now()) {
  const overtime = room.teamClock?.overtime;
  if (room.phase !== 'playing' || !overtime || overtime.playerId !== room.turn) return null;
  const member = room.players.find(player => player.id === room.turn);
  if (!member || remainingTime(room, member.teamId, now) > 0) return null;
  const elapsed = overtime.startedAt === null ? 0 : Math.max(0, now - overtime.startedAt);
  return { playerId: overtime.playerId, remainingMs: Math.max(0, overtime.remainingMs - elapsed), running: overtime.startedAt !== null };
}

// Called after a successful action. Failed actions leave the running deadline intact.
function syncTeamClock(room, now = Date.now()) {
  const clock = room.teamClock;
  if (!clock) return;
  if (clock.activeTeamId) clock.remaining[clock.activeTeamId] = remainingTime(room, clock.activeTeamId, now);
  if (clock.overtime?.startedAt !== null && clock.overtime?.startedAt !== undefined) {
    clock.overtime.remainingMs = Math.max(0, clock.overtime.remainingMs - Math.max(0, now - clock.overtime.startedAt));
    clock.overtime.startedAt = null;
  }
  if (clock.overtime?.playerId !== room.turn || room.phase !== 'playing') clock.overtime = null;
  clock.activeTeamId = null; clock.startedAt = null;
  if (room.phase !== 'playing' || room.activeCard || room.hint || room.hiddenGoalGuess) return;
  let member = room.players.find(player => player.id === room.turn);
  if (member && (isCaptain(room, member.id) || member.id === room.host)) {
    const teammates = participants(room).filter(player => player.teamId === member.teamId);
    if (teammates.length) room.turn = teammates[(room.turnCursors?.[member.teamId] || 0) % teammates.length].id;
    else advanceTurn(room);
    member = room.players.find(player => player.id === room.turn);
  }
  if (room.phase === 'playing' && member) {
    clock.activeTeamId = member.teamId; clock.startedAt = now;
    if ((clock.remaining[member.teamId] ?? teamBudgetMs(room)) <= 0) {
      if (clock.overtime?.playerId !== member.id) clock.overtime = { playerId: member.id, remainingMs: OVERTIME_TURN_MS, startedAt: null };
      clock.overtime.startedAt = now;
    } else clock.overtime = null;
  }
}

// A delayed timer may cross multiple deadlines. Charge each team only for its actual interval.
function expireTeamClock(room, now = Date.now()) {
  let changed = false;
  while (room.phase === 'playing' && room.teamClock?.activeTeamId && !room.activeCard && !room.hint && !room.hiddenGoalGuess) {
    const clock = room.teamClock, teamId = clock.activeTeamId;
    const overtime = clock.overtime;
    const deadline = overtime ? overtime.startedAt + overtime.remainingMs : clock.startedAt + clock.remaining[teamId];
    if (now < deadline) break;
    clock.remaining[teamId] = 0; clock.activeTeamId = null; clock.startedAt = null;
    clock.overtime = null;
    changed = true;
    if (!settleVictory(room, undefined, deadline) && overtime) advanceTurn(room);
    syncTeamClock(room, deadline);
  }
  return changed;
}

module.exports = { DEFAULT_TEAM_MINUTES, TEAM_TIME_MS, OVERTIME_TURN_MS, teamBudgetMs, validateTeamMinutes, initializeTeamClock, remainingTime, overtimeState, syncTeamClock, expireTeamClock, addTeamTime };
