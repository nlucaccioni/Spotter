import { z } from 'zod';
import { flagFromCode } from '../model/flags.ts';
import { gapToLeader, intervalToCarAhead } from '../model/gaps.ts';
import { manufacturerFromCode, seriesFromId } from '../model/lookups.ts';
import { parseDriverName } from '../model/names.ts';
import type { CarState, FastestLap, LapRange, PitStop, Session } from '../model/types.ts';
import {
  rawLiveFeedSchema,
  rawVehicleSchema,
  type RawLapRange,
  type RawPitStop,
  type RawVehicle,
} from './liveFeed.schema.ts';

export interface ParseIssue {
  kind: 'vehicle-dropped';
  /** Index in the raw `vehicles` array. */
  index: number;
  message: string;
}

export type ParseResult =
  { ok: true; session: Session; issues: ParseIssue[] } | { ok: false; error: string };

/** Raw live-feed JSON -> normalized Session. Pure; callers decide how to log issues. */
export function parseLiveFeed(raw: unknown): ParseResult {
  const root = rawLiveFeedSchema.safeParse(raw);
  if (!root.success) return { ok: false, error: z.prettifyError(root.error) };
  const feed = root.data;

  const issues: ParseIssue[] = [];
  const vehicles: RawVehicle[] = [];
  feed.vehicles.forEach((value, index) => {
    const result = rawVehicleSchema.safeParse(value);
    if (result.success) vehicles.push(result.data);
    else issues.push({ kind: 'vehicle-dropped', index, message: z.prettifyError(result.error) });
  });
  vehicles.sort((a, b) => a.running_position - b.running_position);

  const race: RaceBounds = { lapsInRace: feed.laps_in_race, elapsedSeconds: feed.elapsed_time };
  const cars = vehicles.map((v, i) => toCar(v, i === 0 ? undefined : vehicles[i - 1], race));

  const session: Session = {
    raceId: feed.race_id,
    runId: feed.run_id,
    runName: feed.run_name,
    runType: feed.run_type,
    series: seriesFromId(feed.series_id),
    track: { id: feed.track_id, name: feed.track_name, lengthMiles: feed.track_length },
    lap: feed.lap_number,
    lapsInRace: feed.laps_in_race,
    lapsToGo: feed.laps_to_go,
    elapsedSeconds: feed.elapsed_time,
    flag: flagFromCode(feed.flag_state),
    updatedAtMs: parseTimestamp(feed.time_of_day_os),
    stage: feed.stage && {
      number: feed.stage.stage_num,
      endLap: feed.stage.finish_at_lap,
      laps: feed.stage.laps_in_stage,
    },
    cautions: { segments: feed.number_of_caution_segments, laps: feed.number_of_caution_laps },
    leadChanges: feed.number_of_lead_changes,
    leaders: feed.number_of_leaders,
    fastestLap: fastestLap(cars),
    cars,
  };
  return { ok: true, session, issues };
}

function toCar(v: RawVehicle, ahead: RawVehicle | undefined, race: RaceBounds): CarState {
  const lapsLedRanges = v.laps_led.map(toLapRange);
  const pitStops = toPitStops(v.pit_stops, race);
  return {
    position: v.running_position,
    carNumber: v.vehicle_number,
    driverId: v.driver.driver_id,
    name: parseDriverName(v.driver),
    manufacturer: manufacturerFromCode(v.vehicle_manufacturer),
    sponsor: v.sponsor_name,
    delta: v.delta,
    gapToLeader: gapToLeader(v.delta, ahead === undefined),
    interval: intervalToCarAhead(v.delta, ahead?.delta),
    lapsCompleted: v.laps_completed,
    lastLap: positive(v.last_lap_time)
      ? { seconds: v.last_lap_time, mph: positive(v.last_lap_speed) ? v.last_lap_speed : null }
      : null,
    bestLap: positive(v.best_lap_time)
      ? {
          seconds: v.best_lap_time,
          mph: positive(v.best_lap_speed) ? v.best_lap_speed : null,
          lap: v.best_lap,
        }
      : null,
    lapsLed: lapsLedRanges.reduce(
      (sum, r) => sum + Math.max(0, r.end - Math.max(1, r.start) + 1),
      0,
    ),
    lapsLedRanges,
    pitStops,
    statusCode: v.status,
    isOnTrack: v.is_on_track,
    isOnPitRoad: onPitRoad(v, pitStops.at(-1), race),
    isOnDvp: v.is_on_dvp,
    startingPosition: v.starting_position,
    positionsGained: v.starting_position === null ? null : v.starting_position - v.running_position,
    stats: {
      averageRunningPosition: v.average_running_position,
      averageSpeed: v.average_speed,
      averageRestartSpeed: v.average_restart_speed,
      passesMade: v.passes_made,
      timesPassed: v.times_passed,
      qualityPasses: v.quality_passes,
      passingDifferential: v.passing_differential,
      fastestLapsRun: v.fastest_laps_run,
      lapsPositionImproved: v.laps_position_improved,
      positionDifferentialLast10Percent: v.position_differential_last_10_percent,
    },
  };
}

