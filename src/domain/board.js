'use strict';

function winningLineGoal(size = 5) {
  return size - 2;
}

function createBoard(size = 5) {
  return Array.from({ length: size ** 2 }, (_, index) => index + 1);
}

// Numeric board is the arrangement used by the editor/API. Cells own the independent cover state.
function createCells(board, called = []) {
  const covered = new Set(called);
  return board.map(number => ({ number, isCovered: covered.has(number) }));
}

function coverNumber(cells, number, isCovered = true) {
  if (typeof isCovered !== 'boolean') throw new TypeError('isCovered must be a boolean');
  const cell = cells.find(candidate => candidate.number === number);
  if (cell) cell.isCovered = isCovered;
  return cell;
}

function clearCovers(cells) {
  cells.forEach(cell => { cell.isCovered = false; });
}

function boardValid(board, size) {
  const count = size ** 2;
  return Array.isArray(board) && board.length === count && new Set(board).size === count &&
    board.every(number => Number.isInteger(number) && number >= 1 && number <= count);
}

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

// Compatibility helper for callers which still supply a numeric arrangement and called numbers.
function lines(board, called, size = Math.sqrt(board.length)) {
  return coveredLines(createCells(board, called), size);
}

module.exports = { winningLineGoal, createBoard, boardValid, createCells, coverNumber, clearCovers, coveredLines, lines };
