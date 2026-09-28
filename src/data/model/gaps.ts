import type { Gap } from './types.ts';

// `delta` has two meanings: seconds behind the leader for lead-lap cars, or a negative
// whole number of laps down (e.g. -10) for lapped cars. The leader is 0.

/** Whole laps behind the leader implied by a delta (0 for lead-lap cars). */
export function lapsDown(delta: number): number {
  return delta < 0 ? Math.round(-delta) : 0;
}

export function gapToLeader(delta: number | null, isLeader: boolean): Gap {
  if (isLeader) return { kind: 'leader' };
  if (delta === null) return { kind: 'unknown' };
  if (delta < 0) return { kind: 'laps', laps: lapsDown(delta) };
  return { kind: 'time', seconds: roundMs(delta) };
}

/**
 * Gap to the car one position ahead. An approximation from `delta` until the racing-insights
 * feed (official intervals) is integrated:
 * - both on the lead lap: difference in seconds;
 * - different laps: difference in laps;
 * - same lap but both lapped: unknown (the feed gives no time for lapped cars).
 */
export function intervalToCarAhead(
  delta: number | null,
  aheadDelta: number | null | undefined,
): Gap {
  if (aheadDelta === undefined) return { kind: 'leader' };
  if (delta === null || aheadDelta === null) return { kind: 'unknown' };

  const laps = lapsDown(delta) - lapsDown(aheadDelta);
  if (laps > 0) return { kind: 'laps', laps };
  if (laps < 0 || lapsDown(delta) > 0) return { kind: 'unknown' };
  return { kind: 'time', seconds: roundMs(Math.max(0, delta - aheadDelta)) };
}

export function formatGap(gap: Gap): string {
  switch (gap.kind) {
    case 'leader':
      return 'Leader';
    case 'time':
      return `+${gap.seconds.toFixed(3)}`;
    case 'laps':
      return `-${gap.laps} L`;
    case 'unknown':
      return '—';
  }
}

function roundMs(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}
