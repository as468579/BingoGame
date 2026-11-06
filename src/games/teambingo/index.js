'use strict';
const { createIdentity } = require('../../domain/identity');
const { createBoard, createSpecialCells } = require('./board');
const { createLinePrizes } = require('./prizes');
const { assignPlayer } = require('./teams');
const { applyGameAction } = require('./actions');
const { roomSnapshot } = require('./snapshot');
const { migrateTeamHands } = require('./team-hands');
const { DEFAULT_TEAM_MINUTES, validateTeamMinutes, initializeTeamClock, expireTeamClock, syncTeamClock } = require('./team-clock');
const { ensureQuestionDeadline, expireQuestion } = require('./question-clock');
const { expireHint } = require('./captain-hint');
const { isCaptain } = require('./participants');
const { migrateDrawCounts } = require('./card-deck');
const { migrateRetiredPrizes } = require('../../shared/prize-items');
const { createOffers } = require('./hidden-goal-offers');
const { selectionComplete, migrateGoalAliases, requiredCount } = require('./hidden-goal-state');
module.exports = {
  id: 'teambingo',
  cardLibrary: require('./card-catalog').cards,
  initializeRoom(options = {}) {
    const teamTimeMinutes = validateTeamMinutes(options.teamTimeMinutes === undefined ? DEFAULT_TEAM_MINUTES : options.teamTimeMinutes);
    const size = 6, board = createBoard(size);
    return { size, boardVersion: 0, board, cells: createSpecialCells(board), teamCount: 2, playersPerTeam: 2, teamTimeMinutes,
      called: [], turn: null, turnCursors: {}, hiddenGoals: null, hiddenGoalGuess: null, roundNumber: 1, roundActedIds: [], hint: null, hintUsesRemaining: {}, hintBonuses: {}, teamCorrectAnswers: {}, teamWrongAnswers: {}, teamBonusRewards: {}, cardDrawCounts: {}, usedQuestionIds: [], winners: [], pending: null, lastDecision: null, history: [], teamHands: {}, captains: {}, teamClock: null, endReason: null, linePrizes: createLinePrizes(size) };
  },
  createPlayer: (room, name, token) => ({ ...createIdentity(name, token), teamId: null, hand: [], usedDemoCards: [], ready: false }),
  capacity: room => room.teamCount * room.playersPerTeam,
  memberCount: room => room.players.filter(player => player.id !== room.host).length,
  joined: assignPlayer, restorePlayer: () => false,
  tick(room, now) {
    const hintChanged = expireHint(room, now);
    const questionChanged = expireQuestion(room, now);
    const clockChanged = expireTeamClock(room, now);
    return hintChanged || questionChanged || clockChanged;
  },
  applyAction: applyGameAction, snapshot: roomSnapshot,
  migrate(room) {
    migrateGoalAliases(room);
    room.teamCorrectAnswers ||= {};
    room.teamWrongAnswers ||= {};
    room.roundNumber ??= 1; room.roundActedIds ||= [];
    if (room.phase === 'choosing-goal' && room.hiddenGoals) {
      for (const teamId of Object.keys(room.hiddenGoals.offers)) {
        if (!selectionComplete(room, teamId)) room.hiddenGoals.offers[teamId] = createOffers(room.size, requiredCount(room));
      }
    }
    migrateRetiredPrizes(room);
    const retiredActive = ['star', 'shield', 'moon'].includes(room.activeCard?.cardId);
    migrateTeamHands(room);
    migrateDrawCounts(room);
    const host = room.players.find(player => player.id === room.host);
    if (host) { host.teamId = null; host.ready = false; }
    for (const [teamId, captainId] of Object.entries(room.captains || {})) {
      if (captainId === room.host) {
        delete room.captains[teamId];
        if (room.phase === 'choosing-goal') { room.phase = 'lobby'; room.hiddenGoals = null; room.teamClock = null; }
      }
    }
    const visibleQuestions = [room.activeCard, ...(room.history || []).map(state => state.activeCard)]
      .map(active => active?.questionId || active?.question?.id).filter(Boolean);
    room.usedQuestionIds = [...new Set([...(room.usedQuestionIds || []), ...visibleQuestions])];
    room.teamTimeMinutes ??= DEFAULT_TEAM_MINUTES;
    if (room.phase === 'playing' && !room.teamClock) initializeTeamClock(room);
    ensureQuestionDeadline(room);
    if (retiredActive) syncTeamClock(room);
    if (room.phase === 'playing' && !room.activeCard && (isCaptain(room, room.turn) || room.turn === room.host)) {
      syncTeamClock(room);
    }
    return room;
  }
};
