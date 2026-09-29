import { describe, expect, it } from 'vitest';
import { formatBehind } from '../src/components/points/format.ts';
import { hashForRoute, routeFromHash } from '../src/hooks/useHashRoute.ts';

describe('hash routing', () => {
  it('maps hashes to pages, defaulting to the timing board', () => {
    expect(routeFromHash('#/points')).toBe('points');
    expect(routeFromHash('#/points?series=3')).toBe('points');
    expect(routeFromHash('')).toBe('timing');
    expect(routeFromHash('#/')).toBe('timing');
    expect(routeFromHash('#/pointsxyz')).toBe('timing');
    expect(hashForRoute('points')).toBe('#/points');
    expect(routeFromHash(hashForRoute('timing'))).toBe('timing');
  });
});

describe('formatBehind', () => {
  it('shows the leader, ties and points behind', () => {
    expect(formatBehind(0, true)).toBe('Leader');
    expect(formatBehind(0, false)).toBe('0');
    expect(formatBehind(-26, false)).toBe('−26');
    expect(formatBehind(0, true, '—')).toBe('—');
  });
});
