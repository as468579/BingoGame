'use strict';
const { randomInt } = require('node:crypto');
const { fail } = require('../../domain/errors');

function parseQuestions(entries) {
  if (!Array.isArray(entries)) throw new TypeError('題庫必須是 JSON 陣列。');
  const ids = new Set();
  return entries.map((entry, index) => {
    const invalid = reason => { throw new TypeError(`題庫第 ${index + 1} 題：${reason}`); };
    if (!entry || typeof entry !== 'object') invalid('題目格式錯誤。');
    if (typeof entry.id !== 'string' || !entry.id.trim() || ids.has(entry.id.trim())) invalid('id 必須非空且不可重複。');
    if (typeof entry.question !== 'string' || !entry.question.trim()) invalid('題目不可空白。');
    if (!Array.isArray(entry.options) || entry.options.length < 2 || entry.options.length > 4 || entry.options.some(option => typeof option !== 'string' || !option.trim())) invalid('請提供 2～4 個非空白文字選項。');
    const blankAnswer = entry.correctAnswer == null || (typeof entry.correctAnswer === 'string' && !entry.correctAnswer.trim());
    const letter = typeof entry.correctAnswer === 'string' ? entry.correctAnswer.trim().toUpperCase() : '';
    const answer = blankAnswer ? null : 'ABCD'.indexOf(letter);
    if (!blankAnswer && (letter.length !== 1 || answer < 0 || answer >= entry.options.length)) invalid('correctAnswer 必須對應現有選項的 A～D，或留空。');
    if (entry.enabled !== undefined && typeof entry.enabled !== 'boolean') invalid('enabled 必須是 true 或 false。');
    if (entry.category !== undefined && typeof entry.category !== 'string') invalid('category 必須是文字。');
    if (entry.difficulty !== undefined && !['簡單', '普通', '困難'].includes(entry.difficulty)) invalid('difficulty 必須是簡單、普通或困難。');
    const id = entry.id.trim(); ids.add(id);
    return { id, category: entry.category?.trim() || '未分類', difficulty: entry.difficulty ?? '普通', question: entry.question.trim(), options: entry.options.map(option => option.trim()), answer, enabled: entry.enabled ?? true };
  });
}

const questions = parseQuestions(require('./questions.json'));
function chooseQuestion(pick = randomInt, bank = questions, difficulty = null) {
  if (difficulty !== null && !['簡單', '普通', '困難'].includes(difficulty)) fail('卡牌題目設定無效，請聯絡房主。');
  const enabled = bank.filter(question => question.enabled && (difficulty === null || question.difficulty === difficulty));
  if (!enabled.length) fail('題庫沒有啟用的可用題目，請房主先更新題庫。');
  return enabled[pick(enabled.length)];
}
function findQuestion(id) { return questions.find(question => question.id === id); }
module.exports = { questions, chooseQuestion, findQuestion, parseQuestions };
