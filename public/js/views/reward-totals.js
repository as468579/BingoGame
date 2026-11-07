export function rewardTotals(rewards = []) {
  const totals = new Map();
  for (const reward of rewards) totals.set(reward.item, (totals.get(reward.item) || 0) + (reward.quantity ?? 1));
  return [...totals].map(([item, count]) => ({ item, count }));
}
