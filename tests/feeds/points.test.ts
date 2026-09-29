import { describe, expect, it } from 'vitest';
import {
  parseLivePoints,
  parseSeasonPoints,
  seasonPointsUrl,
  standingsMoves,
} from '../../src/data/feeds/points.ts';
import { manufacturerFromName } from '../../src/data/model/lookups.ts';
import livePoints from '../fixtures/live-points-kansas-final.json';
import seasonPoints from '../fixtures/season-points-2026-cup.json';

describe('parseLivePoints (Kansas 2026 final)', () => {
  const entries = parseLivePoints(livePoints);

  it('parses every row, in points order', () => {
    expect(entries).toHaveLength(58);
    expect(entries.map((e) => e.position)).toEqual(entries.map((_, i) => i + 1));
  });

  it('normalizes the leader, stripping name markers into badges', () => {
    expect(entries[0]).toMatchObject({
      position: 1,
      driverId: 4030,
      carNumber: '5',
      name: { full: 'Kyle Larson', badges: ['contender'] },
      points: 2282,
      behindLeader: 0,
      earnedThisRace: 76,
      stages: [
        { points: 10, won: true },
        { points: 10, won: true },
        { points: 0, won: false },
      ],
    });
    expect(entries[1]).toMatchObject({ carNumber: '11', behindLeader: -26, behindNext: -26 });
  });

  it('keeps drivers who are not points-eligible, flagged', () => {
    const ineligible = entries.filter((e) => !e.isPointsEligible);
    expect(ineligible.length).toBeGreaterThan(0);
    expect(ineligible.every((e) => e.points === 0)).toBe(true);
  });

  it('drops bad rows and survives garbage', () => {
    expect(parseLivePoints([{ points_position: 'x' }, ...livePoints.slice(0, 2)])).toHaveLength(2);
    expect(parseLivePoints({ nope: true })).toEqual([]);
    expect(parseLivePoints([{ points_position: 3 }])[0]).toMatchObject({
      position: 3,
      points: 0,
      name: { full: 'Unknown driver' },
    });
  });
});

describe('parseSeasonPoints (2026 Cup)', () => {
  const standings = parseSeasonPoints(seasonPoints);

  it('parses the championship table', () => {
    expect(standings).toHaveLength(55);
    expect(standings[0]).toMatchObject({
      position: 1,
      driverId: 4030,
      carNumber: '5',
      name: { full: 'Kyle Larson', initial: 'K. Larson' },
      manufacturer: { code: 'Chv', name: 'Chevrolet' },
      points: 2282,
      lastRacePoints: 76,
      starts: 30,
      wins: 2,
      stageWins: 8,
      lapsLed: 1118,
    });
  });

  it('keeps name suffixes', () => {
    const suffixed = standings.find((s) => s.name.full.endsWith('Jr.'));
    expect(suffixed?.name.last).toMatch(/ Jr\.$/);
  });
});

describe('standingsMoves', () => {
  const live = parseLivePoints(livePoints);
  const moves = standingsMoves(live);

  it('gives the places each driver gained or lost in this race', () => {
    // Larson led before the race too.
    expect(moves[0]).toBe(0);
    const cindric = live.findIndex((e) => e.carNumber === '2');
    // Cindric earned 52: from 2090 before the race he moved up.
    expect(moves[cindric]).toBeGreaterThan(0);
  });

  it('treats tied drivers as equal instead of inventing a move', () => {
    const entry = (points: number, earned: number) => ({
      ...live[0]!,
      points,
      earnedThisRace: earned,
    });
    // Two drivers tied before and after the race: no movement either way.
    expect(standingsMoves([entry(100, 10), entry(100, 10)])).toEqual([0, 0]);
    // A passes B during the race.
    expect(standingsMoves([entry(120, 30), entry(110, 5)])).toEqual([1, -1]);
  });
});

describe('helpers', () => {
  it('builds season URLs and maps manufacturer names', () => {
    expect(seasonPointsUrl(2026, 3)).toBe('https://cf.nascar.com/cacher/2026/3/points-feed.json');
    expect(manufacturerFromName('Toyota')).toEqual({ code: 'Tyt', name: 'Toyota' });
    expect(manufacturerFromName('Dodge')).toEqual({ code: '', name: 'Dodge' });
  });
});
