'use strict';
const ANSWER_TIME_MS = 60000;

function ensureQuestionDeadline(room, now = Date.now()) {
  if (room.activeCard?.stage === 'question' && !Number.isFinite(room.activeCard.answerDeadlineAt)) {
    room.activeCard.answerDeadlineAt = now + ANSWER_TIME_MS;
  }
}

function expireQuestion(room, now = Date.now()) {
  const active = room.activeCard;
  if (active?.stage !== 'question' || !Number.isFinite(active.answerDeadlineAt) || now < active.answerDeadlineAt) return false;
  active.stage = 'review'; active.timedOut = true;
  delete active.choice;
  return true;
}

module.exports = { ANSWER_TIME_MS, ensureQuestionDeadline, expireQuestion };
