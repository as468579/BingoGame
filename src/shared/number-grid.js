'use strict';

function createBoard(size = 5) {
  return Array.from({ length: size ** 2 }, (_, index) => index + 1);
}

function boardValid(board, size) {
  const count = size ** 2;
  return Array.isArray(board) && board.length === count && new Set(board).size === count &&
    board.every(number => Number.isInteger(number) && number >= 1 && number <= count);
}

// Both games adapt their occupancy representation to isCovered before counting lines.
function coveredLines(cells, size = Math.sqrt(cells.length)) {
  const sets = [];
  for (let index = 0; index < size; index++) {
    sets.push(cells.slice(index * size, index * size + size));
    sets.push(Array.from({ length: size }, (_, row) => cells[row * size + index]));
  }
  sets.push(Array.from({ length: size }, (_, index) => cells[index * size + index]));
  sets.push(Array.from({ length: size }, (_, index) => cells[index * size + size - 1 - index]));
  return sets.filter(set => set.every(cell => cell.isCovered === true)).length;
}

module.exports = { createBoard, boardValid, coveredLines };
