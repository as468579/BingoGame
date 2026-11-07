'use strict';

const { randomInt } = require('node:crypto');
const { teams } = require('./teams');

const { ITEMS, createPrizePicker } = require('../../shared/prize-items');

function prizeLines(size) {
  const positions = Array.from({ length: size }, (_, index) => index);
  return [
    ...positions.map(row => ({ kind: 'row', index: row, indices: positions.map(column => row * size + column) })),
    ...positions.map(column => ({ kind: 'column', index: column, indices: positions.map(row => row * size + column) })),
    { kind: 'diagonal', index: 0, indices: positions.map(index => index * (size + 1)) },
    { kind: 'diagonal', index: 1, indices: positions.map(index => (index + 1) * (size - 1)) }
  ];
}

function createLinePrizes(size = 5, pickIndex = randomInt) {
  const lines = prizeLines(size), pickItem = createPrizePicker(lines.length, pickIndex);
  return lines.map(line => ({
    id: `${line.kind}-${line.index}`, kind: line.kind, index: line.index,
    ...pickItem(), claimedBy: null
  }));
}

function ensureLinePrizes(room) {
  const expected = prizeLines(room.size || 5);
  if (Array.isArray(room.linePrizes) && room.linePrizes.length === expected.length &&
      expected.every((slot, index) => room.linePrizes[index]?.id === `${slot.kind}-${slot.index}`)) return false;
  room.linePrizes = createLinePrizes(room.size || 5);
  return true;
}

// Only one team can own every cell in a line on the shared board.
function awardLinePrizes(room) {
  ensureLinePrizes(room);
  if (!['playing', 'finished'].includes(room.phase)) return;
  const roster = teams(room);
  const lines = prizeLines(room.size || 5);
  for (const [index, slot] of room.linePrizes.entries()) {
    if (slot.claimedBy) continue;
    const owner = roster.find(team => lines[index].indices.every(index => room.cells[index].isCovered && room.cells[index].teamId === team.id));
    if (owner) slot.claimedBy = owner.id;
  }
}

function playerRewards(prizes, playerId) {
  return prizes.filter(slot => slot.claimedBy === playerId).map(({ id, kind, index, item, quantity = 1 }) => ({ id, kind, index, item, quantity }));
}

function teamLines(room, id) {
  return prizeLines(room.size).filter(line => line.indices.every(index => room.cells[index].isCovered && room.cells[index].teamId === id)).length;
}
module.exports = { ITEMS, prizeLines, teamLines, createLinePrizes, ensureLinePrizes, awardLinePrizes, playerRewards };
