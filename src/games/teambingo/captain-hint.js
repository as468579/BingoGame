'use strict';
const { randomUUID } = require('node:crypto');
const { fail } = require('../../domain/errors');
const { isCaptain } = require('./participants');
const { syncTeamClock } = require('./team-clock');
const HINT_TIME_MS = 30000;
const INITIAL_HINT_USES = 3;

function hintUses(room, teamId) { return room.hintUsesRemaining?.[teamId] ?? INITIAL_HINT_USES; }
function addHintUses(room, teamId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) fail('提示增加次數必須是正整數。');
  if (!room.players.some(player => player.teamId === teamId)) fail('無效的隊伍。');
  room.hintUsesRemaining ||= {};
  room.hintUsesRemaining[teamId] = hintUses(room, teamId) + amount;
  room.hintBonuses ||= {};
  room.hintBonuses[teamId] = (room.hintBonuses[teamId] || 0) + amount;
}

function startHint(room, player, data, presence, now = Date.now()) {
  if (!isCaptain(room, player.id)) fail('只有隊長可以提示隊員。', 403);
  if (room.phase !== 'playing') fail('請在遊戲進行中提示隊員。');
  if (room.hint || room.activeCard) fail('請先完成目前的提示或作答。', 409);
  const current = room.players.find(member => member.id === room.turn);
  if (current?.teamId !== player.teamId) fail('請在自己隊伍的回合提示隊員。', 403);
  const remaining = hintUses(room, player.teamId);
  if (remaining <= 0) fail('本隊提示次數已用完。', 409);
  room.hintUsesRemaining ||= {};
  room.hintUsesRemaining[player.teamId] = remaining - 1;
  room.hint = { id: randomUUID(), teamId: player.teamId, captainId: player.id, endsAt: now + HINT_TIME_MS };
}

function expireHint(room, now = Date.now()) {
  if (!room.hint || now < room.hint.endsAt) return false;
  const endedAt = room.hint.endsAt;
  room.hint = null;
  syncTeamClock(room, endedAt);
  return true;
}

function endHint(room, player, data, presence, now = Date.now()) {
  if (room.phase !== 'playing' || !room.hint || room.hint.id !== data.hintId) fail('這次提示已結束，請查看最新狀態。', 409);
  if (player.id !== room.host && (player.id !== room.hint.captainId || !isCaptain(room, player.id))) fail('只有發起提示的隊長或房主可以提早結束。', 403);
  const endedAt = Math.min(now, room.hint.endsAt);
  room.hint = null;
  syncTeamClock(room, endedAt);
}

module.exports = { HINT_TIME_MS, INITIAL_HINT_USES, hintUses, addHintUses, startHint, expireHint, endHint };
