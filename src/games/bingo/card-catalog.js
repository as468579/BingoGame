'use strict';
const { parseCards, chooseCard, publicCard } = require('../../shared/card-library');
const cards = parseCards(require('./cards.json'));
for (const card of cards) {
  if (typeof card.question !== 'string' || !card.question.trim() || !Array.isArray(card.options) || card.options.length < 2 || card.options.length > 4 ||
      card.options.some(option => typeof option !== 'string' || !option.trim()) || !Number.isInteger(card.answer) || card.answer < 0 || card.answer >= card.options.length) {
    throw new TypeError(`Bingo 卡牌 ${card.id} 必須設定題目、2～4 個選項及有效的 answer 索引。`);
  }
}
module.exports = { cards, demoCards: cards, publicCard, drawCardDefinition: () => chooseCard(cards) };
