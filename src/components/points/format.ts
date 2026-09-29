/** Points behind (feeds give it as a negative number): the leader label, "0" when tied, or "−26". */
export function formatBehind(delta: number, isLeader: boolean, leaderLabel = 'Leader'): string {
  if (isLeader) return leaderLabel;
  return delta === 0 ? '0' : `−${Math.abs(delta)}`;
}
