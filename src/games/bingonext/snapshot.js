'use strict';
const { publicRoom, publicIdentity } = require('../../shared/public-room');
const { canUndo } = require('./history');
const { winningLineGoal } = require('./board');
const { demoCards, publicCard } = require('./card-catalog');
const { teams } = require('./teams');
const { teamLines, playerRewards } = require('./prizes');
function roomSnapshot(room, presence, viewerId) {
  const viewer = room.players.find(p => p.id === viewerId), active = room.activeCard;
  const card = active && demoCards.find(c => c.id === active.cardId);
  const scores = teams(room).map(t => ({ ...t, playerIds: room.players.filter(p => p.teamId === t.id).map(p => p.id),
    lines: teamLines(room, t.id), rewards: playerRewards(room.linePrizes, t.id) }));
  return { ...publicRoom(room, presence), size: room.size, boardVersion: room.boardVersion, goal: winningLineGoal(room.size),
    teamCount: room.teamCount, playersPerTeam: room.playersPerTeam, teams: scores, board: room.board, cells: room.cells,
    turn: room.turn, called: room.called, winners: room.winners, linePrizes: room.linePrizes, pending: null,
    lastDecision: room.lastDecision, canUndo: canUndo(room), participantCount: room.players.length,
    lastScanAt: room.lastScanAt || null, lastScanRemovedCount: room.lastScanRemovedCount || 0,
    lastDraw: room.lastDecision?.playerId === viewerId ? viewer?.hand.find(c => c.id === room.lastDecision.drawnCardId) || null : null,
    availableDemoCards: viewer ? demoCards.filter(c => !viewer.usedDemoCards?.includes(c.id)).map(publicCard) : [],
    activeCard: card ? { id: active.id, playerId: active.playerId, cardId: active.cardId, stage: active.stage,
      ...(active.choice !== undefined ? { choice: active.choice } : {}), ...(active.correct !== undefined ? { correct: active.correct } : {}), card: publicCard(card) } : null,
    players: room.players.map(p => ({ ...publicIdentity(p, presence), teamId: p.teamId, ready: p.ready, participating: true,
      board: room.board, cells: room.cells, lines: scores.find(t => t.id === p.teamId)?.lines || 0, rewards: [], handCount: p.hand.length,
      ...(p.id === viewerId ? { hand: p.hand } : {}) })) };
}
module.exports = { roomSnapshot };
