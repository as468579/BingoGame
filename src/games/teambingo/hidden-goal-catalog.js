'use strict';
module.exports = Object.freeze([
  { id: 'multiples-of-six', name: '6的倍數', symbol: 'math-symbols', divisor: 6, reward: { item: '突襲券', quantity: 14 }, effect: '同隊圈選盤面上所有6的倍數。' },
  { id: 'multiples-of-seven', name: '7的倍數', symbol: 'math-symbols', divisor: 7, reward: { item: '突襲券', quantity: 14 }, effect: '同隊圈選盤面上所有7的倍數。' },
  { id: 'pending-1', name: '待定', symbol: 'question-mark', effect: '隱藏勝利條件待定' },
  { id: 'anticipate-opponent', name: '料敵機先', symbol: 'thinking', reward: { item: '飄雪結晶', quantity: 100 }, effect: '在對方達成前猜中其中一個未完成的隱藏勝利條件，每回合限猜一次。' },
  { id: 'mathematician', name: '數學家', symbol: 'abacus', reward: { item: '突襲券', quantity: 14 }, effect: '同隊佔領至少(n-1)個質數格。1 不算質數。' },
  { id: 'almost-bingo', name: '就差一點點', symbol: 'near-line', reward: { item: '飄雪結晶', quantity: 50 }, effect: '同隊在同一橫線、直線或主要對角線上，連續佔領至少(n-1)個數字格。' },
  { id: 'four-corners', name: '四角佔領', symbol: 'flag', reward: { item: '飄雪結晶', quantity: 50 }, effect: '同隊佔領盤面四個角落。' },
  { id: 'round-66', name: '66', symbol: 'double-six', roundSum: 66, minBoardSize: 4, reward: { item: '超級藥水', quantity: 1000 }, effect: '同隊在單一回合內圈選的數字總和恰好為66。' },
  { id: 'round-77', name: '77', symbol: 'double-seven', roundSum: 77, minBoardSize: 4, reward: { item: '超級藥水', quantity: 1000 }, effect: '同隊在單一回合內圈選的數字總和恰好為77。' },
  { id: 'round-88', name: '88', symbol: 'double-eight', roundSum: 88, minBoardSize: 4, reward: { item: '超級藥水', quantity: 1000 }, effect: '同隊在單一回合內圈選的數字總和恰好為88。' },
  { id: 'quick-finish', name: '速戰速決', symbol: 'running', minRequiredCount: 3, reward: { item: '龍王項鍊', quantity: 1 }, effect: '其他隱藏條件皆達成，且隊伍剩餘時間超過6分鐘。' },
  { id: 'sage', name: '智者', symbol: 'book', reward: { item: '突襲券', quantity: 7 }, effect: '同隊正確回答至少4個效果卡問題。' },
  { id: 'reckless', name: '莽夫', symbol: 'book-cross', reward: { item: '突襲券', quantity: 7 }, effect: '同隊錯誤回答至少3個效果卡問題。' },
  { id: 'consecutive-numbers', name: '強迫症', symbol: 'ordered-numbers', reward: { item: '楓葉祝福20', quantity: 1 }, effect: '同隊連續圈選(n)個由小到大的連續數字，可跨回合。' },
  { id: 'pending-2', name: '待定', symbol: 'question-mark', effect: '隱藏勝利條件待定' }
]);
