'use strict';
const { randomUUID } = require('node:crypto');
const { requireHost } = require('../../domain/room-access');
const { fail } = require('../../domain/errors');
const PAGE_COUNT = 6;

function introductionTime(room, now = Date.now()) {
  return room.introduction?.open ? room.introduction.pausedAt : now;
}

function updateIntroduction(room, player, data, presence, now = Date.now()) {
  requireHost(room, player, '只有房主可以同步遊戲介紹。');
  if (!['lobby', 'choosing-goal', 'playing'].includes(room.phase)) fail('目前無法同步遊戲介紹。', 409);
  if (typeof data.open !== 'boolean') fail('請提供有效的介紹狀態。');
  const previous = room.introduction;
  if (data.sessionId) {
    if (!previous?.open || previous.id !== data.sessionId) fail('這次介紹已結束，請查看最新狀態。', 409);
  } else if (!data.open || previous?.open) fail('請提供目前介紹的識別碼。', 409);
  if (data.open && (!Number.isInteger(data.page) || data.page < 0 || data.page >= PAGE_COUNT)) fail('無效的介紹頁面。');
  if (!data.open) {
    const elapsed = Math.max(0, now - previous.pausedAt);
    if (room.activeCard?.stage === 'question' && Number.isFinite(room.activeCard.answerDeadlineAt)) room.activeCard.answerDeadlineAt += elapsed;
    if (room.hint && Number.isFinite(room.hint.endsAt)) room.hint.endsAt += elapsed;
  }
  room.introduction = { id: previous?.open ? previous.id : randomUUID(), version: (previous?.version || 0) + 1,
    open: data.open, page: data.open ? data.page : previous.page, pausedAt: previous?.open ? previous.pausedAt : now };
}

function publicIntroduction(room) {
  const guide = room.introduction;
  return guide ? { id: guide.id, version: guide.version, open: guide.open, page: guide.page } : null;
}

module.exports = { PAGE_COUNT, introductionTime, updateIntroduction, publicIntroduction };
