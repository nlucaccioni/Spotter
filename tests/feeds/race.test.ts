import { describe, expect, it } from 'vitest';
import {
  cleanDriverName,
  lapTimesUrl,
  parseLapTimes,
  parsePitStops,
  parseRaceSummary,
  pitDataUrl,
} from '../../src/data/feeds/race.ts';

// Trimmed from cacher/2026/1/5628 (Kansas): weekend-feed.json, lap-times.json, live-pit-data.json.

const result = (over: Record<string, unknown>) => ({
  driver_id: 4030,
  car_number: '5',
  driver_fullname: 'Kyle Larson',
  team_name: 'Hendrick Motorsports',
  car_make: 'Chevrolet',
  finishing_position: 1,
  starting_position: 2,
  laps_led: 235,
  laps_completed: 267,
  finishing_status: 'Running',
  points_earned: 76,
  playoff_points_earned: 0,
  points_position: 1,
  ...over,
});

const weekend = {
  weekend_race: [
    {
      race_id: 5628,
      race_name: 'Hollywood Casino 400 ',
      track_name: 'Kansas Speedway',
      scheduled_laps: 267,
      actual_laps: 267,
      stage_1_laps: 80,
      stage_2_laps: 85,
      stage_3_laps: 102,
      stage_4_laps: 0,
      number_of_lead_changes: 12,
      number_of_leaders: 6,
      number_of_cautions: 5,
      number_of_caution_laps: 26,
      margin_of_victory: '1.234',
      average_speed: 140.2,
      results: [
        result({
          driver_id: 1361,
          car_number: '11',
          driver_fullname: 'Denny Hamlin',
          team_name: 'Joe Gibbs Racing',
          car_make: 'Toyota',
          finishing_position: 2,
          starting_position: 1,
        }),
        result({}),
        // Entry-list leftovers have no finishing position.
        result({ driver_id: 9, finishing_position: 0 }),
        { garbage: true },
      ],
      stage_results: [
        {
          stage_number: 1,
          results: [
            {
              driver_id: 4030,
              car_number: '5',
              driver_fullname: 'Kyle Larson',
              finishing_position: 1,
              stage_points: 10,
            },
          ],
        },
      ],
      caution_segments: [
        { start_lap: 37, end_lap: 40, reason: 'Competition', comment: 'Competition' },
      ],
      race_leaders: [
        { start_lap: 0, end_lap: 0, car_number: '22' },
        { start_lap: 1, end_lap: 36, car_number: '5' },
      ],
    },
  ],
};

describe('parseRaceSummary', () => {
  const race = parseRaceSummary(weekend)!;

  it('keeps finishers in finishing order with their details', () => {
    expect(race.name).toBe('Hollywood Casino 400');
    expect(race.results.map((r) => r.carNumber)).toEqual(['5', '11']);
    expect(race.results[1]).toMatchObject({
      team: 'Joe Gibbs Racing',
      manufacturer: { code: 'Tyt', name: 'Toyota' },
      start: 1,
    });
    expect(race.marginOfVictory).toBe(1.234);
  });

  it('turns stage lengths into the laps they end on', () => {
    expect(race.stageEnds).toEqual([80, 165, 267]);
  });

  it('drops the lap-0 "leader" and keeps stages and cautions', () => {
    expect(race.leaderSpells).toEqual([{ startLap: 1, endLap: 36, carNumber: '5' }]);
    expect(race.stages[0]!.results[0]).toMatchObject({ carNumber: '5', points: 10 });
    expect(race.cautionSegments[0]).toMatchObject({ startLap: 37, endLap: 40 });
  });

  it('returns null for a feed without a race', () => {
    expect(parseRaceSummary({ weekend_race: [] })).toBeNull();
    expect(parseRaceSummary('nope')).toBeNull();
  });
});

describe('parseLapTimes', () => {
  it('indexes positions and times by lap, with the flag on each lap', () => {
    const laps = parseLapTimes({
      laps: [
        {
          Number: '5',
          FullName: 'Kyle Larson (C)',
          Manufacturer: 'Chv',
          NASCARDriverID: 4030,
          Laps: [
            { Lap: 0, LapTime: null, RunningPos: 2 },
            { Lap: 1, LapTime: 32.452, RunningPos: 1 },
            { Lap: 3, LapTime: 30.295, RunningPos: 1 },
          ],
        },
      ],
      flags: [
        { LapsCompleted: 0, FlagState: 8 },
        { LapsCompleted: 1, FlagState: 1 },
        { LapsCompleted: 3, FlagState: 2 },
      ],
    });
    expect(laps.laps).toBe(3);
    expect(laps.flags).toEqual([8, 1, 0, 2]);
    const car = laps.cars[0]!;
    expect(car).toMatchObject({ carNumber: '5', name: 'Kyle Larson', driverId: 4030 });
    expect(car.positions).toEqual([2, 1, null, 1]);
    expect(car.times).toEqual([null, 32.452, null, 30.295]);
  });

  it('is empty for anything else', () => {
    expect(parseLapTimes(null)).toEqual({ cars: [], flags: [], laps: 0 });
  });
});

describe('parsePitStops', () => {
  const stop = (over: Record<string, unknown>) => ({
    vehicle_number: '5',
    driver_name: 'Kyle Larson (C)',
    lap_count: 36,
    pit_in_flag_status: 2,
    total_duration: 36.821,
    pit_stop_duration: 9.336,
    pit_stop_type: 'FOUR_WHEEL_CHANGE',
    left_front_tire_changed: true,
    left_rear_tire_changed: true,
    right_front_tire_changed: true,
    right_rear_tire_changed: true,
    pit_in_rank: 1,
    pit_out_rank: 3,
    positions_gained_lost: -2,
    ...over,
  });

  it('drops the pre-race placeholder and reads each stop', () => {
    const stops = parsePitStops([
      stop({ lap_count: 0, total_duration: 24, pit_stop_duration: -1 }),
      stop({
        lap_count: 215,
        pit_in_flag_status: 1,
        left_front_tire_changed: false,
        left_rear_tire_changed: false,
        pit_stop_type: 'TWO_WHEEL_CHANGE_RIGHT',
      }),
      stop({}),
    ]);
    expect(stops.map((s) => s.lap)).toEqual([36, 215]);
    expect(stops[0]).toEqual({
      carNumber: '5',
      name: 'Kyle Larson',
      lap: 36,
      underCaution: true,
      pitRoadSeconds: 36.821,
      boxSeconds: 9.336,
      type: 'four',
      inRank: 1,
      outRank: 3,
      positionsGained: -2,
    });
    expect(stops[1]).toMatchObject({ underCaution: false, type: 'right' });
  });

  it('leaves unmeasured box times empty', () => {
    expect(parsePitStops([stop({ pit_stop_duration: -1 })])[0]!.boxSeconds).toBeNull();
    expect(parsePitStops({})).toEqual([]);
  });
});

describe('race file helpers', () => {
  it('strips eligibility and rookie marks from names', () => {
    expect(cleanDriverName('Kyle Larson (C)')).toBe('Kyle Larson');
    expect(cleanDriverName('Brent Crews #')).toBe('Brent Crews');
    expect(cleanDriverName('Shane van Gisbergen (i) (C)')).toBe('Shane van Gisbergen');
  });

  it('builds the URLs', () => {
    expect(lapTimesUrl(2026, 1, 5628)).toBe(
      'https://cf.nascar.com/cacher/2026/1/5628/lap-times.json',
    );
    expect(pitDataUrl(2026, 2, 5639)).toBe(
      'https://cf.nascar.com/cacher/2026/2/5639/live-pit-data.json',
    );
  });
});
