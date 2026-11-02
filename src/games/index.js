'use strict';
const { fail } = require('../domain/errors');
const games = new Map([require('./bingo'), require('./bridge')].map(game => [game.id, game]));

function getGame(type = 'bingo') {
  const game = games.get(type);
  if (!game) fail('請選擇有效的遊戲。');
  return game;
}

module.exports = { getGame };
