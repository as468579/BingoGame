'use strict';

function teamHand(room, teamId) {
  room.teamHands ||= {};
  return room.teamHands[teamId] ||= [];
}

function migrateTeamHands(room) {
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
  };
  convert(room);
  for (const state of room.history || []) convert(state);
  return room;
}

module.exports = { teamHand, migrateTeamHands };
