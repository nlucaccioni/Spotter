/** Points behind (feeds give it as a negative number): the leader label, "0" when tied, or "−26". */
export function formatBehind(delta: number, isLeader: boolean, leaderLabel = 'Leader'): string {
  if (isLeader) return leaderLabel;
  return delta === 0 ? '0' : `−${Math.abs(delta)}`;
}

/** A share of starts as a whole percentage ("40%"), or blank when none (like the counts). */
export function formatRate(count: number, starts: number): string {
  return starts > 0 && count > 0 ? `${Math.round((count / starts) * 100)}%` : '';
}
