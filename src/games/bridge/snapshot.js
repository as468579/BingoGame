'use strict';
const { publicRoom, publicIdentity } = require('../../shared/public-room');

const { teamId, lineCount, activeBridgeTeam, legalPlacements } = require('./game');

function bridgeSnapshot(room, presence, viewerId) {
  const game = room.bridge;
  const hand = game.hands[viewerId] || [];
  const ownTeam = game.teams.find(team => team.playerIds.includes(viewerId));
  const active = room.phase === 'playing' ? activeBridgeTeam(game) : null;
  const teams = Array.from({ length: game.teamCount }, (_, i) => {
    const id = teamId(i), team = game.teams.find(candidate => candidate.id === id);
    return team ? { id, name: team.name, playerIds: team.playerIds, cells: team.cells, lines: lineCount(team, game.size),
      leadColor: team.leadColor, done: team.done, order: team.order, turn: team.id === active?.id ? team.order[team.cursor] : null }
      : { id, name: `隊伍 ${i + 1}`, playerIds: room.players.filter(player => player.teamId === id).map(player => player.id),
        cells: game.board.map(number => ({ number, card: null })), lines: 0, leadColor: null, turn: null, done: false, order: [] };
  });
  return {
    ...publicRoom(room, presence),
    lastScanAt: room.lastScanAt || null, lastScanRemovedCount: room.lastScanRemovedCount || 0,
    boardVersion: room.boardVersion || 0, size: game.size, goal: game.size - 2, winners: game.winners,
    bridge: { teamCount: game.teamCount, playersPerTeam: game.playersPerTeam, round: game.round, teams, activeTeamId: active?.id || null,
      lastPlay: game.lastPlay, colorCounts: ['red', 'yellow', 'blue'].map(color => ({ color, count: game.deck.filter(card => card.color === color).length })),
      legalMoves: room.phase === 'playing' && ownTeam ? hand.map(card => ({ cardNumber: card.number, targets: legalPlacements(game, ownTeam, viewerId, card.number) })) : [] },
    players: room.players.map(player => ({ ...publicIdentity(player, presence), teamId: player.teamId || null,
      ready: player.ready,
      handCount: (game.hands[player.id] || []).length, ...(player.id === viewerId ? { hand } : {}) }))
  };
}

module.exports = { bridgeSnapshot };
