import { z } from 'zod';
import { manufacturerFromCode, manufacturerFromName } from '../model/lookups.ts';
import type { Manufacturer } from '../model/types.ts';
import { cleanTeamName } from './weekend.ts';

// Per-race files for the analysis page (cf.nascar.com/cacher/{year}/{series}/{race_id}/…,
// CORS: *, see docs/feed-notes.md): the weekend feed's official results, lap-times.json (every
// car's time and running position on every lap, plus the flag on each lap) and
// live-pit-data.json (one row per pit stop). Parsed tolerantly: bad rows are dropped.

const BASE = 'https://cf.nascar.com/cacher';

export function lapTimesUrl(year: number, seriesId: number, raceId: number): string {
  return `${BASE}/${year}/${seriesId}/${raceId}/lap-times.json`;
}

export function pitDataUrl(year: number, seriesId: number, raceId: number): string {
  return `${BASE}/${year}/${seriesId}/${raceId}/live-pit-data.json`;
}

const num = z.number().catch(0);
const str = z.string().catch('');

// ---------------------------------------------------------------------------------------------
// Weekend feed: results

export interface RaceResult {
  driverId: number;
  carNumber: string;
  name: string;
  team: string | null;
  manufacturer: Manufacturer;
  finish: number;
  /** 0 when the feed has no starting spot. */
  start: number;
  lapsLed: number;
  lapsCompleted: number;
  /** "Running", "Accident", "Engine", … */
  status: string;
  points: number;
  playoffPoints: number;
  /** Place in the standings after this race (0 when not given). */
  pointsPosition: number;
}

export interface StageResult {
  stage: number;
  results: {
    driverId: number;
    carNumber: string;
    name: string;
    position: number;
    points: number;
  }[];
}

export interface CautionSegment {
  startLap: number;
  endLap: number;
  reason: string;
  comment: string;
}

export interface LeaderSpell {
  startLap: number;
  endLap: number;
  carNumber: string;
}

export interface RaceSummary {
  raceId: number;
  name: string;
  trackName: string;
  scheduledLaps: number;
  actualLaps: number;
  /** The lap each stage ends on, in order (the last is the race distance). */
  stageEnds: number[];
  leadChanges: number;
  leaders: number;
  cautions: number;
  cautionLaps: number;
  /** Seconds. */
  marginOfVictory: number;
  averageSpeed: number;
  /** Finishing order. Empty until the race has been run. */
  results: RaceResult[];
  stages: StageResult[];
  cautionSegments: CautionSegment[];
  leaderSpells: LeaderSpell[];
}

const resultSchema = z.object({
  driver_id: z.number().int(),
  car_number: str,
  driver_fullname: str,
  team_name: str,
  car_make: str,
  finishing_position: num,
  starting_position: num,
  laps_led: num,
  laps_completed: num,
  finishing_status: str,
  points_earned: num,
  playoff_points_earned: num,
  points_position: num,
});

const stageSchema = z.object({
  stage_number: z.number().int(),
  results: z
    .array(
      z.object({
        driver_id: z.number().int(),
        car_number: str,
        driver_fullname: str,
        finishing_position: num,
        stage_points: num,
      }),
    )
    .catch([]),
});

const cautionSchema = z.object({
  start_lap: z.number(),
  end_lap: z.number(),
  reason: str,
  comment: z.string().nullable().catch(''),
});

const leaderSchema = z.object({
  start_lap: z.number(),
  end_lap: z.number(),
  car_number: z.union([z.string(), z.number()]).transform(String),
});

const raceSchema = z.object({
  race_id: z.number().int(),
  race_name: str,
  track_name: str,
  scheduled_laps: num,
  actual_laps: num,
  stage_1_laps: num,
  stage_2_laps: num,
  stage_3_laps: num,
  stage_4_laps: num,
  number_of_lead_changes: num,
  number_of_leaders: num,
  number_of_cautions: num,
  number_of_caution_laps: num,
  margin_of_victory: z.union([z.number(), z.string()]).transform(Number).catch(0),
  average_speed: num,
  results: z.array(z.unknown()).catch([]),
  stage_results: z.array(z.unknown()).nullable().catch([]),
  caution_segments: z.array(z.unknown()).nullable().catch([]),
  race_leaders: z.array(z.unknown()).nullable().catch([]),
});

