'use strict';
const { findQuestion } = require('./question-bank');
const ANSWER_TIMES_MS = Object.freeze({ '簡單': 10000, '普通': 20000, '困難': 30000 });

function answerTimeMs(question) {
  return ANSWER_TIMES_MS[question?.difficulty] ?? ANSWER_TIMES_MS['普通'];
}

function ensureQuestionDeadline(room, now = Date.now()) {
  if (room.activeCard?.stage === 'question' && !Number.isFinite(room.activeCard.answerDeadlineAt)) {
    room.activeCard.answerDeadlineAt = now + answerTimeMs(room.activeCard.question || findQuestion(room.activeCard.questionId || room.activeCard.cardId));
  }
}

function expireQuestion(room, now = Date.now()) {
  const active = room.activeCard;
  if (active?.stage !== 'question' || !Number.isFinite(active.answerDeadlineAt) || now < active.answerDeadlineAt) return false;
  active.stage = 'review'; active.timedOut = true;
  delete active.choice;
  return true;
}

module.exports = { answerTimeMs, ensureQuestionDeadline, expireQuestion };
