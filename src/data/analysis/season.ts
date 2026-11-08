import type { Manufacturer } from '../model/types.ts';
import type { RaceSummary } from '../feeds/race.ts';

// Season figures built from each points race's official results (weekend feeds). Points are
// the sum of what each race paid, so they don't include penalties or the playoff resets; the
// standings line uses the place NASCAR gives after each race instead.

/** Season total and place by driver id, as NASCAR scored them at some point in the season. */
export type OfficialStandings = ReadonlyMap<number, { points: number; position: number }>;

export interface DriverSeason {
  driverId: number;
  name: string;
  /** From the driver's latest race. */
  carNumber: string;
  manufacturer: Manufacturer;
  team: string | null;
  starts: number;
  wins: number;
  top5: number;
  top10: number;
  poles: number;
  lapsLed: number;
  /** Finished anything other than running. */
  dnfs: number;
  avgStart: number | null;
  avgFinish: number | null;
  /** Average places gained from start to finish (positive = moved forward). */
  avgGained: number | null;
  /** Points earned in races, added up after each race (same index as the races). */
  pointsAfter: number[];
  /**
   * Official season total after each race, with penalties and playoff resets; null where it
   * isn't known (no standings for that race, or the driver isn't in them).
   */
  officialAfter: (number | null)[];
  /** Place in the standings after each race; null where NASCAR doesn't give one. */
  standingAfter: (number | null)[];
  /** Finishing position in each race; null where the driver didn't race. */
  finishes: (number | null)[];
}

export interface GroupSeason {
  key: string;
  name: string;
  /** Distinct drivers who raced for it. */
  drivers: number;
  starts: number;
  wins: number;
  top5: number;
  top10: number;
  lapsLed: number;
  avgFinish: number | null;
  bestFinish: number | null;
  /** Manufacturer groups only. */
  manufacturer?: Manufacturer | undefined;
}

const average = (values: readonly number[]): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export const isDnf = (status: string) => status !== '' && status.toLowerCase() !== 'running';

/** Per-driver season figures, in the order of the latest standings (then by points). */
export function seasonByDriver(
  races: readonly RaceSummary[],
  official: readonly (OfficialStandings | null)[] = [],
): DriverSeason[] {
  const drivers = new Map<
    number,
    DriverSeason & { starts_: number[]; finishes_: number[]; gained_: number[] }
  >();
  races.forEach((race, index) => {
    for (const r of race.results) {
      let d = drivers.get(r.driverId);
      if (!d) {
        d = {
          driverId: r.driverId,
          name: r.name,
          carNumber: r.carNumber,
          manufacturer: r.manufacturer,
          team: r.team,
          starts: 0,
          wins: 0,
          top5: 0,
          top10: 0,
          poles: 0,
          lapsLed: 0,
          dnfs: 0,
          avgStart: null,
          avgFinish: null,
          avgGained: null,
          pointsAfter: new Array<number>(races.length).fill(0),
          officialAfter: new Array<number | null>(races.length).fill(null),
          standingAfter: new Array<number | null>(races.length).fill(null),
          finishes: new Array<number | null>(races.length).fill(null),
          starts_: [],
          finishes_: [],
          gained_: [],
        };
        drivers.set(r.driverId, d);
      }
      d.name = r.name;
      d.carNumber = r.carNumber;
      d.manufacturer = r.manufacturer;
      d.team = r.team ?? d.team;
      d.starts += 1;
      if (r.finish === 1) d.wins += 1;
      if (r.finish <= 5) d.top5 += 1;
      if (r.finish <= 10) d.top10 += 1;
      if (r.start === 1) d.poles += 1;
      d.lapsLed += r.lapsLed;
      if (isDnf(r.status)) d.dnfs += 1;
      d.finishes[index] = r.finish;
      d.finishes_.push(r.finish);
      if (r.start > 0) {
        d.starts_.push(r.start);
        d.gained_.push(r.start - r.finish);
      }
      d.pointsAfter[index] = r.points; // made cumulative below
      d.standingAfter[index] = r.pointsPosition > 0 ? r.pointsPosition : null;
    }
  });

  const result: DriverSeason[] = [];
  for (const { starts_, finishes_, gained_, ...d } of drivers.values()) {
    let total = 0;
    d.pointsAfter = d.pointsAfter.map((p) => (total += p));
    // The official standings carry everyone with points, including after races they missed.
    official.forEach((standings, i) => {
      const entry = standings?.get(d.driverId);
      if (!entry || i >= races.length) return;
      d.officialAfter[i] = entry.points;
      d.standingAfter[i] = entry.position;
    });
    d.avgStart = average(starts_);
    d.avgFinish = average(finishes_);
    d.avgGained = average(gained_); // races with a known start only
    result.push(d);
  }
  const last = races.length - 1;
  return result.sort((a, b) => {
    const sa = a.standingAfter[last] ?? Infinity;
    const sb = b.standingAfter[last] ?? Infinity;
    return sa - sb || (b.pointsAfter[last] ?? 0) - (a.pointsAfter[last] ?? 0);
  });
}

