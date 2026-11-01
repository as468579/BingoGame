'use strict';

const { randomUUID, randomInt } = require('node:crypto');
const { fail } = require('./errors');
const { demoCards, publicCard } = require('./card-catalog');
const { addToHand, removeFromHand } = require('./hand');
const { isParticipant } = require('./participants');
const { advanceTurn } = require('./room');

function drawForNumber(player) {
  const definition = demoCards[randomInt(demoCards.length)];
  return addToHand(player, { ...publicCard(definition), definitionId: definition.id });
}

function useCard(room, player, data) {
  if (!['lobby', 'playing'].includes(room.phase)) fail('本局已結束，請先重新開局。');
  if (room.activeCard || room.pending) fail('請先完成目前的作答或選號確認。', 409);
  if (!isParticipant(room, player.id)) fail('你尚未參與本局。', 403);
  if (room.phase === 'playing' && room.turn !== player.id) fail('請在自己的選號回合使用卡片。', 403);
  const held = player.hand.find(candidate => candidate.id === data.cardId);
  const card = demoCards.find(candidate => candidate.id === (held?.definitionId || data.cardId));
  if (!card || (!held && player.usedDemoCards?.includes(card.id))) fail('這張卡片無法使用。');
  const handIndex = held ? player.hand.indexOf(held) : -1;
  if (held) removeFromHand(player, held.id);
  else {
    player.usedDemoCards ||= [];
    player.usedDemoCards.push(card.id);
  }
  room.activeCard = { id: randomUUID(), playerId: player.id, cardId: card.id, stage: 'question',
    returnCard: held || null, handIndex, undoDepth: room.history?.length || 0 };
}

function cancelCard(room, player, data) {
  const active = session(room, data);
  if (active.playerId !== player.id) fail('只有使用卡片的玩家可以取消使用。', 403);
  if (active.stage !== 'question') fail('答案已提交，無法取消使用卡片。', 409);
  const previous = room.history?.at(-1);
  const legacy = !Object.hasOwn(active, 'returnCard') && previous?.playerStates?.find(state => state.id === player.id);
  if (legacy) {
    player.hand = structuredClone(legacy.hand);
    player.usedDemoCards = structuredClone(legacy.usedDemoCards || []);
  } else if (active.returnCard) player.hand.splice(Math.max(0, active.handIndex), 0, active.returnCard);
  else player.usedDemoCards = (player.usedDemoCards || []).filter(id => id !== active.cardId);
  if (room.phase === 'playing' && (legacy || room.history?.length === active.undoDepth + 1)) room.history.pop();
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

module.exports = { useCard, cancelCard, answerCard, judgeCard, finishCard, drawForNumber };