function rows<T>(items: readonly unknown[] | null, schema: z.ZodType<T>): T[] {
  return (items ?? []).flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** The race in a weekend feed, or null if the feed has none. */
export function parseRaceSummary(raw: unknown): RaceSummary | null {
  const feed = z.object({ weekend_race: z.array(z.unknown()) }).safeParse(raw);
  const race = raceSchema.safeParse(feed.success ? feed.data.weekend_race[0] : undefined);
  if (!race.success) return null;
  const r = race.data;

  // Before the race the results are the entry list, with no finishing positions.
  const results = rows(r.results, resultSchema)
    .filter((x) => x.finishing_position > 0)
    .map((x): RaceResult => ({
      driverId: x.driver_id,
      carNumber: x.car_number.trim(),
      name: x.driver_fullname.trim(),
      team: cleanTeamName(x.team_name),
      manufacturer: manufacturerFromName(x.car_make),
      finish: x.finishing_position,
      start: x.starting_position,
      lapsLed: x.laps_led,
      lapsCompleted: x.laps_completed,
      status: x.finishing_status.trim(),
      points: x.points_earned,
      playoffPoints: x.playoff_points_earned,
      pointsPosition: x.points_position,
    }))
    .sort((a, b) => a.finish - b.finish);

  // Stage lengths are per stage; stage ends are cumulative laps.
  const stageEnds: number[] = [];
  let lap = 0;
  for (const length of [r.stage_1_laps, r.stage_2_laps, r.stage_3_laps, r.stage_4_laps]) {
    if (length <= 0) break;
    lap += length;
    stageEnds.push(lap);
  }

  return {
    raceId: r.race_id,
    name: r.race_name.trim(),
    trackName: r.track_name.trim(),
    scheduledLaps: r.scheduled_laps,
    actualLaps: r.actual_laps,
    stageEnds,
    leadChanges: r.number_of_lead_changes,
    leaders: r.number_of_leaders,
    cautions: r.number_of_cautions,
    cautionLaps: r.number_of_caution_laps,
    marginOfVictory: Number.isFinite(r.margin_of_victory) ? r.margin_of_victory : 0,
    averageSpeed: r.average_speed,
    results,
    stages: rows(r.stage_results, stageSchema)
      .map((s) => ({
        stage: s.stage_number,
        results: s.results
          .filter((x) => x.finishing_position > 0)
          .map((x) => ({
            driverId: x.driver_id,
            carNumber: x.car_number.trim(),
            name: x.driver_fullname.trim(),
            position: x.finishing_position,
            points: x.stage_points,
          }))
          .sort((a, b) => a.position - b.position),
      }))
      .filter((s) => s.results.length > 0)
      .sort((a, b) => a.stage - b.stage),
    cautionSegments: rows(r.caution_segments, cautionSchema)
      .filter((c) => c.end_lap >= c.start_lap && c.start_lap > 0)
      .map((c) => ({
        startLap: c.start_lap,
        endLap: c.end_lap,
        reason: c.reason.trim(),
        comment: (c.comment ?? '').trim(),
      })),
    // Lap 0 is the pole sitter "leading" before the start.
    leaderSpells: rows(r.race_leaders, leaderSchema)
      .filter((l) => l.end_lap >= l.start_lap && l.end_lap > 0)
      .map((l) => ({
        startLap: Math.max(1, l.start_lap),
        endLap: l.end_lap,
        carNumber: l.car_number.trim(),
      })),
  };
}

// ---------------------------------------------------------------------------------------------
// lap-times.json

export interface CarLaps {
  carNumber: string;
  name: string;
  driverId: number | null;
  manufacturer: Manufacturer;
  /** Indexed by lap number (index 0 is the grid). Missing laps are null. */
  positions: (number | null)[];
  /** Seconds, indexed by lap number; null where there's no time. */
  times: (number | null)[];
}

export interface LapTimes {
  cars: CarLaps[];
  /** Flag state at the end of each lap (index = laps completed): 1 green, 2 caution, … */
  flags: number[];
  laps: number;
}

const lapSchema = z.object({
  Lap: z.number().int().nonnegative(),
  LapTime: z.number().nullable().catch(null),
  RunningPos: z.number().nullable().catch(null),
});

const carSchema = z.object({
  Number: z.union([z.string(), z.number()]).transform(String),
  FullName: str,
  Manufacturer: str,
  NASCARDriverID: z.number().nullable().catch(null),
  Laps: z.array(z.unknown()).catch([]),
});

const flagSchema = z.object({ LapsCompleted: z.number().int().nonnegative(), FlagState: num });

/** Drops the marks NASCAR appends to names ("Kyle Larson (C)", "… (i)", rookies' "#"). */
export function cleanDriverName(name: string): string {
  return name.replace(/(\s*(\([^)]*\)|[#*†]))+\s*$/, '').trim();
}

export function parseLapTimes(raw: unknown): LapTimes {
  const feed = z
    .object({ laps: z.array(z.unknown()), flags: z.array(z.unknown()).catch([]) })
    .safeParse(raw);
  if (!feed.success) return { cars: [], flags: [], laps: 0 };
  let laps = 0;
  const cars = rows(feed.data.laps, carSchema).map((car): CarLaps => {
    const positions: (number | null)[] = [];
    const times: (number | null)[] = [];
    for (const lap of rows(car.Laps, lapSchema)) {
      positions[lap.Lap] = lap.RunningPos !== null && lap.RunningPos > 0 ? lap.RunningPos : null;
      times[lap.Lap] = lap.LapTime !== null && lap.LapTime > 0 ? lap.LapTime : null;
      laps = Math.max(laps, lap.Lap);
    }
    return {
      carNumber: car.Number.trim(),
      name: cleanDriverName(car.FullName),
      driverId: car.NASCARDriverID,
      manufacturer: manufacturerFromCode(car.Manufacturer),
      positions: Array.from(positions, (p) => p ?? null),
      times: Array.from(times, (t) => t ?? null),
    };
  });
  const flags: number[] = [];
  for (const f of rows(feed.data.flags, flagSchema)) flags[f.LapsCompleted] = f.FlagState;
  return { cars, flags: Array.from(flags, (f) => f ?? 0), laps };
}

// ---------------------------------------------------------------------------------------------
// live-pit-data.json

export type PitStopType = 'four' | 'right' | 'left' | 'none';

export interface PitStop {
  carNumber: string;
  name: string;
  /** The car's lap when it came in. */
  lap: number;
  /** Came in under caution (any flag but green). */
  underCaution: boolean;
  /** Pit-road time, entry to exit, in seconds. */
  pitRoadSeconds: number;
  /** Stationary time in the box, in seconds; null when not measured. */
  boxSeconds: number | null;
  type: PitStopType;
  /** Running position before and after the stop (0 when not given). */
  inRank: number;
  outRank: number;
  /** Positive = gained places on pit road. */
  positionsGained: number;
}

const pitSchema = z.object({
  vehicle_number: z.union([z.string(), z.number()]).transform(String),
  driver_name: str,
  lap_count: num,
  pit_in_flag_status: num,
  total_duration: num,
  pit_stop_duration: num,
  pit_stop_type: str,
  left_front_tire_changed: z.boolean().catch(false),
  left_rear_tire_changed: z.boolean().catch(false),
  right_front_tire_changed: z.boolean().catch(false),
  right_rear_tire_changed: z.boolean().catch(false),
  pit_in_rank: num,
  pit_out_rank: num,
  positions_gained_lost: num,
});

function stopType(stop: z.infer<typeof pitSchema>): PitStopType {
  const left = stop.left_front_tire_changed || stop.left_rear_tire_changed;
  const right = stop.right_front_tire_changed || stop.right_rear_tire_changed;
  if (left && right) return 'four';
  if (right) return 'right';
  if (left) return 'left';
  // The tyre flags are sometimes missing when the type says what was done.
  if (stop.pit_stop_type === 'FOUR_WHEEL_CHANGE') return 'four';
  if (stop.pit_stop_type === 'TWO_WHEEL_CHANGE_RIGHT') return 'right';
  if (stop.pit_stop_type === 'TWO_WHEEL_CHANGE_LEFT') return 'left';
  return 'none';
}

/** Pit stops in the order they happened. The pre-race lap-0 rows (all -1) are dropped. */
export function parsePitStops(raw: unknown): PitStop[] {
  if (!Array.isArray(raw)) return [];
  return rows(raw, pitSchema)
    .filter((s) => s.lap_count > 0 && s.total_duration > 0)
    .map((s): PitStop => ({
      carNumber: s.vehicle_number.trim(),
      name: cleanDriverName(s.driver_name),
      lap: s.lap_count,
      underCaution: s.pit_in_flag_status !== 1,
      pitRoadSeconds: s.total_duration,
      boxSeconds: s.pit_stop_duration > 0 ? s.pit_stop_duration : null,
      type: stopType(s),
      inRank: Math.max(0, s.pit_in_rank),
      outRank: Math.max(0, s.pit_out_rank),
      positionsGained: s.positions_gained_lost,
    }))
    .sort((a, b) => a.lap - b.lap);
}
