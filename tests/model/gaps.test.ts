import { describe, expect, it } from 'vitest';
import { formatGap, gapToLeader, intervalToCarAhead, lapsDown } from '../../src/data/model/gaps.ts';

describe('lapsDown', () => {
  it('is 0 on the lead lap and the whole number of laps otherwise', () => {
    expect(lapsDown(0)).toBe(0);
    expect(lapsDown(2.391)).toBe(0);
    expect(lapsDown(-1)).toBe(1);
    expect(lapsDown(-10)).toBe(10);
  });
});

describe('gapToLeader', () => {
  it('marks the leader regardless of delta', () => {
    expect(gapToLeader(0, true)).toEqual({ kind: 'leader' });
    expect(gapToLeader(null, true)).toEqual({ kind: 'leader' });
  });

  it('gives seconds on the lead lap and laps when lapped', () => {
    expect(gapToLeader(2.391, false)).toEqual({ kind: 'time', seconds: 2.391 });
    expect(gapToLeader(0, false)).toEqual({ kind: 'time', seconds: 0 });
    expect(gapToLeader(-10, false)).toEqual({ kind: 'laps', laps: 10 });
  });

  it('is unknown without a delta', () => {
    expect(gapToLeader(null, false)).toEqual({ kind: 'unknown' });
  });
});

describe('intervalToCarAhead', () => {
  it('is leader when there is no car ahead', () => {
    expect(intervalToCarAhead(0, undefined)).toEqual({ kind: 'leader' });
  });

  it('subtracts deltas for two lead-lap cars, rounded to ms', () => {
    expect(intervalToCarAhead(2.428, 2.391)).toEqual({ kind: 'time', seconds: 0.037 });
    expect(intervalToCarAhead(0.565, 0)).toEqual({ kind: 'time', seconds: 0.565 });
  });

  it('gives the lap difference across a lap boundary', () => {
    expect(intervalToCarAhead(-1, 30.662)).toEqual({ kind: 'laps', laps: 1 });
    expect(intervalToCarAhead(-5, -3)).toEqual({ kind: 'laps', laps: 2 });
  });

  it('is unknown for lapped cars on the same lap, missing deltas, or out-of-order data', () => {
    expect(intervalToCarAhead(-1, -1)).toEqual({ kind: 'unknown' });
    expect(intervalToCarAhead(null, 1)).toEqual({ kind: 'unknown' });
    expect(intervalToCarAhead(1, null)).toEqual({ kind: 'unknown' });
    expect(intervalToCarAhead(1, -1)).toEqual({ kind: 'unknown' });
  });

  it('is unknown rather than negative when the car ahead has a bigger gap', () => {
    expect(intervalToCarAhead(2.0, 2.5)).toEqual({ kind: 'unknown' });
    expect(intervalToCarAhead(2.5, 2.5)).toEqual({ kind: 'time', seconds: 0 });
  });
});

describe('formatGap', () => {
  it('formats each kind', () => {
    expect(formatGap({ kind: 'leader' })).toBe('Leader');
    expect(formatGap({ kind: 'time', seconds: 2.391 })).toBe('+2.391');
    expect(formatGap({ kind: 'time', seconds: 0.5 })).toBe('+0.500');
    expect(formatGap({ kind: 'laps', laps: 10 })).toBe('-10 L');
    expect(formatGap({ kind: 'unknown' })).toBe('—');
  });
});
