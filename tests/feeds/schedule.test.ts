import { describe, expect, it } from 'vitest';
import {
  currentRace,
  parseRaceList,
  seriesLiveFeedUrl,
  seriesLivePointsUrl,
} from '../../src/data/feeds/schedule.ts';

// Trimmed from cacher/2026/1/race_list_basic.json.
const raw = [
  {
    race_id: 5628,
    race_name: 'Hollywood Casino 400 ',
    track_name: 'Kansas Speedway',
    date_scheduled: '2026-09-27T15:00:00',
    schedule: [
      { event_name: 'Garage Hours', start_time_utc: '2026-09-25T15:00:00', run_type: 0 },
      { event_name: 'Practice', start_time_utc: '2026-09-26T16:05:00', run_type: 1 },
      { event_name: 'Qualifying', start_time_utc: '2026-09-26T17:10:00', run_type: 2 },
      { event_name: 'Race', start_time_utc: '2026-09-27T19:00:00', run_type: 3 },
    ],
  },
  {
    race_id: 5630,
    race_name: 'South Point 400',
    track_name: 'Las Vegas Motor Speedway',
    date_scheduled: '2026-10-04T17:30:00',
    schedule: [
      { event_name: 'Hauler Parade', start_time_utc: '2026-10-02T21:00:00', run_type: 0 },
      { event_name: 'Practice (Impound)', start_time_utc: '2026-10-03T20:30:00', run_type: 1 },
      { event_name: 'Race', start_time_utc: '2026-10-04T21:30:00', run_type: 3 },
    ],
  },
  // No session schedule published yet: falls back to date_scheduled.
  {
    race_id: 5631,
    race_name: 'YellaWood 500',
    track_name: 'Talladega Superspeedway',
    date_scheduled: '2026-10-18T14:00:00',
    schedule: null,
  },
  { race_id: 'bad' },
];

const races = parseRaceList(raw);
const at = (iso: string) => Date.parse(iso);

describe('parseRaceList', () => {
  it('keeps each race with its first on-track session time', () => {
    expect(races.map((r) => r.raceId)).toEqual([5628, 5630, 5631]);
    expect(races[0]).toEqual({
      raceId: 5628,
      name: 'Hollywood Casino 400',
      trackName: 'Kansas Speedway',
      firstSessionMs: at('2026-09-26T16:05:00Z'),
    });
    expect(races[2]!.firstSessionMs).toBe(at('2026-10-18T14:00:00Z'));
  });

  it('returns nothing for a body that is not a list', () => {
    expect(parseRaceList({ series_1: [] })).toEqual([]);
  });
});

describe('currentRace', () => {
  it('stays on the last race until the next weekend is on track', () => {
    expect(currentRace(races, at('2026-09-28T12:00:00Z'))?.raceId).toBe(5628);
    // Hauler parade and garage hours don't count.
    expect(currentRace(races, at('2026-10-03T20:00:00Z'))?.raceId).toBe(5628);
    expect(currentRace(races, at('2026-10-03T20:30:00Z'))?.raceId).toBe(5630);
    expect(currentRace(races, at('2026-10-05T12:00:00Z'))?.raceId).toBe(5630);
  });

  it('is null before the first race weekend', () => {
    expect(currentRace(races, at('2026-01-01T00:00:00Z'))).toBeNull();
  });
});

it('builds per-series feed URLs', () => {
  expect(seriesLiveFeedUrl(2, 5660)).toBe(
    'https://cf.nascar.com/live/feeds/series_2/5660/live_feed.json',
  );
  expect(seriesLivePointsUrl(3, 5675)).toBe(
    'https://cf.nascar.com/live/feeds/series_3/5675/live_points.json',
  );
});
