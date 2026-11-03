'use strict';

const { fail } = require('../../domain/errors');
const { requireHost } = require('../../domain/room-access');
const { boardValid } = require('../../shared/number-grid');
const { createBridgeState, teamId, assignBridgePlayer, shuffle, coloredDeck, lineCount, beginBridgeRound, activeBridgeTeam, legalPlacements, canDiscard } = require('./game');

function scan(room, player, data, presence) {
  requireHost(room, player, '只有房主可以重新掃描玩家。');
  if (room.phase !== 'lobby') fail('請在準備階段重新掃描玩家。');
  const retained = room.players.filter(member => member.id === room.host || presence.isOnline(member.id));
  room.lastScanRemovedCount = room.players.length - retained.length;
  room.lastScanAt = Date.now();
  room.players = retained;
  for (const [id, captain] of Object.entries(room.bridge.captains || {})) {
    if (!retained.some(member => member.id === captain && member.teamId === id)) delete room.bridge.captains[id];
  }
}

function settings(room, player, data) {
  requireHost(room, player, '只有房主可以設定 Bridge Bingo。');
  if (room.phase !== 'lobby') fail('請先重新開局，再修改設定。');
  const { teamCount, playersPerTeam, size } = data;
  if (![teamCount, playersPerTeam, size].every(Number.isInteger) || teamCount < 2 || teamCount > 16 ||
      playersPerTeam < 1 || teamCount * playersPerTeam > 16 || size < 3 || size > 9) fail('請設定至少 2 隊、每隊至少 1 人、共不超過 16 人，以及 3～9 的盤面。');
  if (room.players.length > teamCount * playersPerTeam) fail('設定的總人數少於目前房間人數。');
  room.bridge = createBridgeState({ teamCount, playersPerTeam, size });
  room.size = size;
  room.boardVersion = (room.boardVersion || 0) + 1;
  for (const member of room.players) { member.teamId = null; member.ready = false; }
  for (const member of room.players) assignBridgePlayer(room, member);
}

function chooseTeam(room, player, data) {
  if (room.phase !== 'lobby') fail('開始後不能更換隊伍。');
  const member = room.players.find(candidate => candidate.id === (data.playerId || player.id));
  if (!member || (member.id !== player.id && player.id !== room.host)) fail('只能變更自己或由房主分配隊伍。', 403);
  const valid = Array.from({ length: room.bridge.teamCount }, (_, i) => teamId(i));
  if (data.teamId !== null && !valid.includes(data.teamId)) fail('無效的隊伍。');
  if (data.teamId && room.players.filter(candidate => candidate.id !== member.id && candidate.teamId === data.teamId).length >= room.bridge.playersPerTeam) fail('該隊已滿，請先移出一位玩家。');
  if (member.teamId !== data.teamId && room.bridge.captains?.[member.teamId] === member.id) delete room.bridge.captains[member.teamId];
  member.teamId = data.teamId;
  member.ready = false;
}

function captain(room, player, data) {
  requireHost(room, player, '只有房主可以指定隊長。');
  if (room.phase !== 'lobby') fail('請在準備階段指定隊長。');
  const valid = Array.from({ length: room.bridge.teamCount }, (_, i) => teamId(i));
  if (!valid.includes(data.teamId)) fail('無效的隊伍。');
  if (data.playerId !== null && !room.players.some(member => member.id === data.playerId && member.teamId === data.teamId)) fail('隊長必須是該隊成員。');
  room.bridge.captains ||= {};
  if (data.playerId === null) delete room.bridge.captains[data.teamId];
  else room.bridge.captains[data.teamId] = data.playerId;
}

function board(room, player, data) {
  if (room.phase !== 'lobby') fail('開始後不能修改盤面。');
  if (!player.teamId || (data.teamId !== undefined && data.teamId !== player.teamId)) fail('只能修改自己隊伍的盤面。', 403);
  if (player.ready) fail('請先取消準備，再修改盤面。');
  const game = room.bridge, id = player.teamId;
  if (data.boardVersion !== game.teamBoardVersions[id]) fail('隊伍盤面已更新，請查看最新盤面後重新確認。', 409);
  if (!boardValid(data.board, game.size)) fail(`請填入 1～${game.size ** 2}，每個數字只能出現一次。`);
  if (data.board.some((number, index) => number !== game.teamBoards[id][index])) {
    game.teamBoards[id] = [...data.board];
    game.teamBoardVersions[id]++;
    room.players.filter(member => member.teamId === id).forEach(member => { member.ready = false; });
  }
}

