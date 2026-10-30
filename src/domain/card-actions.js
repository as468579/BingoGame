'use strict';

const { randomUUID } = require('node:crypto');
const { fail } = require('./errors');
const { demoCards } = require('./card-catalog');
const { isParticipant } = require('./participants');
const { advanceTurn } = require('./room');

function useCard(room, player, data) {
  if (!['lobby', 'playing'].includes(room.phase)) fail('本局已結束，請先重新開局。');
  if (room.activeCard || room.pending) fail('請先完成目前的作答或選號確認。', 409);
  if (!isParticipant(room, player.id)) fail('你尚未參與本局。', 403);
  if (room.phase === 'playing' && room.turn !== player.id) fail('請在自己的選號回合使用卡片。', 403);
  const card = demoCards.find(candidate => candidate.id === data.cardId);
  if (!card || player.usedDemoCards?.includes(card.id)) fail('這張卡片無法使用。');
  player.usedDemoCards ||= [];
  player.usedDemoCards.push(card.id);
  room.activeCard = { id: randomUUID(), playerId: player.id, cardId: card.id, stage: 'question' };
}

function session(room, data) {
  if (!room.activeCard || data.cardSessionId !== room.activeCard.id) fail('這次卡牌操作已結束，請查看最新狀態。', 409);
  return room.activeCard;
}

function answerCard(room, player, data) {
  const active = session(room, data);
  if (active.playerId !== player.id) fail('只有使用卡片的玩家可以作答。', 403);
  if (active.stage !== 'question') fail('此問題已回答。', 409);
  const card = demoCards.find(candidate => candidate.id === active.cardId);
  if (!Number.isInteger(data.choice) || data.choice < 0 || data.choice >= card.options.length) fail('請選擇有效的答案。');
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

module.exports = { useCard, answerCard, judgeCard, finishCard };