function groupBy(
  races: readonly RaceSummary[],
  keyOf: (r: RaceSummary['results'][number]) => { key: string; name: string } | null,
): Map<string, GroupSeason & { finishes_: number[]; drivers_: Set<number> }> {
  const groups = new Map<string, GroupSeason & { finishes_: number[]; drivers_: Set<number> }>();
  for (const race of races) {
    for (const r of race.results) {
      const id = keyOf(r);
      if (!id) continue;
      let g = groups.get(id.key);
      if (!g) {
        g = {
          ...id,
          drivers: 0,
          starts: 0,
          wins: 0,
          top5: 0,
          top10: 0,
          lapsLed: 0,
          avgFinish: null,
          bestFinish: null,
          finishes_: [],
          drivers_: new Set(),
        };
        groups.set(id.key, g);
      }
      g.starts += 1;
      if (r.finish === 1) g.wins += 1;
      if (r.finish <= 5) g.top5 += 1;
      if (r.finish <= 10) g.top10 += 1;
      g.lapsLed += r.lapsLed;
      g.finishes_.push(r.finish);
      g.drivers_.add(r.driverId);
    }
  }
  return groups;
}

function finishGroups(
  groups: ReturnType<typeof groupBy>,
  extra?: (g: GroupSeason) => GroupSeason,
): GroupSeason[] {
  return [...groups.values()]
    .map(({ finishes_, drivers_, ...g }) => {
      const out = {
        ...g,
        drivers: drivers_.size,
        avgFinish: average(finishes_),
        bestFinish: finishes_.length ? Math.min(...finishes_) : null,
      };
      return extra ? extra(out) : out;
    })
    .sort(
      (a, b) =>
        b.wins - a.wins || b.top5 - a.top5 || (a.avgFinish ?? Infinity) - (b.avgFinish ?? Infinity),
    );
}

/** Per-team figures (teams as named in the results), best first. */
export function seasonByTeam(races: readonly RaceSummary[]): GroupSeason[] {
  const groups = groupBy(races, (r) =>
    r.team ? { key: r.team.toLowerCase().replace(/[^a-z0-9]/g, ''), name: r.team } : null,
  );
  return finishGroups(groups);
}

/** Per-manufacturer figures, best first. */
export function seasonByManufacturer(races: readonly RaceSummary[]): GroupSeason[] {
  const makes = new Map<string, Manufacturer>();
  const groups = groupBy(races, (r) => {
    const key = r.manufacturer.code || r.manufacturer.name;
    if (!key || key === 'Unknown') return null;
    makes.set(key, r.manufacturer);
    return { key, name: r.manufacturer.name };
  });
  return finishGroups(groups, (g) => ({ ...g, manufacturer: makes.get(g.key) }));
}

/**
 * Whether today's standings are the latest race's with a few changes (penalties), rather than
 * a feed that hasn't caught up with the race yet (where nearly everyone's total differs).
 */
export function isPenaltyUpdate(
  afterRace: OfficialStandings | null,
  current: OfficialStandings,
): boolean {
  if (!afterRace) return true;
  let differ = 0;
  let shared = 0;
  for (const [id, entry] of afterRace) {
    const now = current.get(id);
    if (!now) continue;
    shared += 1;
    if (now.points !== entry.points) differ += 1;
  }
  return shared > 0 && differ <= shared / 4;
}
