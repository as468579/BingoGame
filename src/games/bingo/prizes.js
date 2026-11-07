'use strict';

const { participants } = require('./participants');
const { createCells } = require('./board');
const { randomInt } = require('node:crypto');

const { ITEMS, createPrizePicker, migrateLimitedPrizes, migratePrizeQuantities, migrateRetiredPrizes } = require('../../shared/prize-items');

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

// A slot has exactly one owner. Same-call ties use the room's stable join order.
function awardLinePrizes(room) {
  ensureLinePrizes(room);
  if (!['playing', 'finished'].includes(room.phase)) return;
  const roster = participants(room);
  const lines = prizeLines(room.size || 5);
  for (const [index, slot] of room.linePrizes.entries()) {
    if (slot.claimedBy) continue;
    const owner = roster.find(player => lines[index].indices.every(cell => player.cells?.[cell]?.isCovered === true));
    if (owner) slot.claimedBy = owner.id;
  }
}

function playerRewards(prizes, playerId) {
  return prizes.filter(slot => slot.claimedBy === playerId).map(({ id, kind, index, item, quantity = 1 }) => ({ id, kind, index, item, quantity }));
}

function migrateLinePrizes(room, replay = false) {
  for (const state of [room, ...(room.history || [])]) {
    for (const prize of state.linePrizes || []) {
      if (prize.item === 'mp_potion') prize.item = '活力藥水';
      if (prize.item === 'hp_potion') prize.item = '紅色藥水';
    }
  }
  const created = ensureLinePrizes(room);
  migrateRetiredPrizes(room);
  migrateLimitedPrizes(room);
  migratePrizeQuantities(room);
  if ((!created && !replay) || !['playing', 'finished'].includes(room.phase)) return;
  // Replay available pre-action snapshots before the current state, preserving first-completion order.
  for (const state of [...(room.roundStart ? [{ playerStates: room.roundStart, called: [] }] : []), ...(room.history || [])]) {
    const saved = new Map((state.playerStates || []).map(player => [player.id, player.cells]));
    const players = room.players.map(player => ({ ...player, cells: saved.get(player.id) || createCells(player.board, state.called || []) }));
    awardLinePrizes({ ...room, players, linePrizes: room.linePrizes });
  }
  awardLinePrizes(room);
}

module.exports = { ITEMS, createLinePrizes, ensureLinePrizes, awardLinePrizes, playerRewards, migrateLinePrizes };
