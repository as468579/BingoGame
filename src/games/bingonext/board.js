'use strict';
const { randomInt } = require('node:crypto');
const { createBoard, boardValid, coveredLines } = require('../../shared/number-grid');

function winningLineGoal() {
  return 1;
}


// Numeric board is the arrangement used by the editor/API. Cells own the independent cover state.
function createCells(board, called = []) {
  const covered = new Set(called);
  return board.map(number => ({ number, isCovered: covered.has(number) }));
}

// Sample positions without replacement so every layout has exactly ceil(N * 12 / 100) specials.
function createSpecialCells(board, pick = randomInt) {
  const cells = createCells(board).map(cell => ({ ...cell, isSpecial: false }));
  const positions = cells.map((_, index) => index);
  for (let i = 0; i < Math.ceil(cells.length * 12 / 100); i++) {
    const selected = i + pick(cells.length - i);
    [positions[i], positions[selected]] = [positions[selected], positions[i]];
    cells[positions[i]].isSpecial = true;
  }
  return cells;
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

module.exports = { winningLineGoal, createBoard, boardValid, createCells, createSpecialCells, coverNumber, clearCovers, coveredLines, lines };
