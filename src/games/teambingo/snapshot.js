'use strict';
const { publicRoom, publicIdentity } = require('../../shared/public-room');
const { canUndo } = require('./history');
const { winningLineGoal } = require('./board');
const { demoCards, publicCard } = require('./card-catalog');
const { teams } = require('./teams');
const { teamLines, playerRewards } = require('./prizes');
const { findQuestion } = require('./question-bank');
const { DEFAULT_TEAM_MINUTES, remainingTime } = require('./team-clock');
const { privateHiddenGoal, hostHiddenGoals } = require('./hidden-goals');
const { isCaptain } = require('./participants');
const { hintUses } = require('./captain-hint');
function roomSnapshot(room, presence, viewerId) {
  const viewer = room.players.find(p => p.id === viewerId), active = room.activeCard;
  const card = active && demoCards.find(c => c.id === active.cardId);
  const question = active && (active.question || findQuestion(active.questionId || active.cardId));
  const now = Date.now();
  const hiddenGoal = privateHiddenGoal(room, viewer);
  const reviewedGoals = hostHiddenGoals(room, viewerId);
  const awardTeamId = room.lastDecision?.teamId;
  const awarded = (room.teamHands?.[awardTeamId] || []).find(held => held.id === room.lastDecision?.drawnCardId);
  const awardDefinition = awarded && demoCards.find(definition => definition.id === awarded.definitionId);
  const hand = viewer?.teamId ? (room.teamHands?.[viewer.teamId] || []).map(held => publicCard({ ...held,
    name: demoCards.find(definition => definition.id === held.definitionId)?.name || held.name,
    symbol: demoCards.find(definition => definition.id === held.definitionId)?.symbol || held.symbol })) : [];
  const scores = teams(room).map(t => ({ ...t, playerIds: room.players.filter(p => p.id !== room.host && p.teamId === t.id).map(p => p.id),
    lines: teamLines(room, t.id), handCount: room.teamHands?.[t.id]?.length || 0, hintUsesRemaining: hintUses(room, t.id),
    timeRemainingMs: remainingTime(room, t.id, now), clockRunning: room.phase === 'playing' && room.teamClock?.activeTeamId === t.id,
    rewards: playerRewards(room.linePrizes, t.id),
    bonusRewards: room.phase === 'finished' ? Object.entries(room.teamBonusRewards?.[t.id] || {}).map(([item, quantity]) => ({ item, quantity })) : [] }));
  return { ...publicRoom(room, presence), size: room.size, boardVersion: room.boardVersion, goal: winningLineGoal(room.size),
    teamCount: room.teamCount, playersPerTeam: room.playersPerTeam, teamTimeMinutes: room.teamTimeMinutes ?? DEFAULT_TEAM_MINUTES, teams: scores, board: room.board, cells: room.cells,
    turn: room.turn, called: room.called, winners: room.winners, endReason: room.endReason || null, linePrizes: room.linePrizes, pending: null,
    lastDecision: room.lastDecision, canUndo: canUndo(room), participantCount: room.players.filter(p => p.id !== room.host).length,
    ...(hiddenGoal ? { hiddenGoal } : {}),
    ...(reviewedGoals ? { hostHiddenGoals: reviewedGoals } : {}),
    hint: room.hint ? { id: room.hint.id, teamId: room.hint.teamId, captainId: room.hint.captainId, teamName: scores.find(team => team.id === room.hint.teamId)?.name || '隊伍', remainingMs: Math.max(0, room.hint.endsAt - now) } : null,
    canHint: Boolean(viewer && isCaptain(room, viewer.id) && hintUses(room, viewer.teamId) > 0 && room.phase === 'playing' && !room.activeCard && !room.hint && room.players.find(player => player.id === room.turn)?.teamId === viewer.teamId),
    ...(room.phase === 'choosing-goal' ? { goalsRemaining: scores.filter(team => !room.hiddenGoals?.choices[team.id]).length } : {}),
    lastScanAt: room.lastScanAt || null, lastScanRemovedCount: room.lastScanRemovedCount || 0,
    lastDraw: awarded ? { ...publicCard({ ...awarded, name: awardDefinition?.name || awarded.name, symbol: awardDefinition?.symbol || awarded.symbol }),
      teamId: awardTeamId, teamName: scores.find(team => team.id === awardTeamId)?.name || '隊伍' } : null,
    availableDemoCards: [],
    activeCard: card && question ? { id: active.id, playerId: active.playerId, teamId: active.teamId, cardId: active.cardId, stage: active.stage,
      ...(active.stage === 'question' ? { answerRemainingMs: Math.max(0, (active.answerDeadlineAt ?? now) - now) } : {}),
      ...(active.timedOut ? { timedOut: true } : {}),
      ...(viewerId === room.host && active.stage === 'review' ? { referenceAnswer: question.type === 'oral' ? question.referenceAnswer || '' : Number.isInteger(question.answer) && question.options[question.answer] !== undefined ? `${'ABCD'[question.answer]}：${question.options[question.answer]}` : '' } : {}),
      ...(active.choice !== undefined ? { choice: active.choice } : {}), ...(active.answered ? { answered: true } : {}), ...(active.correct !== undefined ? { correct: active.correct } : {}), card: { ...publicCard(card), question: question.question, questionCategory: question.category || '未分類', options: question.options, questionType: question.type || 'multiple-choice' } } : null,
    players: room.players.map(p => ({ ...publicIdentity(p, presence), teamId: p.id === room.host ? null : p.teamId, ready: p.ready, participating: p.id !== room.host && !isCaptain(room, p.id), spectating: p.id === room.host || isCaptain(room, p.id),
      board: room.board, cells: room.cells, lines: scores.find(t => t.id === p.teamId)?.lines || 0, rewards: [], handCount: room.teamHands?.[p.teamId]?.length || 0,
      ...(p.id === viewerId ? { hand } : {}) })) };
}
module.exports = { roomSnapshot };
