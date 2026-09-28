import { describe, expect, it } from 'vitest';
import { parseLiveFeed } from '../../src/data/feeds/liveFeed.parse.ts';
import { createOutLapTracker } from '../../src/data/model/outLaps.ts';
import type { Session } from '../../src/data/model/types.ts';
import kansas from '../fixtures/cup-2026-kansas-final.json';

type RawFeed = typeof kansas;

/** Mid-race snapshot where car #5 has `laps` completed and a stop on lap 100 in some state. */
function snapshot(laps: number, stop: 'none' | 'in' | 'out'): Session {
  const feed: RawFeed = structuredClone(kansas);
  feed.flag_state = 1;
  feed.lap_number = 150;
  feed.laps_in_race = 267;
  const car = feed.vehicles.find((v) => v.vehicle_number === '5')!;
  car.laps_completed = laps;
  car.pit_stops = car.pit_stops.filter((p) => p.pit_in_lap_count < 100);
  if (stop !== 'none') {
    car.pit_stops.push({
      pit_in_lap_count: 100,
      pit_in_leader_lap: 100,
      pit_in_elapsed_time: 4000,
      pit_out_elapsed_time: stop === 'out' ? 4036 : 0,
      pit_in_rank: 1,
      pit_out_rank: stop === 'out' ? 5 : 0,
      positions_gained_lossed: stop === 'out' ? -4 : 0,
    });
  }
  const result = parseLiveFeed(feed);
  if (!result.ok) throw new Error(result.error);
  return result.session;
}

/** Feeds snapshots in order and returns whether #5 was on its out lap after each. */
function play(...sessions: Session[]): boolean[] {
  const tracker = createOutLapTracker();
  let prev: Session | null = null;
  return sessions.map((s) => {
    const out = tracker.update(prev, s).has('5');
    prev = s;
    return out;
  });
}

describe('createOutLapTracker', () => {
  it('car crosses the timing line on pit road: out lap lasts until the next lap', () => {
    expect(
      play(
        snapshot(100, 'none'),
        snapshot(100, 'in'),
        snapshot(101, 'out'), // left pit road with lap 101 already credited
        snapshot(101, 'out'), // still on the out lap
        snapshot(102, 'out'), // completed the out lap
      ),
    ).toEqual([false, false, true, true, false]);
  });

  it('car exits before the timing line: out lap ends when it crosses the line', () => {
    expect(play(snapshot(100, 'in'), snapshot(100, 'out'), snapshot(101, 'out'))).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('counts a whole stop that happened between two snapshots', () => {
    expect(play(snapshot(100, 'none'), snapshot(101, 'out'), snapshot(102, 'out'))).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("doesn't guess for stops that finished before it started watching", () => {
    expect(play(snapshot(101, 'out'), snapshot(101, 'out'))).toEqual([false, false]);
  });
});
