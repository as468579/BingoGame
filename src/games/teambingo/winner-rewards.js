'use strict';
const { fail } = require('../../domain/errors');
const OPTIONS = Object.freeze(['龍王項鍊', '楓葉祝福20']);
function selectWinnerReward(room, player, data) {
  if (room.phase !== 'finished' || !room.winners.includes(player.teamId)) fail('只有獲勝隊伍可以選擇獲勝獎勵。', 403);
  if (player.id === room.host || room.captains?.[player.teamId] !== player.id) fail('只有獲勝隊伍的隊長可以選擇獎勵。', 403);
  if (!room.winnerRewardSessionId || data.sessionId !== room.winnerRewardSessionId) fail('結算已更新，請查看最新狀態。', 409);
  if (!OPTIONS.includes(data.item)) fail('請選擇龍王項鍊或楓葉祝福20。');
  if (room.winnerRewards?.[player.teamId]) fail('已選擇獲勝獎勵，不能更換。', 409);
  room.winnerRewards ||= {}; room.winnerRewards[player.teamId] = data.item;
}
function winnerReward(room, teamId, viewerId) {
  if (room.phase !== 'finished' || !room.winners.includes(teamId)) return null;
  const item = room.winnerRewards?.[teamId];
  return { sessionId: room.winnerRewardSessionId, options: [...OPTIONS], selected: OPTIONS.includes(item) ? { item, quantity: 1 } : null,
    canChoose: !item && viewerId !== room.host && room.captains?.[teamId] === viewerId };
}
module.exports = { selectWinnerReward, winnerReward };
