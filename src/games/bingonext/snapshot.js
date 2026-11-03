'use strict';
const { publicRoom, publicIdentity } = require('../../shared/public-room');
const { canUndo } = require('./history');
const { winningLineGoal } = require('./board');
const { demoCards, publicCard } = require('./card-catalog');
const { teams } = require('./teams');
const { teamLines, playerRewards } = require('./prizes');
const { findQuestion } = require('./question-bank');
const { DEFAULT_TEAM_MINUTES, remainingTime } = require('./team-clock');
function roomSnapshot(room, presence, viewerId) {
  const viewer = room.players.find(p => p.id === viewerId), active = room.activeCard;
  const card = active && demoCards.find(c => c.id === active.cardId);
  const question = active && (active.question || findQuestion(active.questionId || active.cardId));
  const now = Date.now();
  const hand = viewer?.teamId ? (room.teamHands?.[viewer.teamId] || []).map(publicCard) : [];
  const scores = teams(room).map(t => ({ ...t, playerIds: room.players.filter(p => p.teamId === t.id).map(p => p.id),
    lines: teamLines(room, t.id), handCount: room.teamHands?.[t.id]?.length || 0,
    timeRemainingMs: remainingTime(room, t.id, now), clockRunning: room.phase === 'playing' && room.teamClock?.activeTeamId === t.id,
    rewards: playerRewards(room.linePrizes, t.id) }));
  return { ...publicRoom(room, presence), size: room.size, boardVersion: room.boardVersion, goal: winningLineGoal(room.size),
    teamCount: room.teamCount, playersPerTeam: room.playersPerTeam, teamTimeMinutes: room.teamTimeMinutes ?? DEFAULT_TEAM_MINUTES, teams: scores, board: room.board, cells: room.cells,
    turn: room.turn, called: room.called, winners: room.winners, endReason: room.endReason || null, linePrizes: room.linePrizes, pending: null,
    lastDecision: room.lastDecision, canUndo: canUndo(room), participantCount: room.players.length,
    lastScanAt: room.lastScanAt || null, lastScanRemovedCount: room.lastScanRemovedCount || 0,
    lastDraw: hand.find(c => c.id === room.lastDecision?.drawnCardId) || null,
    availableDemoCards: [],
    activeCard: card && question ? { id: active.id, playerId: active.playerId, teamId: active.teamId, cardId: active.cardId, stage: active.stage,
      ...(active.stage === 'question' ? { answerRemainingMs: Math.max(0, (active.answerDeadlineAt ?? now) - now) } : {}),
      ...(active.timedOut ? { timedOut: true } : {}),
      ...(viewerId === room.host && active.stage === 'review' ? { referenceAnswer: Number.isInteger(question.answer) && question.options[question.answer] !== undefined ? `${'ABCD'[question.answer]}：${question.options[question.answer]}` : '' } : {}),
      ...(active.choice !== undefined ? { choice: active.choice } : {}), ...(active.correct !== undefined ? { correct: active.correct } : {}), card: { ...publicCard(card), question: question.question, options: question.options } } : null,
    players: room.players.map(p => ({ ...publicIdentity(p, presence), teamId: p.teamId, ready: p.ready, participating: true,
      board: room.board, cells: room.cells, lines: scores.find(t => t.id === p.teamId)?.lines || 0, rewards: [], handCount: room.teamHands?.[p.teamId]?.length || 0,
      ...(p.id === viewerId ? { hand } : {}) })) };
}
module.exports = { roomSnapshot };
