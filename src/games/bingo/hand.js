'use strict';

const { randomUUID } = require('node:crypto');

function createHand() { return []; }

// Server-side extension points only. Card definitions, effects and dealing rules are not defined yet.
function addToHand(player, cardData = {}) {
  const card = { ...structuredClone(cardData), id: randomUUID() };
  player.hand.push(card);
  return card;
}

function removeFromHand(player, cardId) {
  const index = player.hand.findIndex(card => card.id === cardId);
  return index < 0 ? undefined : player.hand.splice(index, 1)[0];
}

module.exports = { createHand, addToHand, removeFromHand };
