import { describe, expect, it } from 'vitest';
import { parseLiveFeed, toPitStops } from '../../src/data/feeds/liveFeed.parse.ts';
import { formatGap } from '../../src/data/model/gaps.ts';
import type { Session } from '../../src/data/model/types.ts';
import kansas from '../fixtures/cup-2026-kansas-final.json';

function parseOk(raw: unknown): Session {
  const result = parseLiveFeed(raw);
  if (!result.ok) throw new Error(result.error);
  expect(result.issues).toEqual([]);
  return result.session;
}

const clone = <T>(value: T): T => structuredClone(value);
const car = (session: Session, carNumber: string) => {
  const found = session.cars.find((c) => c.carNumber === carNumber);
  if (!found) throw new Error(`no car #${carNumber}`);
  return found;
};

describe('parseLiveFeed — Kansas 2026 fixture (finished race)', () => {
  const session = parseOk(kansas);

  it('parses the session header', () => {
    expect(session).toMatchObject({
      raceId: 5628,
      runName: 'Hollywood Casino 400',
      runType: 3,
      series: { id: 1, name: 'Cup Series' },
      track: { id: 41, name: 'Kansas Speedway', lengthMiles: 1.5 },
      lap: 267,
      lapsInRace: 267,
      lapsToGo: 0,
      flag: { code: 9, kind: 'checkered' },
      stage: { number: 3, endLap: 267, laps: 102 },
      cautions: { segments: 5, laps: 26 },
      leadChanges: 13,
      leaders: 7,
    });
    expect(session.updatedAtMs).toBe(Date.parse('2026-09-28T03:11:25.001Z'));
  });

  it('keeps the whole field, sorted by position', () => {
    expect(session.cars).toHaveLength(36);
    expect(session.cars.map((c) => c.position)).toEqual(
      Array.from({ length: 36 }, (_, i) => i + 1),
    );
  });

  it('normalizes the leader', () => {
    const leader = session.cars[0]!;
    expect(leader).toMatchObject({
      carNumber: '5',
      name: { full: 'Kyle Larson', initial: 'K. Larson', badges: ['contender'] },
      manufacturer: { name: 'Chevrolet' },
      gapToLeader: { kind: 'leader' },
      interval: { kind: 'leader' },
      lastLap: { seconds: 32.766, mph: 164.805 },
      bestLap: { seconds: 30.076, lap: 2 },
      lapsLed: 235,
      positionsGained: 1,
    });
  });

  it('computes gaps and intervals on and off the lead lap', () => {
    const at = (pos: number) => session.cars[pos - 1]!;
    expect(formatGap(at(3).gapToLeader)).toBe('+2.391');
    expect(formatGap(at(4).interval)).toBe('+0.037');
    expect(formatGap(at(21).gapToLeader)).toBe('-1 L');
    expect(formatGap(at(21).interval)).toBe('-1 L');
    expect(formatGap(at(22).interval)).toBe('—');
    expect(formatGap(at(35).gapToLeader)).toBe('-10 L');
  });

  it('parses badges from real names', () => {
    expect(car(session, '38').name).toMatchObject({ full: 'Zane Smith', badges: [] });
    expect(car(session, '88').name.badges).toEqual(['rookie']);
    expect(car(session, '33').name).toMatchObject({ last: 'Hill', badges: ['ineligible'] });
  });

  it('flags the car that is out of the race', () => {
    expect(car(session, '4')).toMatchObject({
      statusCode: 3,
      isOnTrack: false,
      lapsCompleted: 112,
      gapToLeader: { kind: 'laps', laps: 155 },
    });
  });

  it("doesn't count lap 0 (the pole-sitter's pace laps) as a lap led", () => {
    expect(car(session, '22').lapsLedRanges[0]).toEqual({ start: 0, end: 0 });
    const total = session.cars.reduce((sum, c) => sum + c.lapsLed, 0);
    expect(total).toBe(267);
  });

  it('drops placeholder pit stops', () => {
    const larson = car(session, '5');
    expect(larson.pitStops).toHaveLength(5);
    expect(larson.pitStops[0]).toMatchObject({
      lap: 36,
      inTime: 1228.53,
      outTime: 1265.351,
      durationSeconds: 36.821,
      positionChange: -2,
    });
  });

  it('drops post-race pit-road entries logged on the final lap', () => {
    // Timed entry after the checkered flag (pit-in 10409 s > race elapsed 10361 s).
    expect(car(session, '2').pitStops.at(-1)!.lap).toBeLessThan(267);
    // Untimed entry on the leader's final lap, although #77 was only on its lap 264.
    expect(car(session, '77').pitStops.at(-1)!.inTime).not.toBeNull();
    const all = session.cars.flatMap((c) => c.pitStops);
    expect(all.every((p) => p.inTime !== null && p.outTime !== null)).toBe(true);
    expect(all.every((p) => (p.leaderLap ?? 0) < 267)).toBe(true);
  });

  it('finds the session fastest lap', () => {
    expect(session.fastestLap).toEqual({ carNumber: '5', seconds: 30.076, lap: 2 });
  });
});

