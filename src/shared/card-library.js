'use strict';
const { randomInt } = require('node:crypto');
const { fail } = require('../domain/errors');

// Shared file format only. Each game owns its definitions and effect implementation.
function parseCards(entries) {
  if (!Array.isArray(entries)) throw new TypeError('卡牌庫必須是 JSON 陣列。');
  const ids = new Set();
  return entries.map((entry, index) => {
    const invalid = message => { throw new TypeError(`卡牌庫第 ${index + 1} 張：${message}`); };
    if (!entry || typeof entry !== 'object') invalid('卡牌格式錯誤。');
    if (typeof entry.id !== 'string' || !entry.id.trim() || ids.has(entry.id.trim())) invalid('id 必須非空且不可重複。');
    if (typeof entry.name !== 'string' || !entry.name.trim()) invalid('name 不可空白。');
    for (const field of ['symbol', 'theme', 'type', 'description', 'effect', 'effectId']) {
      if (entry[field] !== undefined && typeof entry[field] !== 'string') invalid(`${field} 必須是文字。`);
    }
    if (entry.enabled !== undefined && typeof entry.enabled !== 'boolean') invalid('enabled 必須是 true 或 false。');
    if (entry.questionDifficulty != null && !['簡單', '普通', '困難'].includes(entry.questionDifficulty)) invalid('questionDifficulty 必須是簡單、普通、困難或 null。');
    const id = entry.id.trim(); ids.add(id);
    return { symbol: '✦', theme: 'gold', type: '能力', description: '', effect: '能力待定', enabled: true, questionDifficulty: null,
      ...structuredClone(entry), id, name: entry.name.trim() };
  });
}

function chooseCard(cards, pick = randomInt) {
  const enabled = cards.filter(card => card.enabled !== false);
  if (!enabled.length) fail('這個遊戲的卡牌庫沒有啟用的卡片。');
  return enabled[pick(enabled.length)];
}

function publicCard(card) {
  const { answer, correctAnswer, questionDifficulty, difficulty, enabled, effectId, ...visible } = card;
  return visible;
}

module.exports = { parseCards, chooseCard, publicCard };
