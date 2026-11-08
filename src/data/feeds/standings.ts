import { z } from 'zod';
import { manufacturerFromName } from '../model/lookups.ts';
import type { Manufacturer } from '../model/types.ts';
import { teamKey } from './teams.ts';

// Official owner and manufacturer standings, as nascar.com's standings pages show them
// (cf.nascar.com/cacher/{year}/{series}/final/…, CORS: *). Only today's standings are published,
// not a race-by-race history. Owner points are per car (owner + car number), which is how NASCAR
// scores the owners' championship: there is no official team total.

export function ownerPointsUrl(year: number, seriesId: number): string {
  return `https://cf.nascar.com/cacher/${year}/${seriesId}/final/${seriesId}-owners-points.json`;
}

export function manufacturerPointsUrl(year: number, seriesId: number): string {
  return `https://cf.nascar.com/cacher/${year}/${seriesId}/final/${seriesId}-manufacturer-points.json`;
}

const int = z.union([z.number(), z.string()]).transform(Number).catch(NaN);
const num = z.number().catch(0);
const str = z.string().catch('');

export interface OwnerStanding {
  position: number;
  /** The team name, as the owners' list gives it ("Hendrick Motorsports"). */
  owner: string;
  carNumber: string;
  points: number;
  /** Points behind the leader (0 for the leader). */
  behind: number;
  starts: number;
  wins: number;
  top5: number;
  top10: number;
  dnf: number;
}

const ownerSchema = z.object({
  position: int,
  owner_name: str,
  vehicle_number: z.union([z.string(), z.number()]).transform(String).catch(''),
  points: num,
  delta_leader: num,
  starts: num,
  wins: num,
  top_5: num,
  top_10: num,
  dnf: num,
});

export function parseOwnerPoints(raw: unknown): OwnerStanding[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((item) => {
      const parsed = ownerSchema.safeParse(item);
      if (!parsed.success || !(parsed.data.position > 0)) return [];
      const o = parsed.data;
      return [
        {
          position: o.position,
          owner: o.owner_name.trim().replace(/\s+/g, ' '),
          carNumber: o.vehicle_number.trim(),
          points: o.points,
          behind: Math.abs(o.delta_leader),
          starts: o.starts,
          wins: o.wins,
          top5: o.top_5,
          top10: o.top_10,
          dnf: o.dnf,
        },
      ];
    })
    .sort((a, b) => a.position - b.position);
}

export interface ManufacturerStanding {
  position: number;
  manufacturer: Manufacturer;
  points: number;
  behind: number;
  wins: number;
}

const makeSchema = z.object({
  position: int,
  manufacturer: str,
  points: num,
  wins: num,
});

export function parseManufacturerPoints(raw: unknown): ManufacturerStanding[] {
  if (!Array.isArray(raw)) return [];
  const rows = raw
    .flatMap((item) => {
      const parsed = makeSchema.safeParse(item);
      if (!parsed.success || !(parsed.data.position > 0)) return [];
      const m = parsed.data;
      return [
        {
          position: m.position,
          manufacturer: manufacturerFromName(m.manufacturer),
          points: m.points,
          wins: m.wins,
        },
      ];
    })
    .sort((a, b) => a.position - b.position);
  // The feed gives the gap as "LEADER" or a string; work it out from the points instead.
  const top = rows[0]?.points ?? 0;
  return rows.map((r) => ({ ...r, behind: top - r.points }));
}

/**
 * The best-placed car of each team in the owners' standings, by team key (also without a
 * trailing "racing", like the team logo lookup), so race-result team names find it.
 */
export function bestOwnerCarByTeam(owners: readonly OwnerStanding[]): Map<string, OwnerStanding> {
  const best = new Map<string, OwnerStanding>();
  for (const o of owners) {
    const key = teamKey(o.owner);
    for (const k of [key, key.replace(/racing$/, '')]) {
      const known = best.get(k);
      if (k && (!known || o.position < known.position)) best.set(k, o);
    }
  }
  return best;
}

/** Looks a race-result team name up in bestOwnerCarByTeam's map. */
export function ownerCarFor(
  best: ReadonlyMap<string, OwnerStanding>,
  teamName: string,
): OwnerStanding | undefined {
  const key = teamKey(teamName);
  return best.get(key) ?? best.get(key.replace(/racing$/, ''));
}
