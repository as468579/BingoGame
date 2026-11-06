'use strict';

const { randomUUID } = require('node:crypto');
const { fail } = require('../../domain/errors');
const { demoCards, publicCard, drawCardDefinition } = require('./card-catalog');
const { addToHand, removeFromHand } = require('./hand');
const { isParticipant, isCaptain } = require('./participants');
const { advanceTurn } = require('./turns');
const { teamHand } = require('./team-hands');
const { chooseQuestion, findQuestion } = require('./question-bank');
const { settleVictory } = require('./victory');
const { answerTimeMs } = require('./question-clock');
const { applyCardEffect } = require('./card-effects');

function drawForNumber(player, definition = drawCardDefinition()) {
  const { question, options, ...face } = publicCard(definition);
  return addToHand(player, { ...face, definitionId: definition.id });
}

function useCard(room, player, data, presence, now = Date.now()) {
  if (player.id === room.host) fail('房主為觀戰模式，不能使用隊伍手牌。', 403);
  if (isCaptain(room, player.id)) fail('隊長為觀戰模式，不能使用隊伍手牌。', 403);
  if (room.phase !== 'playing') fail('請在遊戲進行中的自己的回合使用卡片。');
  if (room.activeCard || room.pending) fail('請先完成目前的作答或選號確認。', 409);
  if (!isParticipant(room, player.id)) fail('你尚未參與本局。', 403);
  if (room.phase === 'playing' && room.turn !== player.id) fail('請在自己的選號回合使用卡片。', 403);
  if (!player.teamId) fail('請先加入隊伍。', 403);
  const hand = teamHand(room, player.teamId);
  const held = hand.find(candidate => candidate.id === data.cardId);
  const card = held && demoCards.find(candidate => candidate.id === held.definitionId);
  if (!card) fail('這張卡片不在你的隊伍手牌中。');
  const question = chooseQuestion(undefined, undefined, null, room.usedQuestionIds || []);
  const handIndex = hand.indexOf(held);
  removeFromHand({ hand }, held.id);
  (room.usedQuestionIds ||= []).push(question.id);
  room.activeCard = { id: randomUUID(), playerId: player.id, teamId: player.teamId, cardId: card.id, questionId: question.id, question: structuredClone(question), stage: 'question',
    answerDeadlineAt: now + answerTimeMs(question), returnCard: held, handIndex, undoDepth: room.history?.length || 0 };
}

function cancelCard(room, player, data, presence, now = Date.now()) {
  const active = session(room, data);
  if (active.playerId !== player.id) fail('只有使用卡片的玩家可以取消使用。', 403);
  if (active.timedOut) fail('作答時間已結束，請等待房主判定。', 409);
  if (active.stage !== 'question') fail('答案已提交，無法取消使用卡片。', 409);
  if (Number.isFinite(active.answerDeadlineAt) && now >= active.answerDeadlineAt) fail('作答時間已結束，無法取消使用卡片。', 409);
  fail('作答開始後無法取消，請提交答案或等待房主判定。', 409);
}

function session(room, data) {
  if (!room.activeCard || data.cardSessionId !== room.activeCard.id) fail('這次卡牌操作已結束，請查看最新狀態。', 409);
  return room.activeCard;
}

function answerCard(room, player, data, presence, now = Date.now()) {
  const active = session(room, data);
  if (active.playerId !== player.id) fail('只有使用卡片的玩家可以作答。', 403);
  if (active.timedOut) fail('作答時間已結束，請等待房主判定。', 409);
  if (active.stage !== 'question') fail('此問題已回答。', 409);
  if (Number.isFinite(active.answerDeadlineAt) && now >= active.answerDeadlineAt) fail('作答時間已結束，請等待房主判定。', 409);
  const question = active.question || findQuestion(active.questionId || active.cardId);
  if (question?.type === 'oral') {
    if (data.answered !== true) fail('請在口頭回答完成後按「已回答」。');
    Object.assign(active, { stage: 'review', answered: true });
    return;
  }
  if (!question || !Number.isInteger(data.choice) || data.choice < 0 || data.choice >= question.options.length) fail('請選擇有效的答案。');
  Object.assign(active, { stage: 'review', choice: data.choice });
}

function judgeCard(room, player, data, presence, now = Date.now()) {
  if (room.host !== player.id) fail('只有房主可以判定回答是否正確。', 403);
  const active = session(room, data);
  if (active.stage !== 'review') fail('目前沒有等待判定的答案。', 409);
  if (typeof data.correct !== 'boolean') fail('請選擇回答正確或回答錯誤。');
  Object.assign(active, { stage: 'result', correct: data.correct });
  applyCardEffect(room, active, demoCards.find(card => card.id === active.cardId), now);
  const totals = room[data.correct ? 'teamCorrectAnswers' : 'teamWrongAnswers'] ||= {};
  totals[active.teamId] = (totals[active.teamId] || 0) + 1;
}

function nextQuestion(room, player, data, presence, now = Date.now()) {
  if (room.host !== player.id) fail('只有房主可以換下一題。', 403);
  const active = session(room, data);
  if (!['question', 'review'].includes(active.stage)) fail('答案已判定，無法換下一題。', 409);
  const definition = demoCards.find(card => card.id === active.cardId);
  if (!definition) fail('找不到這張卡片的設定。');
  const used = [...new Set([...(room.usedQuestionIds || []), active.questionId || active.question?.id].filter(Boolean))];
  const question = chooseQuestion(undefined, undefined, null, used);
  room.usedQuestionIds = [...used, question.id];
  Object.assign(active, { id: randomUUID(), questionId: question.id, question: structuredClone(question), stage: 'question', answerDeadlineAt: now + answerTimeMs(question) });
  for (const field of ['choice', 'answered', 'timedOut', 'correct', 'effectApplied']) delete active[field];
}

function finishCard(room, player, data, presence, now = Date.now()) {
  const active = session(room, data);
  if (room.host !== player.id && (active.playerId !== player.id || active.stage !== 'result')) {
    fail('請等待作答完成，或由房主結束作答。', 403);
  }
  applyCardEffect(room, active, demoCards.find(card => card.id === active.cardId), now);
  room.activeCard = null;
  if (room.phase === 'playing' && !settleVictory(room, undefined, now)) advanceTurn(room);
}

module.exports = { useCard, cancelCard, answerCard, judgeCard, nextQuestion, finishCard, drawForNumber };
