'use strict';
const { createBoard, boardValid, coveredLines } = require('../../shared/number-grid');

function winningLineGoal(size = 5) {
  return size - 2;
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



// Compatibility helper for callers which still supply a numeric arrangement and called numbers.
function lines(board, called, size = Math.sqrt(board.length)) {
  return coveredLines(createCells(board, called), size);
}

module.exports = { winningLineGoal, createBoard, boardValid, createCells, coverNumber, clearCovers, coveredLines, lines };
