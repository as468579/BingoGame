// Compare accepted snapshots so HTTP responses and SSE updates announce a gain only once.
export function lineGains(previous, current) {
  if (!previous || previous.code !== current.code || previous.boardVersion !== current.boardVersion ||
      previous.phase !== 'playing' || !['playing', 'finished'].includes(current.phase)) return [];
  const active = room => room.players.filter(player => player.participating !== false);
  const previousMax = Math.max(0, ...active(previous).map(player => player.lines));
  const leaders = active(current);
  const currentMax = Math.max(0, ...leaders.map(player => player.lines));
  if (currentMax <= previousMax) return [];
  return leaders.filter(player => player.lines === currentMax);
}
