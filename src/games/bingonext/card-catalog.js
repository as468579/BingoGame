'use strict';
const { parseCards, chooseCard, publicCard } = require('../../shared/card-library');
const cards = parseCards(require('./cards.json'));
module.exports = { cards, demoCards: cards, publicCard, drawCardDefinition: () => chooseCard(cards) };
