import { describe, expect, it } from 'vitest';
import {
  isPenaltyUpdate,
  seasonByDriver,
  seasonByManufacturer,
  seasonByTeam,
} from '../../src/data/analysis/season.ts';
import type { RaceResult, RaceSummary } from '../../src/data/feeds/race.ts';

const CHV = { code: 'Chv', name: 'Chevrolet' };
const TYT = { code: 'Tyt', name: 'Toyota' };

function r(
  driverId: number,
  finish: number,
  start: number,
  over: Partial<RaceResult> = {},
): RaceResult {
  return {
    driverId,
    carNumber: String(driverId),
    name: `Driver ${driverId}`,
    team: driverId === 1 ? 'Hendrick Motorsports' : 'Joe Gibbs Racing',
    manufacturer: driverId === 1 ? CHV : TYT,
    finish,
    start,
    lapsLed: 0,
    lapsCompleted: 200,
    status: 'Running',
    points: 41 - finish,
    playoffPoints: 0,
    pointsPosition: finish,
    ...over,
  };
}

function race(raceId: number, results: RaceResult[]): RaceSummary {
  return {
    raceId,
    name: `Race ${raceId}`,
    trackName: 'Track',
    scheduledLaps: 200,
    actualLaps: 200,
    stageEnds: [],
    leadChanges: 0,
    leaders: 0,
    cautions: 0,
    cautionLaps: 0,
    marginOfVictory: 0,
    averageSpeed: 0,
    results,
    stages: [],
    cautionSegments: [],
    leaderSpells: [],
  };
}

const races = [
  race(1, [r(1, 1, 1, { lapsLed: 50 }), r(2, 2, 5)]),
  // Driver 3 only runs race 2 (no starting spot given); driver 1 crashes out.
  race(2, [r(2, 1, 3), r(3, 2, 0), r(1, 3, 2, { status: 'Accident' })]),
];

describe('seasonByDriver', () => {
  const drivers = seasonByDriver(races);
  const byId = new Map(drivers.map((d) => [d.driverId, d]));

  it('adds up points race by race and keeps the standings place', () => {
    expect(byId.get(1)!.pointsAfter).toEqual([40, 78]);
    expect(byId.get(3)!.pointsAfter).toEqual([0, 39]);
    expect(byId.get(3)!.standingAfter).toEqual([null, 2]);
    expect(byId.get(3)!.finishes).toEqual([null, 2]);
  });

  it('averages starts, finishes and places gained (known starts only)', () => {
    const d1 = byId.get(1)!;
    expect(d1).toMatchObject({ starts: 2, wins: 1, top5: 2, poles: 1, lapsLed: 50, dnfs: 1 });
    expect(d1.avgStart).toBe(1.5);
    expect(d1.avgFinish).toBe(2);
    expect(d1.avgGained).toBe(-0.5);
    expect(byId.get(3)!.avgStart).toBeNull();
    expect(byId.get(3)!.avgGained).toBeNull();
    expect(byId.get(2)!.avgGained).toBe(2.5);
  });

  it('orders drivers by the latest standings', () => {
    expect(drivers.map((d) => d.driverId)).toEqual([2, 3, 1]);
  });
});

describe('official standings', () => {
  // After race 2 the leader lost 10 points to a penalty; driver 3 has points without racing.
  const official = [
    new Map([
      [1, { points: 40, position: 1 }],
      [2, { points: 39, position: 2 }],
      [3, { points: 0, position: 3 }],
    ]),
    new Map([
      [2, { points: 79, position: 1 }],
      [1, { points: 68, position: 2 }],
      [3, { points: 39, position: 3 }],
    ]),
  ];

  it('uses NASCAR’s totals and places where given', () => {
    const byId = new Map(seasonByDriver(races, official).map((d) => [d.driverId, d]));
    expect(byId.get(1)!.officialAfter).toEqual([40, 68]);
    expect(byId.get(1)!.pointsAfter).toEqual([40, 78]); // the race total is unchanged
    expect(byId.get(1)!.standingAfter).toEqual([1, 2]);
    expect(byId.get(3)!.officialAfter).toEqual([0, 39]);
  });

  it('leaves races without standings empty', () => {
    const d1 = seasonByDriver(races, [null, official[1]!]).find((d) => d.driverId === 1)!;
    expect(d1.officialAfter).toEqual([null, 68]);
    expect(d1.standingAfter).toEqual([1, 2]); // from the weekend feed for race 1
  });

  it('only trusts today’s standings when they look like penalties, not a stale feed', () => {
    const afterRace = new Map([
      [1, { points: 100, position: 1 }],
      [2, { points: 90, position: 2 }],
      [3, { points: 80, position: 3 }],
      [4, { points: 70, position: 4 }],
    ]);
    const penalty = new Map(afterRace).set(3, { points: 55, position: 4 });
    const stale = new Map([...afterRace].map(([id, e]) => [id, { ...e, points: e.points - 30 }]));
    expect(isPenaltyUpdate(afterRace, penalty)).toBe(true);
    expect(isPenaltyUpdate(afterRace, stale)).toBe(false);
    expect(isPenaltyUpdate(null, penalty)).toBe(true);
  });
});

describe('team and manufacturer figures', () => {
  it('groups results, best first', () => {
    const teams = seasonByTeam(races);
    expect(teams.map((t) => t.name)).toEqual(['Joe Gibbs Racing', 'Hendrick Motorsports']);
    expect(teams[0]).toMatchObject({ drivers: 2, starts: 3, wins: 1, bestFinish: 1 });
    expect(teams[0]!.avgFinish).toBeCloseTo(5 / 3);

    const makes = seasonByManufacturer(races);
    expect(makes.map((m) => m.key)).toEqual(['Tyt', 'Chv']);
    expect(makes[1]).toMatchObject({ manufacturer: CHV, lapsLed: 50, wins: 1 });
  });
});
