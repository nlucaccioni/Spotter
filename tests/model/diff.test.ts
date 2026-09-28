import { describe, expect, it } from 'vitest';
import { parseLiveFeed } from '../../src/data/feeds/liveFeed.parse.ts';
import { describeEvent, diffSessions, type RaceEvent } from '../../src/data/model/diff.ts';
import type { Session } from '../../src/data/model/types.ts';
import kansas from '../fixtures/cup-2026-kansas-final.json';

type RawFeed = typeof kansas;
type RawVehicle = RawFeed['vehicles'][number];

function session(mutate: (feed: RawFeed) => void = () => {}): Session {
  const feed = structuredClone(kansas);
  mutate(feed);
  const result = parseLiveFeed(feed);
  if (!result.ok) throw new Error(result.error);
  return result.session;
}

const vehicle = (feed: RawFeed, carNumber: string): RawVehicle =>
  feed.vehicles.find((v) => v.vehicle_number === carNumber)!;

const kinds = (events: RaceEvent[]) => events.map((e) => e.kind);

// A mid-race baseline: green flag, lap 200, no fastest-lap change pending.
const midRace = (feed: RawFeed) => {
  feed.flag_state = 1;
  feed.lap_number = 200;
};

describe('diffSessions', () => {
  it('reports nothing for the first snapshot or an identical one', () => {
    const s = session(midRace);
    expect(diffSessions(null, s).events).toEqual([]);
    expect(diffSessions(s, session(midRace))).toEqual({ events: [], positionChanges: new Map() });
  });

  it('reports nothing across different sessions', () => {
    const other = session((f) => {
      midRace(f);
      f.race_id = 9999;
      f.flag_state = 2;
    });
    expect(diffSessions(session(midRace), other).events).toEqual([]);
  });

  it('reports flag changes', () => {
    const events = diffSessions(
      session(midRace),
      session((f) => {
        midRace(f);
        f.flag_state = 2;
      }),
    ).events;
    expect(events).toEqual([
      { kind: 'flag', lap: 200, flag: { code: 2, kind: 'yellow', label: 'Caution' } },
    ]);
    expect(describeEvent(events[0]!)).toBe('Caution');
  });

  it('reports position changes and a lead change when P1 and P2 swap', () => {
    const swapped = session((f) => {
      midRace(f);
      vehicle(f, '5').running_position = 2;
      vehicle(f, '2').running_position = 1;
    });
    const diff = diffSessions(session(midRace), swapped);
    expect(diff.events).toEqual([
      { kind: 'lead-change', lap: 200, car: { carNumber: '2', name: 'A. Cindric' } },
    ]);
    expect(describeEvent(diff.events[0]!)).toBe('#2 A. Cindric takes the lead');
    expect(diff.positionChanges).toEqual(
      new Map([
        ['2', 1],
        ['5', -1],
      ]),
    );
  });

  it('reports a car entering and then leaving the pits', () => {
    const inPit = (f: RawFeed) => {
      midRace(f);
      vehicle(f, '5').pit_stops.push({
        pit_in_lap_count: 199,
        pit_in_leader_lap: 199,
        pit_in_elapsed_time: 9000,
        pit_out_elapsed_time: 0,
        pit_in_rank: 1,
        pit_out_rank: 0,
        positions_gained_lossed: 0,
      });
    };
    const out = (f: RawFeed) => {
      inPit(f);
      Object.assign(vehicle(f, '5').pit_stops.at(-1)!, {
        pit_out_elapsed_time: 9036,
        pit_out_rank: 12,
        positions_gained_lossed: -11,
      });
    };

    const pitIn = diffSessions(session(midRace), session(inPit)).events;
    expect(kinds(pitIn)).toEqual(['pit-in']);
    expect(describeEvent(pitIn[0]!)).toBe('#5 K. Larson pits from P1');

    const pitOut = diffSessions(session(inPit), session(out)).events;
    expect(kinds(pitOut)).toEqual(['pit-out']);
    expect(describeEvent(pitOut[0]!)).toBe('#5 K. Larson leaves the pits in P12');

    // Both within one polling interval.
    expect(kinds(diffSessions(session(midRace), session(out)).events)).toEqual([
      'pit-in',
      'pit-out',
    ]);
  });

  it('reports cars going out of the race and onto the DVP clock', () => {
    const events = diffSessions(
      session(midRace),
      session((f) => {
        midRace(f);
        vehicle(f, '6').status = 3;
        vehicle(f, '7').is_on_dvp = true;
      }),
    ).events;
    expect(events.map(describeEvent)).toEqual([
      '#6 B. Keselowski is out of the race',
      '#7 D. Suarez is on the DVP clock',
    ]);
  });

  it('reports a new session-best lap', () => {
    const events = diffSessions(
      session(midRace),
      session((f) => {
        midRace(f);
        vehicle(f, '11').best_lap_time = 29.9;
      }),
    ).events;
    expect(events.map(describeEvent)).toEqual(['#11 D. Hamlin sets the fastest lap, 29.900']);
  });
});
