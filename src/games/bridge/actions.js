'use strict';

const { fail } = require('../../domain/errors');
const { requireHost } = require('../../domain/room-access');
const { createBridgeState, teamId, assignBridgePlayer, shuffle, coloredDeck, lineCount, beginBridgeRound, activeBridgeTeam, legalPlacements } = require('./game');

function scan(room, player, data, presence) {
  requireHost(room, player, '只有房主可以重新掃描玩家。');
  if (room.phase !== 'lobby') fail('請在準備階段重新掃描玩家。');
  const retained = room.players.filter(member => member.id === room.host || presence.isOnline(member.id));
  room.lastScanRemovedCount = room.players.length - retained.length;
  room.lastScanAt = Date.now();
  room.players = retained;
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
  member.teamId = data.teamId;
  member.ready = false;
}

function ready(room, player, data) {
  if (room.phase !== 'lobby') fail('遊戲已開始。');
  if (!player.teamId) fail('請先加入隊伍。');
  if (typeof data.ready !== 'boolean') fail('無效的準備狀態。');
  player.ready = data.ready;
}

function start(room, player) {
  requireHost(room, player, '只有房主可以開始遊戲。');
  if (room.phase !== 'lobby') fail('遊戲已開始。');
  const game = room.bridge;
  const rosters = Array.from({ length: game.teamCount }, (_, i) => room.players.filter(member => member.teamId === teamId(i)));
  if (room.players.length !== game.teamCount * game.playersPerTeam ||
      rosters.some(roster => roster.length !== game.playersPerTeam || roster.some(member => !member.ready))) fail('每隊必須滿員且所有玩家準備完成。');
  game.board = shuffle(game.board);
  game.deck = coloredDeck(game.size);
  game.hands = {};
  game.teams = rosters.map((roster, i) => {
    const recipients = shuffle(roster.map(member => member.id));
    for (const id of recipients) game.hands[id] = [];
    shuffle(game.deck).forEach((card, index) => game.hands[recipients[index % recipients.length]].push({ ...card }));
    return { id: teamId(i), name: `隊伍 ${i + 1}`, playerIds: roster.map(member => member.id),
      cells: game.board.map(number => ({ number, card: null })), order: [], cursor: 0, leadColor: null, done: false };
  });
  game.round = 1;
  game.winners = [];
  game.lastPlay = null;
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
  if (!Number.isInteger(data.cardNumber) || !Number.isInteger(data.targetNumber) ||
      !legalPlacements(game, team, player.id, data.cardNumber).includes(data.targetNumber)) fail('不符合跟色或放置規則，請選擇可出的卡片與空格。');
  const hand = game.hands[player.id];
  const index = hand.findIndex(card => card.number === data.cardNumber);
  const [card] = hand.splice(index, 1);
  team.cells.find(cell => cell.number === data.targetNumber).card = { ...card, playerId: player.id };
  team.leadColor ||= card.color;
  game.lastPlay = { playerId: player.id, teamId: team.id, card, targetNumber: data.targetNumber, round: game.round };
  team.cursor++;
  team.done = team.cursor >= team.order.length;
  if (game.teams.every(candidate => candidate.done)) {
    game.winners = game.teams.filter(candidate => lineCount(candidate, game.size) >= game.size - 2).map(candidate => candidate.id);
    if (game.winners.length || game.teams.every(candidate => candidate.cells.every(cell => cell.card))) room.phase = 'finished';
    else { game.round++; beginBridgeRound(game); }
  }
}

function reset(room, player) {
  requireHost(room, player, '只有房主可以重新開局。');
  room.bridge = createBridgeState(room.bridge);
  room.phase = 'lobby';
  room.boardVersion = (room.boardVersion || 0) + 1;
  room.players.forEach(member => { member.ready = false; });
}

const handlers = { bridgeScan: scan, bridgeSettings: settings, bridgeTeam: chooseTeam, bridgeReady: ready, bridgeStart: start, bridgePlay: play, bridgeReset: reset };
function applyBridgeAction(room, player, data, presence) {
  const handler = handlers[data.kind];
  if (!Object.hasOwn(handlers, data.kind) || !handler) fail('不支援的 Bridge Bingo 操作。');
  handler(room, player, data, presence);
}

module.exports = { applyBridgeAction };
