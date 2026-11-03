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
module.exports = {
  id: 'teambingo',
  cardLibrary: require('./card-catalog').cards,
  initializeRoom(options = {}) {
    const teamTimeMinutes = validateTeamMinutes(options.teamTimeMinutes === undefined ? DEFAULT_TEAM_MINUTES : options.teamTimeMinutes);
    const board = createBoard(8);
    return { size: 8, boardVersion: 0, board, cells: createSpecialCells(board), teamCount: 2, playersPerTeam: 2, teamTimeMinutes,
      called: [], turn: null, winners: [], pending: null, lastDecision: null, history: [], teamHands: {}, captains: {}, teamClock: null, endReason: null, linePrizes: createLinePrizes(8) };
  },
  createPlayer: (room, name, token) => ({ ...createIdentity(name, token), teamId: null, hand: [], usedDemoCards: [], ready: false }),
  capacity: room => room.teamCount * room.playersPerTeam,
  joined: assignPlayer, restorePlayer: () => false,
  tick(room, now) {
    const questionChanged = expireQuestion(room, now);
    const clockChanged = expireTeamClock(room, now);
    return questionChanged || clockChanged;
  },
  applyAction: applyGameAction, snapshot: roomSnapshot,
  migrate(room) {
    const retiredActive = ['star', 'shield', 'moon'].includes(room.activeCard?.cardId);
    migrateTeamHands(room);
    room.teamTimeMinutes ??= DEFAULT_TEAM_MINUTES;
    if (room.phase === 'playing' && !room.teamClock) initializeTeamClock(room);
    ensureQuestionDeadline(room);
    if (retiredActive) syncTeamClock(room);
    return room;
  }
};
