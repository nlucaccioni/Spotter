import type {
  CautionSegment,
  LapTimes,
  LeaderSpell,
  PitStop,
  RaceResult,
  RaceSummary,
} from '../feeds/race.ts';

// Single-race figures from lap-times.json and live-pit-data.json.

/**
 * Laps run entirely under green: green at the end of this lap and the one before, so restart
 * laps don't count. Index = lap number.
 */
export function cleanGreenLaps(flags: readonly number[]): boolean[] {
  return flags.map((flag, lap) => lap >= 2 && flag === 1 && flags[lap - 1] === 1);
}

/** Laps a car spent on or leaving pit road (in-lap and out-lap), by car number. */
function pitLaps(stops: readonly PitStop[]): Map<string, Set<number>> {
  const laps = new Map<string, Set<number>>();
  for (const stop of stops) {
    const set = laps.get(stop.carNumber) ?? new Set<number>();
    set.add(stop.lap);
    set.add(stop.lap + 1);
    laps.set(stop.carNumber, set);
  }
  return laps;
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Green-flag laps worth comparing for one car: clean green, off pit road, no slow-downs. */
function representativeLaps(
  data: LapTimes,
  carIndex: number,
  green: readonly boolean[],
  pits: ReadonlyMap<string, ReadonlySet<number>>,
  cutoff: number,
): { lap: number; time: number }[] {
  const car = data.cars[carIndex]!;
  const pitted = pits.get(car.carNumber);
  const laps: { lap: number; time: number }[] = [];
  car.times.forEach((time, lap) => {
    if (time === null || !green[lap] || pitted?.has(lap) || time > cutoff) return;
    laps.push({ lap, time });
  });
  return laps;
}

/** A lap more than 10% slower than the field's typical green lap is a problem, not pace. */
function slowLapCutoff(data: LapTimes, green: readonly boolean[]): number {
  const all: number[] = [];
  for (const car of data.cars) {
    car.times.forEach((time, lap) => {
      if (time !== null && green[lap]) all.push(time);
    });
  }
  const typical = median(all);
  return typical === null ? Infinity : typical * 1.1;
}

export interface CarPace {
  carNumber: string;
  name: string;
  driverId: number | null;
  /** Median clean green-flag lap, seconds. */
  median: number | null;
  /** Fastest lap of the race, seconds. */
  best: number | null;
  greenLaps: number;
}

/** Each car's green-flag pace, fastest first (cars with too few clean laps go last). */
export function racePace(data: LapTimes, stops: readonly PitStop[], minLaps = 10): CarPace[] {
  const green = cleanGreenLaps(data.flags);
  const pits = pitLaps(stops);
  const cutoff = slowLapCutoff(data, green);
  return data.cars
    .map((car, index): CarPace => {
      const laps = representativeLaps(data, index, green, pits, cutoff);
      const times = car.times.filter((t): t is number => t !== null);
      return {
        carNumber: car.carNumber,
        name: car.name,
        driverId: car.driverId,
        median: laps.length >= minLaps ? median(laps.map((l) => l.time)) : null,
        best: times.length ? Math.min(...times) : null,
        greenLaps: laps.length,
      };
    })
    .sort((a, b) => (a.median ?? Infinity) - (b.median ?? Infinity));
}

/**
 * Average clean lap time by tyre age (green laps since the car's last stop), for one car.
 * Index = tyre age; null where fewer than `minSamples` runs reached that age.
 */
export function tireFalloff(
  data: LapTimes,
  stops: readonly PitStop[],
  carNumber: string,
  minSamples = 2,
): (number | null)[] {
  const index = data.cars.findIndex((c) => c.carNumber === carNumber);
  if (index < 0) return [];
  const green = cleanGreenLaps(data.flags);
  const pits = pitLaps(stops);
  const cutoff = slowLapCutoff(data, green);
  const usable = new Map(
    representativeLaps(data, index, green, pits, cutoff).map((l) => [l.lap, l.time]),
  );
  const stopLaps = new Set(stops.filter((s) => s.carNumber === carNumber).map((s) => s.lap));

  const sums: number[] = [];
  const counts: number[] = [];
  let age = 0;
  for (let lap = 1; lap <= data.laps; lap++) {
    if (stopLaps.has(lap)) {
      age = 0;
      continue;
    }
    if (data.flags[lap] === 1) age += 1;
    const time = usable.get(lap);
    if (time === undefined || age === 0) continue;
    sums[age] = (sums[age] ?? 0) + time;
    counts[age] = (counts[age] ?? 0) + 1;
  }
  const out: (number | null)[] = [];
  for (let a = 0; a < counts.length; a++) {
    const n = counts[a] ?? 0;
    out[a] = n >= minSamples ? sums[a]! / n : null;
  }
  // Trailing ages with too few runs are noise.
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}

export interface CarPitSummary {
  carNumber: string;
  name: string;
  stops: number;
  greenStops: number;
  /** Average and best pit-road time (entry to exit), seconds. */
  avgPitRoad: number | null;
  bestPitRoad: number | null;
  /** Average time stopped in the box, seconds. */
  avgBox: number | null;
  /**
   * Net places gained on pit road during cautions, where stops are on equal terms (a green-flag
   * stop always drops a car down the order while others stay out).
   */
  cautionPositionsGained: number;
}

/** Per-car pit-stop summary, in car-number order. */
export function pitSummary(stops: readonly PitStop[]): CarPitSummary[] {
  const byCar = new Map<string, PitStop[]>();
  for (const stop of stops) byCar.set(stop.carNumber, [...(byCar.get(stop.carNumber) ?? []), stop]);
  const avg = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return [...byCar.entries()]
    .map(([carNumber, list]): CarPitSummary => {
      const road = list.map((s) => s.pitRoadSeconds);
      return {
        carNumber,
        name: list[list.length - 1]!.name,
        stops: list.length,
        greenStops: list.filter((s) => !s.underCaution).length,
        avgPitRoad: avg(road),
        bestPitRoad: road.length ? Math.min(...road) : null,
        avgBox: avg(list.flatMap((s) => (s.boxSeconds === null ? [] : [s.boxSeconds]))),
        cautionPositionsGained: list
          .filter((s) => s.underCaution)
          .reduce((sum, s) => sum + s.positionsGained, 0),
      };
    })
    .sort((a, b) => a.carNumber.localeCompare(b.carNumber, undefined, { numeric: true }));
}

/** Runs of caution (or red-flag) laps, as inclusive lap ranges. */
export function cautionRanges(flags: readonly number[]): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  flags.forEach((flag, lap) => {
    if (flag !== 2 && flag !== 3) return;
    const prev = ranges[ranges.length - 1];
    if (prev && prev.to === lap - 1) prev.to = lap;
    else ranges.push({ from: lap, to: lap });
  });
  return ranges;
}

