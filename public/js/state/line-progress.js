// Compare authoritative prize owners so repeated HTTP/SSE snapshots announce each award once.
export function rewardGains(previous, current) {
  if (!previous || previous.code !== current.code || previous.boardVersion !== current.boardVersion ||
      previous.phase !== 'playing' || !['playing', 'finished'].includes(current.phase) ||
      current.revision <= previous.revision) return [];
  const owners = new Map((previous.linePrizes || []).map(prize => [prize.id, prize.claimedBy]));
  const gained = (current.linePrizes || []).filter(prize =>
    owners.has(prize.id) && !owners.get(prize.id) && prize.claimedBy);
  return current.players.filter(player => player.participating !== false).flatMap(player => {
    const rewards = gained.filter(prize => prize.claimedBy === player.id);
    return rewards.length ? [{ ...player, rewards }] : [];
  });
}
