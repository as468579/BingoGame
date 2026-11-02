'use strict';

const { randomInt } = require('node:crypto');
const { createBoard, coveredLines } = require('../../shared/number-grid');

const COLORS = ['red', 'yellow', 'blue'];

function shuffle(values, pick = randomInt) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createBridgeState({ teamCount = 2, playersPerTeam = 2, size = 5 } = {}) {
  return { teamCount, playersPerTeam, size, board: createBoard(size), deck: [], hands: {}, teams: [], round: 0, winners: [], lastPlay: null };
}

function teamId(index) { return `team-${index + 1}`; }

function assignBridgePlayer(room, player) {
  const game = room.bridge;
  if (room.phase !== 'lobby' || player.teamId) return;
  for (let i = 0; i < game.teamCount; i++) {
    const id = teamId(i);
    if (room.players.filter(other => other.teamId === id).length < game.playersPerTeam) {
      player.teamId = id;
      return;
    }
  }
}

function coloredDeck(size, pick = randomInt) {
  // Shuffle a balanced color multiset: each color count differs by at most one.
  const palette = shuffle(COLORS, pick);
  const colors = shuffle(Array.from({ length: size ** 2 }, (_, i) => palette[i % 3]), pick);
  return createBoard(size).map((number, i) => ({ number, color: colors[i] }));
}

function lineCount(team, size) {
  return coveredLines(team.cells.map(cell => ({ isCovered: Boolean(cell.card) })), size);
}

function beginBridgeRound(game) {
  for (const team of game.teams) {
    const leader = (game.round - 1) % team.playerIds.length;
    team.order = [...team.playerIds.slice(leader), ...team.playerIds.slice(0, leader)]
      .filter(id => game.hands[id].length > 0);
    team.cursor = 0;
    team.leadColor = null;
    team.done = team.order.length === 0;
  }
}

// Teams take turns from top to bottom; completed/empty teams need no extra state.
function activeBridgeTeam(game) {
  return game.teams?.find(team => !team.done) || null;
}

function legalPlacements(game, team, playerId, cardNumber) {
  const active = activeBridgeTeam(game);
  if (active && active.id !== team.id) return [];
  if (team.done || team.order[team.cursor] !== playerId) return [];
  const hand = game.hands[playerId] || [];
  const card = hand.find(candidate => candidate.number === cardNumber);
  if (!card) return [];
  const hasLead = team.leadColor && hand.some(candidate => candidate.color === team.leadColor);
  if (hasLead && card.color !== team.leadColor) return [];
  const ownCell = team.cells.find(cell => cell.number === card.number);
  const free = Boolean(ownCell?.card) || Boolean(team.leadColor && !hasLead);
  return team.cells.filter(cell => !cell.card && (free || cell.number === card.number)).map(cell => cell.number);
}

module.exports = { COLORS, shuffle, createBridgeState, teamId, assignBridgePlayer, coloredDeck, lineCount, beginBridgeRound, activeBridgeTeam, legalPlacements };
