'use strict';
const { createSpecialCells } = require('./board');

function teamHand(room, teamId) {
  room.teamHands ||= {};
  return room.teamHands[teamId] ||= [];
}

function migrateTeamHands(room) {
  const retired = new Set(['star', 'shield', 'moon']);
  if (room.phase === 'lobby' && room.cells?.length && room.cells.every(cell => typeof cell.isSpecial !== 'boolean')) room.cells = createSpecialCells(room.board);
  const convert = state => {
    if (!state.teamHands) {
      state.teamHands = {};
      for (const saved of state.playerStates || state.players || []) {
        const teamId = room.players.find(player => player.id === saved.id)?.teamId;
        if (teamId) (state.teamHands[teamId] ||= []).push(...(saved.hand || []));
        saved.hand = [];
      }
    }
    if (state.activeCard && !state.activeCard.teamId) state.activeCard.teamId = room.players.find(player => player.id === state.activeCard.playerId)?.teamId;
    for (const [teamId, hand] of Object.entries(state.teamHands)) state.teamHands[teamId] = hand.filter(card => !retired.has(card.definitionId));
    if (retired.has(state.activeCard?.cardId)) state.activeCard = null;
  };
  convert(room);
  for (const state of room.history || []) convert(state);
  return room;
}

module.exports = { teamHand, migrateTeamHands };
