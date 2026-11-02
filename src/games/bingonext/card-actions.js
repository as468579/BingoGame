'use strict';

const { randomUUID, randomInt } = require('node:crypto');
const { fail } = require('../../domain/errors');
const { demoCards, publicCard } = require('./card-catalog');
const { addToHand, removeFromHand } = require('./hand');
const { isParticipant } = require('./participants');
const { advanceTurn } = require('./turns');
const { teamHand } = require('./team-hands');
const { chooseQuestion, findQuestion } = require('./question-bank');

function drawForNumber(player) {
  const definition = demoCards[randomInt(demoCards.length)];
  const { question, options, ...face } = publicCard(definition);
  return addToHand(player, { ...face, definitionId: definition.id });
}

function useCard(room, player, data) {
  if (room.phase !== 'playing') fail('請在遊戲進行中的自己的回合使用卡片。');
  if (room.activeCard || room.pending) fail('請先完成目前的作答或選號確認。', 409);
  if (!isParticipant(room, player.id)) fail('你尚未參與本局。', 403);
  if (room.phase === 'playing' && room.turn !== player.id) fail('請在自己的選號回合使用卡片。', 403);
  if (!player.teamId) fail('請先加入隊伍。', 403);
  const hand = teamHand(room, player.teamId);
  const held = hand.find(candidate => candidate.id === data.cardId);
  const card = held && demoCards.find(candidate => candidate.id === held.definitionId);
  if (!card) fail('這張卡片不在你的隊伍手牌中。');
  const question = chooseQuestion();
  const handIndex = hand.indexOf(held);
  removeFromHand({ hand }, held.id);
  room.activeCard = { id: randomUUID(), playerId: player.id, teamId: player.teamId, cardId: card.id, questionId: question.id, stage: 'question',
    returnCard: held, handIndex, undoDepth: room.history?.length || 0 };
}

function cancelCard(room, player, data) {
  const active = session(room, data);
  if (active.playerId !== player.id) fail('只有使用卡片的玩家可以取消使用。', 403);
  if (active.stage !== 'question') fail('答案已提交，無法取消使用卡片。', 409);
  if (active.returnCard) teamHand(room, active.teamId).splice(Math.max(0, active.handIndex), 0, active.returnCard);
  if (room.history?.length === active.undoDepth + 1) room.history.pop();
  room.activeCard = null;
}

function session(room, data) {
  if (!room.activeCard || data.cardSessionId !== room.activeCard.id) fail('這次卡牌操作已結束，請查看最新狀態。', 409);
  return room.activeCard;
}

function answerCard(room, player, data) {
  const active = session(room, data);
  if (active.playerId !== player.id) fail('只有使用卡片的玩家可以作答。', 403);
  if (active.stage !== 'question') fail('此問題已回答。', 409);
  const question = findQuestion(active.questionId || active.cardId);
  if (!question || !Number.isInteger(data.choice) || data.choice < 0 || data.choice >= question.options.length) fail('請選擇有效的答案。');
  Object.assign(active, { stage: 'review', choice: data.choice });
}

function judgeCard(room, player, data) {
  if (room.host !== player.id) fail('只有房主可以判定回答是否正確。', 403);
  const active = session(room, data);
  if (active.stage !== 'review') fail('目前沒有等待判定的答案。', 409);
  if (typeof data.correct !== 'boolean') fail('請選擇回答正確或回答錯誤。');
  Object.assign(active, { stage: 'result', correct: data.correct });
}

function finishCard(room, player, data) {
  const active = session(room, data);
  if (room.host !== player.id && (active.playerId !== player.id || active.stage !== 'result')) {
    fail('請等待作答完成，或由房主結束作答。', 403);
  }
  room.activeCard = null;
  if (room.phase === 'playing') advanceTurn(room);
}

module.exports = { useCard, cancelCard, answerCard, judgeCard, finishCard, drawForNumber };
