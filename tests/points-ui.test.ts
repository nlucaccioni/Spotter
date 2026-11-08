import { describe, expect, it } from 'vitest';
import { formatBehind, formatRate } from '../src/components/points/format.ts';

describe('formatRate', () => {
  it('gives a whole percentage of starts, blank when there is none', () => {
    expect(formatRate(13, 33)).toBe('39%');
    expect(formatRate(0, 33)).toBe('');
    expect(formatRate(0, 0)).toBe('');
  });
});
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
    expect(routeFromHash('#/analysis')).toBe('analysis');
    expect(hashForRoute('analysis')).toBe('#/analysis');
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
