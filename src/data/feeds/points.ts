import { z } from 'zod';
import { manufacturerFromName } from '../model/lookups.ts';
import { parseDriverName } from '../model/names.ts';
import type { DriverName, Manufacturer } from '../model/types.ts';

// Points feeds (CORS: *, see docs/feed-notes.md). Parsed tolerantly like the live feed: bad rows
// are dropped individually and missing numbers default to 0.

/** Live points for whatever session is live (like live-feed.json, it has no series/race id). */
export const LIVE_POINTS_URL = 'https://cf.nascar.com/live/feeds/live-points.json';

/** Season standings for a series (1 Cup, 2 O'Reilly, 3 Truck). */
export function seasonPointsUrl(year: number, seriesId: number): string {
  return `https://cf.nascar.com/cacher/${year}/${seriesId}/points-feed.json`;
}

const num = z.number().catch(0);
const str = z.string().catch('');
const bool = z.boolean().catch(false);

export interface LivePointsEntry {
  position: number;
  driverId: number | null;
  carNumber: string;
  name: DriverName;
  points: number;
  /** Negative = behind (as the feed gives it). */
  behindLeader: number;
  behindNext: number;
  earnedThisRace: number;
  /** Stage 1–3 points this race, and whether the driver won that stage. */
  stages: { points: number; won: boolean }[];
  bonusPoints: number;
  isPointsEligible: boolean;
  wins: number;
  top5: number;
  top10: number;
}

const liveSchema = z.object({
  points_position: z.number().int().positive(),
  driver_id: z.number().nullable().catch(null),
  car_number: str,
  first_name: str,
  last_name: str,
  is_in_chase: bool,
  is_points_eligible: z.boolean().catch(true),
  points: num,
  delta_leader: num,
  delta_next: num,
  points_earned_this_race: num,
  stage_1_points: num,
  stage_2_points: num,
  stage_3_points: num,
  stage_1_winner: bool,
  stage_2_winner: bool,
  stage_3_winner: bool,
  bonus_points: num,
  wins: num,
  top_5: num,
  top_10: num,
});

export function parseLivePoints(raw: unknown): LivePointsEntry[] {
  return rows(raw, liveSchema)
    .map((r) => ({
      position: r.points_position,
      driverId: r.driver_id,
      carNumber: r.car_number.trim(),
      name: parseDriverName({
        full_name: `${r.first_name} ${r.last_name}`,
        first_name: r.first_name,
        last_name: r.last_name,
        is_in_chase: r.is_in_chase,
      }),
      points: r.points,
      behindLeader: r.delta_leader,
      behindNext: r.delta_next,
      earnedThisRace: r.points_earned_this_race,
      stages: [
        { points: r.stage_1_points, won: r.stage_1_winner },
        { points: r.stage_2_points, won: r.stage_2_winner },
        { points: r.stage_3_points, won: r.stage_3_winner },
      ],
      bonusPoints: r.bonus_points,
      isPointsEligible: r.is_points_eligible,
      wins: r.wins,
      top5: r.top_5,
      top10: r.top_10,
    }))
    .sort((a, b) => a.position - b.position);
}

export interface SeasonStanding {
  position: number;
  driverId: number | null;
  carNumber: string;
  name: DriverName;
  manufacturer: Manufacturer;
  points: number;
  /** Points earned in the most recent race. */
  lastRacePoints: number;
  behindLeader: number;
  behindNext: number;
  starts: number;
  wins: number;
  top5: number;
  top10: number;
  stageWins: number;
  lapsLed: number;
  dnf: number;
  poles: number;
}

const seasonSchema = z.object({
  position: z.number().int().positive(),
  driver_id: z.number().nullable().catch(null),
  car_no: str,
  driver_first_name: str,
  driver_last_name: str,
  driver_suffix: str,
  manufacturer: str,
  points: num,
  points_earned: num,
  delta_leader: num,
  delta_next: num,
  starts: num,
  wins: num,
  top_5: num,
  top_10: num,
  stage_1_wins: num,
  stage_2_wins: num,
  stage_3_wins: num,
  laps_led: num,
  dnf: num,
  poles: num,
});

export function parseSeasonPoints(raw: unknown): SeasonStanding[] {
  return rows(raw, seasonSchema)
    .map((r) => {
      const last = [r.driver_last_name, normalizeSuffix(r.driver_suffix)]
        .filter((s) => s.trim())
        .join(' ');
      return {
        position: r.position,
        driverId: r.driver_id,
        carNumber: r.car_no.trim(),
        name: parseDriverName({
          full_name: `${r.driver_first_name} ${last}`,
          first_name: r.driver_first_name,
          last_name: last,
          is_in_chase: false,
        }),
        manufacturer: manufacturerFromName(r.manufacturer),
        points: r.points,
        lastRacePoints: r.points_earned,
        behindLeader: r.delta_leader,
        behindNext: r.delta_next,
        starts: r.starts,
        wins: r.wins,
        top5: r.top_5,
        top10: r.top_10,
        stageWins: r.stage_1_wins + r.stage_2_wins + r.stage_3_wins,
        lapsLed: r.laps_led,
        dnf: r.dnf,
        poles: r.poles,
      };
    })
    .sort((a, b) => a.position - b.position);
}

/**
 * Places gained (+) or lost in the standings during this race, per entry, in the same order.
 * Pre-race points are the total minus points earned this race; both rankings count ties as
 * equal (1 + number of drivers strictly ahead), so tied drivers the feed happens to list in a
 * different order don't show a false move.
 */
export function standingsMoves(entries: readonly LivePointsEntry[]): number[] {
  const now = entries.map((e) => e.points);
  const before = entries.map((e) => e.points - e.earnedThisRace);
  const rank = (values: number[], v: number) => 1 + values.filter((x) => x > v).length;
  return entries.map((_, i) => rank(before, before[i]!) - rank(now, now[i]!));
}

/** The season feed writes "Jr" where the live feed writes "Jr."; match the live feed. */
function normalizeSuffix(suffix: string): string {
  const s = suffix.trim();
  return /^(jr|sr)$/i.test(s) ? `${s[0]!.toUpperCase()}${s.slice(1).toLowerCase()}.` : s;
}

function rows<T extends z.ZodType>(raw: unknown, schema: T): z.output<T>[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const result = schema.safeParse(item);
    return result.success ? [result.data as z.output<T>] : [];
  });
}