// Allowance for a stop: a normal one takes well under a minute, penalties and repairs longer.
// A car that's been off track for longer than this is assumed to be in the garage.
const PIT_ROAD_MAX_SECONDS = 300;

// The feed reports `is_on_track: false` while a car is on pit road, and fills in
// `pit_out_elapsed_time` as soon as the car enters, updating it as the car moves down pit road
// (confirmed live 2026-10-04; see docs/feed-notes.md). So "off track with a fresh stop" is the
// on-pit-road signal. A stop with a pit-in time but no pit-out time also counts (replays).
function onPitRoad(v: RawVehicle, stop: PitStop | undefined, race: RaceBounds): boolean {
  if (v.status !== 1 || !stop || stop.inTime === null) return false;
  if (stop.outTime === null) return true;
  if (v.is_on_track) return false;
  return race.elapsedSeconds <= 0 || race.elapsedSeconds - stop.inTime <= PIT_ROAD_MAX_SECONDS;
}

function toLapRange(r: RawLapRange): LapRange {
  return { start: r.start_lap, end: r.end_lap };
}

export interface RaceBounds {
  lapsInRace: number;
  elapsedSeconds: number;
}

// Dropped (see docs/feed-notes.md):
// - the all-zero placeholder entries at the start of every car's list;
// - post-race pit-road entries: after the checkered flag, cars drive down pit road and the
//   feed logs that as a stop on the leader's final lap, with a pit-in time after the
//   session's elapsed time (or no times at all).
export function toPitStops(raw: RawPitStop[], race: RaceBounds): PitStop[] {
  const isPlaceholder = (p: RawPitStop) =>
    p.pit_in_lap_count === 0 && !positive(p.pit_in_elapsed_time);
  const isPostRace = (p: RawPitStop) =>
    (race.lapsInRace > 0 && (p.pit_in_leader_lap ?? 0) >= race.lapsInRace) ||
    (race.elapsedSeconds > 0 && (p.pit_in_elapsed_time ?? 0) > race.elapsedSeconds);
  return raw
    .filter((p) => !isPlaceholder(p) && !isPostRace(p))
    .map((p) => {
      const inTime = positive(p.pit_in_elapsed_time) ? p.pit_in_elapsed_time : null;
      const outTime = positive(p.pit_out_elapsed_time) ? p.pit_out_elapsed_time : null;
      return {
        lap: p.pit_in_lap_count,
        leaderLap: positive(p.pit_in_leader_lap) ? p.pit_in_leader_lap : null,
        inTime,
        outTime,
        durationSeconds:
          inTime !== null && outTime !== null ? Math.round((outTime - inTime) * 1000) / 1000 : null,
        inRank: p.pit_in_rank,
        outRank: p.pit_out_rank,
        positionChange: p.positions_gained_lossed,
      };
    });
}

function fastestLap(cars: CarState[]): FastestLap | null {
  let best: FastestLap | null = null;
  for (const car of cars) {
    if (car.bestLap && (best === null || car.bestLap.seconds < best.seconds)) {
      best = { carNumber: car.carNumber, seconds: car.bestLap.seconds, lap: car.bestLap.lap };
    }
  }
  return best;
}

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

// The feed uses 0 for "no value" in times and speeds.
function positive(value: number | null): value is number {
  return value !== null && value > 0;
}