describe('parseLiveFeed — tolerance', () => {
  it('fails cleanly when the root is not a live feed', () => {
    expect(parseLiveFeed(null).ok).toBe(false);
    expect(parseLiveFeed({}).ok).toBe(false);
    expect(parseLiveFeed('<html>').ok).toBe(false);
  });

  it('drops only the vehicle that is missing required fields, and reports it', () => {
    const raw = clone(kansas) as { vehicles: Record<string, unknown>[] };
    delete raw.vehicles[2]!.running_position;
    raw.vehicles[5]!.vehicle_number = '';
    const result = parseLiveFeed(raw);
    if (!result.ok) throw new Error(result.error);
    expect(result.session.cars).toHaveLength(34);
    expect(result.issues.map((i) => i.index)).toEqual([2, 5]);
    expect(result.issues[0]!.kind).toBe('vehicle-dropped');
  });

  it('patches missing or malformed optional fields with defaults', () => {
    const raw = clone(kansas) as Record<string, unknown> & { vehicles: Record<string, unknown>[] };
    delete raw.flag_state;
    raw.stage = 'nonsense';
    raw.time_of_day_os = 'not a date';
    raw.lap_number = null;
    const v = raw.vehicles[0]!;
    delete v.driver;
    v.vehicle_number = 5;
    v.delta = 'fast';
    v.pit_stops = 'none';
    v.laps_led = [{ start_lap: 1, end_lap: 3 }, { bogus: true }];
    v.last_lap_time = 0;

    const session = parseOk(raw);
    expect(session.flag).toEqual({ code: null, kind: 'unknown', label: 'Unknown' });
    expect(session.stage).toBeNull();
    expect(session.updatedAtMs).toBeNull();
    expect(session.lap).toBe(0);

    const first = session.cars[0]!;
    expect(first.carNumber).toBe('5');
    expect(first.name.full).toBe('Unknown driver');
    expect(first.delta).toBeNull();
    expect(first.gapToLeader).toEqual({ kind: 'leader' });
    expect(session.cars[1]!.interval).toEqual({ kind: 'unknown' });
    expect(first.pitStops).toEqual([]);
    expect(first.lapsLed).toBe(3);
    expect(first.lastLap).toBeNull();
  });

  it('ignores unknown fields', () => {
    const raw = clone(kansas) as Record<string, unknown>;
    raw.some_new_field = { nested: true };
    expect(parseLiveFeed(raw).ok).toBe(true);
  });

  it('renders an unmapped flag code instead of failing', () => {
    expect(parseOk({ ...clone(kansas), flag_state: 7 }).flag.label).toBe('Unknown (7)');
  });

  it('handles an empty field', () => {
    const session = parseOk({ ...clone(kansas), vehicles: [] });
    expect(session.cars).toEqual([]);
    expect(session.fastestLap).toBeNull();
  });
});

describe('parseLiveFeed — on pit road', () => {
  // Mid-race: car #5 entered pit road at 4000 s; the live feed already has a pit-out time.
  function at(elapsed: number, overrides: { is_on_track: boolean; status?: number; out?: number }) {
    const feed = clone(kansas);
    feed.elapsed_time = elapsed;
    feed.laps_in_race = 267;
    const v = feed.vehicles.find((x) => x.vehicle_number === '5')!;
    v.pit_stops = v.pit_stops.filter((p) => p.pit_in_lap_count < 100);
    v.pit_stops.push({
      pit_in_lap_count: 100,
      pit_in_leader_lap: 100,
      pit_in_elapsed_time: 4000,
      pit_out_elapsed_time: overrides.out ?? 4007,
      pit_in_rank: 1,
      pit_out_rank: 1,
      positions_gained_lossed: 0,
    });
    v.is_on_track = overrides.is_on_track;
    v.status = overrides.status ?? 1;
    return car(parseOk(feed), '5');
  }

  it('is on pit road while off track with a fresh stop', () => {
    expect(at(4030, { is_on_track: false }).isOnPitRoad).toBe(true);
  });

  it('is back on track once the feed says so', () => {
    expect(at(4060, { is_on_track: true }).isOnPitRoad).toBe(false);
  });

  it('counts a stop with no pit-out time yet', () => {
    expect(at(4030, { is_on_track: true, out: 0 }).isOnPitRoad).toBe(true);
  });

  it('treats a car off track long after its stop as not on pit road (garage)', () => {
    expect(at(4400, { is_on_track: false }).isOnPitRoad).toBe(false);
  });

  it('never for a car out of the race', () => {
    expect(at(4030, { is_on_track: false, status: 3 }).isOnPitRoad).toBe(false);
  });

  it('is false across the finished Kansas fixture', () => {
    expect(parseOk(kansas).cars.filter((c) => c.isOnPitRoad)).toEqual([]);
  });
});

describe('toPitStops', () => {
  const zero = {
    pit_in_lap_count: 0,
    pit_in_leader_lap: 0,
    pit_in_elapsed_time: 0,
    pit_out_elapsed_time: 0,
    pit_in_rank: 2,
    pit_out_rank: 2,
    positions_gained_lossed: 0,
  };

  const race = { lapsInRace: 267, elapsedSeconds: 5000 };

  it('keeps an in-progress stop (pit-in time, no pit-out time yet)', () => {
    const stops = toPitStops(
      [zero, { ...zero, pit_in_lap_count: 50, pit_in_leader_lap: 50, pit_in_elapsed_time: 2000 }],
      race,
    );
    expect(stops).toEqual([
      expect.objectContaining({ lap: 50, inTime: 2000, outTime: null, durationSeconds: null }),
    ]);
  });

  it('drops stops on the final leader lap or after the session clock', () => {
    const stop = { ...zero, pit_in_lap_count: 100, pit_in_leader_lap: 100 };
    expect(toPitStops([{ ...stop, pit_in_leader_lap: 267 }], race)).toEqual([]);
    expect(toPitStops([{ ...stop, pit_in_elapsed_time: 5001 }], race)).toEqual([]);
    expect(toPitStops([{ ...stop, pit_in_elapsed_time: 4000 }], race)).toHaveLength(1);
  });

  it('applies no race bounds when the feed has none', () => {
    const stop = { ...zero, pit_in_lap_count: 3, pit_in_leader_lap: 3, pit_in_elapsed_time: 90 };
    expect(toPitStops([stop], { lapsInRace: 0, elapsedSeconds: 0 })).toHaveLength(1);
  });
});
