import { describe, expect, it } from 'vitest';
import {
  cautionRanges,
  cleanGreenLaps,
  labelCautions,
  pitSummary,
  racePace,
  tireFalloff,
} from '../../src/data/analysis/race.ts';
import type { CarLaps, LapTimes, PitStop } from '../../src/data/feeds/race.ts';

const CHV = { code: 'Chv', name: 'Chevrolet' };

// 12 laps: green, a caution on laps 6-7, the restart lap 8, then green to the end.
const flags = [8, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1];

/** Lap times that grow by `wear` per green lap on tires; slow under caution. */
function car(carNumber: string, base: number, wear: number, pitLap: number | null): CarLaps {
  const times: (number | null)[] = [null];
  let age = 0;
  for (let lap = 1; lap <= 12; lap++) {
    if (lap === pitLap) age = 0;
    if (flags[lap] === 1) age += 1;
    times.push(flags[lap] === 1 ? base + age * wear : base + 20);
  }
  return {
    carNumber,
    name: `Car ${carNumber}`,
    driverId: Number(carNumber),
    manufacturer: CHV,
    positions: [],
    times,
  };
}

const stop = (carNumber: string, lap: number, over: Partial<PitStop> = {}): PitStop => ({
  carNumber,
  name: `Car ${carNumber}`,
  lap,
  underCaution: true,
  pitRoadSeconds: 37,
  boxSeconds: 9,
  type: 'four',
  inRank: 1,
  outRank: 2,
  positionsGained: -1,
  ...over,
});

const data: LapTimes = {
  cars: [car('5', 30, 0.1, 6), car('11', 30.2, 0.05, 6)],
  flags,
  laps: 12,
};
const stops = [stop('5', 6), stop('11', 6, { positionsGained: 1 })];

describe('green-flag laps and cautions', () => {
  it('leaves out lap 1, caution laps and restart laps', () => {
    const green = cleanGreenLaps(flags);
    expect(green.flatMap((g, lap) => (g ? [lap] : []))).toEqual([2, 3, 4, 5, 9, 10, 11, 12]);
  });

  it('finds caution runs and labels them from the weekend feed', () => {
    const ranges = cautionRanges(flags);
    expect(ranges).toEqual([{ from: 6, to: 7 }]);
    expect(
      labelCautions(ranges, [
        { startLap: 8, endLap: 10, reason: 'Spin', comment: '#4 Spin Turn 2' },
      ]),
    ).toEqual([{ from: 6, to: 7, label: '#4 Spin Turn 2' }]);
    const far = labelCautions(ranges, [
      { startLap: 40, endLap: 42, reason: 'Debris', comment: '' },
    ]);
    expect(far[0]!.label).toBe('');
  });
});

describe('racePace', () => {
  it('ranks cars by their median clean green lap', () => {
    const pace = racePace(data, stops, 3);
    expect(pace.map((p) => p.carNumber)).toEqual(['5', '11']);
    expect(pace[0]!.greenLaps).toBe(8);
    expect(pace[0]!.best).toBeCloseTo(30.1);
  });

  it('leaves cars with too few clean laps unranked', () => {
    expect(racePace(data, stops, 20).every((p) => p.median === null)).toBe(true);
  });
});

describe('tireFalloff', () => {
  it('averages lap time by green laps on tires', () => {
    const curve = tireFalloff(data, stops, '5', 1);
    expect(curve[1]).toBeNull(); // lap 1 isn't a clean green lap
    expect(curve[2]).toBeCloseTo(30.2);
    expect(curve[5]).toBeCloseTo(30.5);
  });

  it('is empty for an unknown car', () => {
    expect(tireFalloff(data, stops, '99')).toEqual([]);
  });
});

describe('pitSummary', () => {
  it('counts places gained under caution only', () => {
    const summary = pitSummary([
      ...stops,
      stop('5', 10, {
        underCaution: false,
        positionsGained: -20,
        pitRoadSeconds: 40,
        boxSeconds: null,
      }),
    ]);
    expect(summary.map((s) => s.carNumber)).toEqual(['5', '11']);
    expect(summary[0]).toMatchObject({
      stops: 2,
      greenStops: 1,
      avgPitRoad: 38.5,
      bestPitRoad: 37,
      avgBox: 9,
      cautionPositionsGained: -1,
    });
  });
});