/** Matches caution segments from the weekend feed to the lap-time flags' caution runs. */
export function labelCautions(
  ranges: readonly { from: number; to: number }[],
  segments: readonly CautionSegment[],
) {
  return ranges.map((range) => {
    // The weekend feed's laps run a couple behind; take the nearest start.
    const nearest = [...segments].sort(
      (a, b) => Math.abs(a.startLap - range.from) - Math.abs(b.startLap - range.from),
    )[0];
    const close = nearest && Math.abs(nearest.startLap - range.from) <= 4;
    return { ...range, label: close ? nearest.comment || nearest.reason : '' };
  });
}

/** Who led each lap, as runs of consecutive laps (lap-times.json's P1 at the end of each lap). */
export function leaderSpells(data: LapTimes): LeaderSpell[] {
  const spells: LeaderSpell[] = [];
  for (let lap = 1; lap <= data.laps; lap++) {
    const leader = data.cars.find((c) => c.positions[lap] === 1);
    if (!leader) continue;
    const prev = spells[spells.length - 1];
    if (prev && prev.carNumber === leader.carNumber && prev.endLap === lap - 1) prev.endLap = lap;
    else spells.push({ startLap: lap, endLap: lap, carNumber: leader.carNumber });
  }
  return spells;
}

/**
 * A race still running has no official results yet. This fills them in from the lap times so
 * far: the running order (as "finish"), grid spots, laps led, leaders and cautions. Whatever the
 * weekend feed already has (stage results, caution reasons) is kept. Returns the summary
 * unchanged once official results are out.
 */
export function provisionalSummary(summary: RaceSummary, data: LapTimes): RaceSummary {
  if (summary.results.length > 0 || data.cars.length === 0) return summary;
  const spells = leaderSpells(data);
  const order = data.cars
    .map((car) => {
      let lap = car.positions.length - 1;
      while (lap > 0 && car.positions[lap] === null) lap--;
      return { car, lap, position: lap > 0 ? car.positions[lap]! : null };
    })
    .filter((x) => x.position !== null)
    // Cars on the latest lap first, in running order; cars whose laps stopped earlier after.
    .sort((a, b) => b.lap - a.lap || a.position! - b.position!);
  const results = order.map(({ car, lap }, i): RaceResult => ({
    driverId: car.driverId ?? 0,
    carNumber: car.carNumber,
    name: car.name,
    team: null,
    manufacturer: car.manufacturer,
    finish: i + 1,
    start: car.positions[0] ?? 0,
    lapsLed: car.positions.filter((p, l) => l > 0 && p === 1).length,
    lapsCompleted: lap,
    status: '',
    points: 0,
    playoffPoints: 0,
    pointsPosition: 0,
  }));
  const cautions = cautionRanges(data.flags);
  return {
    ...summary,
    actualLaps: data.laps,
    leadChanges: Math.max(0, spells.length - 1),
    leaders: new Set(spells.map((s) => s.carNumber)).size,
    cautions: cautions.length,
    cautionLaps: cautions.reduce((sum, c) => sum + c.to - c.from + 1, 0),
    results,
    leaderSpells: spells,
  };
}
