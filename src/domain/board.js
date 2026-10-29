'use strict';

function createBoard(size = 5) {
  return Array.from({ length: size ** 2 }, (_, index) => index + 1);
}

function boardValid(board, size) {
  const count = size ** 2;
  return Array.isArray(board) && board.length === count && new Set(board).size === count &&
    board.every(number => Number.isInteger(number) && number >= 1 && number <= count);
}

function lines(board, called, size = Math.sqrt(board.length)) {
  const marked = new Set(called);
  const sets = [];
  for (let index = 0; index < size; index++) {
    sets.push(board.slice(index * size, index * size + size));
    sets.push(Array.from({ length: size }, (_, row) => board[row * size + index]));
  }
  sets.push(Array.from({ length: size }, (_, index) => board[index * size + index]));
  sets.push(Array.from({ length: size }, (_, index) => board[index * size + size - 1 - index]));
  return sets.filter(set => set.every(number => marked.has(number))).length;
}

module.exports = { createBoard, boardValid, lines };
