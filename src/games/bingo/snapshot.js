'use strict';
const { publicRoom, publicIdentity } = require('../../shared/public-room');

const { coveredLines, winningLineGoal } = require('./board');
const { canUndo } = require('./history');
const { isParticipant, participants } = require('./participants');
const { demoCards, publicCard } = require('./card-catalog');
const { playerRewards } = require('./prizes');

// Explicitly project public fields; credentials and retry/history records never leave the server.
function roomSnapshot(room, presence, viewerId) {
  const viewer = room.players.find(player => player.id === viewerId);
  const active = room.activeCard;
  const card = active && demoCards.find(candidate => candidate.id === active.cardId);
  return {
    ...publicRoom(room, presence), turn: room.turn,
    size: room.size || 5, goal: winningLineGoal(room.size || 5), boardVersion: room.boardVersion || 0,
    called: room.called, winners: room.winners,
    linePrizes: (room.linePrizes || []).map(({ id, kind, index, item, claimedBy }) => ({ id, kind, index, item, claimedBy })),
    pending: room.pending || null, lastDecision: room.lastDecision || null,
    lastDraw: room.lastDecision?.approved && room.lastDecision.playerId === viewerId
      ? viewer?.hand.find(held => held.id === room.lastDecision.drawnCardId) || null : null,
    availableDemoCards: viewer ? demoCards.filter(candidate => !viewer.usedDemoCards?.includes(candidate.id)).map(publicCard) : [],
    activeCard: card ? { id: active.id, playerId: active.playerId, cardId: active.cardId, stage: active.stage,
      ...(active.choice !== undefined ? { choice: active.choice } : {}),
      ...(active.correct !== undefined ? { correct: active.correct } : {}), card: publicCard(card) } : null,
    canUndo: canUndo(room),
    lastScanAt: room.lastScanAt || null,
    lastScanRemovedCount: room.lastScanRemovedCount || 0,
    participantCount: participants(room).length,
    players: room.players.map(player => ({
      ...publicIdentity(player, presence), board: player.board, cells: player.cells, ready: player.ready,
      lines: coveredLines(player.cells),
      participating: isParticipant(room, player.id),
      rewards: playerRewards(room.linePrizes || [], player.id),
      handCount: player.hand.length,
      ...(player.id === viewerId ? { hand: player.hand } : {})
    }))
  };
}

module.exports = { roomSnapshot };