function ready(room, player, data) {
  if (room.phase !== 'lobby') fail('遊戲已開始。');
  if (!player.teamId) fail('請先加入隊伍。');
  if (typeof data.ready !== 'boolean') fail('無效的準備狀態。');
  if (data.ready && data.board !== undefined) board(room, player, data);
  player.ready = data.ready;
}

function start(room, player) {
  requireHost(room, player, '只有房主可以開始遊戲。');
  if (room.phase !== 'lobby') fail('遊戲已開始。');
  const game = room.bridge;
  const rosters = Array.from({ length: game.teamCount }, (_, i) => room.players.filter(member => member.teamId === teamId(i)));
  if (room.players.some(member => !member.ready || !rosters.some(roster => roster.includes(member))) ||
      rosters.some(roster => roster.length === 0 || roster.length > game.playersPerTeam)) fail('每隊至少需要 1 人，且所有玩家必須完成分隊與準備。');
  game.deck = coloredDeck(game.size);
  game.hands = {};
  game.teams = rosters.map((roster, i) => {
    const recipients = shuffle(roster.map(member => member.id));
    for (const id of recipients) game.hands[id] = [];
    shuffle(game.deck).forEach((card, index) => game.hands[recipients[index % recipients.length]].push({ ...card }));
    return { id: teamId(i), name: `隊伍 ${i + 1}`, playerIds: roster.map(member => member.id),
      cells: game.teamBoards[teamId(i)].map(number => ({ number, card: null })), order: [], cursor: 0, leadColor: null, done: false };
  });
  game.round = 1;
  game.winners = [];
  game.lastPlay = null;
  game.discards = [];
  room.phase = 'playing';
  beginBridgeRound(game);
}

function play(room, player, data) {
  if (room.phase !== 'playing') fail('目前不是出牌階段。');
  const game = room.bridge;
  // Round is required: a queued command from an older round may never play in a new one.
  if (data.round !== game.round) fail('回合已更新，請查看最新狀態。', 409);
  const team = game.teams.find(candidate => candidate.playerIds.includes(player.id));
  if (!team || team.done || team.order[team.cursor] !== player.id) fail('請等待輪到你出牌。', 403);
  const active = activeBridgeTeam(game);
  if (active?.id !== team.id) fail(`請等待輪到你的隊伍，目前由 ${active?.name || '其他隊伍'} 出牌。`, 403);
  const discard = data.discard === true;
  if (!Number.isInteger(data.cardNumber) || (discard
    ? data.targetNumber != null || !canDiscard(game, team, player.id, data.cardNumber)
    : !Number.isInteger(data.targetNumber) || !legalPlacements(game, team, player.id, data.cardNumber).includes(data.targetNumber))) fail('不符合跟色、放置或棄牌規則，請重新選擇。');
  const hand = game.hands[player.id];
  const index = hand.findIndex(card => card.number === data.cardNumber);
  const [card] = hand.splice(index, 1);
  if (discard) (game.discards ||= []).push({ playerId: player.id, teamId: team.id, card, round: game.round });
  else team.cells.find(cell => cell.number === data.targetNumber).card = { ...card, playerId: player.id };
  team.leadColor ||= card.color;
  game.lastPlay = { playerId: player.id, teamId: team.id, card, targetNumber: discard ? null : data.targetNumber, discard, round: game.round };
  team.cursor++;
  team.done = team.cursor >= team.order.length;
  if (game.teams.every(candidate => candidate.done)) {
    game.winners = game.teams.filter(candidate => lineCount(candidate, game.size) >= game.size - 2).map(candidate => candidate.id);
    if (game.winners.length || Object.values(game.hands).every(hand => hand.length === 0)) room.phase = 'finished';
    else { game.round++; beginBridgeRound(game); }
  }
}

function reset(room, player) {
  requireHost(room, player, '只有房主可以重新開局。');
  const captains = { ...room.bridge.captains };
  room.bridge = createBridgeState(room.bridge);
  room.bridge.captains = captains;
  room.phase = 'lobby';
  room.boardVersion = (room.boardVersion || 0) + 1;
  room.players.forEach(member => { member.ready = false; });
}

const handlers = { bridgeScan: scan, bridgeSettings: settings, bridgeTeam: chooseTeam, bridgeCaptain: captain, bridgeBoard: board, bridgeReady: ready, bridgeStart: start, bridgePlay: play, bridgeReset: reset };
function applyBridgeAction(room, player, data, presence) {
  const handler = handlers[data.kind];
  if (!Object.hasOwn(handlers, data.kind) || !handler) fail('不支援的 Bridge Bingo 操作。');
  handler(room, player, data, presence);
}

module.exports = { applyBridgeAction };
