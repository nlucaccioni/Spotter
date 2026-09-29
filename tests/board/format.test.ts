import { describe, expect, it } from 'vitest';
import {
  formatChange,
  formatLapTime,
  formatPits,
  formatStatus,
  isOut,
  pitIndicator,
} from '../../src/components/board/format.ts';
import { parseLiveFeed } from '../../src/data/feeds/liveFeed.parse.ts';
import type { CarState, PitStop } from '../../src/data/model/types.ts';
import kansas from '../fixtures/cup-2026-kansas-final.json';

const result = parseLiveFeed(kansas);
if (!result.ok) throw new Error(result.error);
const larson = result.session.cars[0]!;

const stop = (lap: number, inTime: number | null, outTime: number | null): PitStop => ({
  lap,
  leaderLap: lap,
  inTime,
  outTime,
  durationSeconds: null,
  inRank: null,
  outRank: null,
  positionChange: null,
});
const withStops = (lapsCompleted: number, pitStops: PitStop[]): CarState => ({
  ...larson,
  lapsCompleted,
  pitStops,
});

describe('format helpers', () => {
  it('formats lap times and position changes', () => {
    expect(formatLapTime(30.076)).toBe('30.076');
    expect(formatLapTime(undefined)).toBe('—');
    expect(formatChange(3)).toBe('▲3');
    expect(formatChange(-2)).toBe('▼2');
    expect(formatChange(0)).toBe('–');
    expect(formatChange(null)).toBe('—');
  });

  it('formats pit stops as count and last pit lap', () => {
    expect(formatPits(larson)).toEqual({ count: '5', last: '·L215' });
    expect(formatPits(withStops(10, []))).toEqual({ count: '0', last: null });
    expect(formatPits(larson, true)).toEqual({ count: '5', last: null });
  });

  it('describes status and marks cars out of the race', () => {
    expect(formatStatus(larson)).toEqual({ label: 'RUN', title: 'Running' });
    expect(formatStatus({ ...larson, isOnTrack: false }).label).toBe('OFF');
    expect(formatStatus({ ...larson, statusCode: 7 })).toEqual({
      label: 'S7',
      title: 'Unknown status code 7',
    });
    const out = result.session.cars.find((c) => c.carNumber === '4')!;
    expect(formatStatus(out).label).toBe('OUT');
    expect(isOut(out)).toBe(true);
    expect(isOut(larson)).toBe(false);
  });
});

describe('pitIndicator', () => {
  it('shows PIT on pit road, OUT on the out lap, then nothing', () => {
    expect(pitIndicator(withStops(50, [stop(50, 2000, null)]), false, false)).toBe('pit');
    expect(pitIndicator(withStops(51, [stop(50, 2000, 2035)]), false, true)).toBe('out');
    expect(pitIndicator(withStops(52, [stop(50, 2000, 2035)]), false, false)).toBeNull();
    expect(pitIndicator(withStops(52, []), false, false)).toBeNull();
  });

  it('shows nothing for a car that is out of the race', () => {
    const out = { ...withStops(200, [stop(112, 4400, null)]), statusCode: 3, isOnTrack: false };
    expect(pitIndicator(out, false, false)).toBeNull();
  });

  it('shows nothing once the session is finished', () => {
    expect(pitIndicator(withStops(50, [stop(50, 2000, null)]), true, false)).toBeNull();
    expect(pitIndicator(withStops(51, [stop(50, 2000, 2035)]), true, true)).toBeNull();
  });
});
