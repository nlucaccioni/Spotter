import { describe, expect, it } from 'vitest';
import { Timing71Converter, type Timing71Frame } from '../../src/dev/timing71.ts';
import { readReplayOptions } from '../../src/dev/replayParams.ts';
import { parseLiveFeed } from '../../src/data/feeds/liveFeed.parse.ts';
import type { Session } from '../../src/data/model/types.ts';

// A tiny hand-made recording in Timing71's format (no third-party data): three cars, a pass for
// the lead, a pit stop, a caution, a lapped car, and the checkered flag.

const manifest = {
  name: 'NASCAR Cup Series',
  description: 'Test 100 - Race',
  startTime: 1_000,
  colSpec: [
    ['Num', 'text'],
    ['State', 'text'],
    ['Driver', 'text'],
    ['Car', 'text'],
    ['Laps', 'numeric'],
    ['Gap', 'delta'],
    ['Int', 'delta'],
    ['Last', 'laptime'],
    ['Spd', 'numeric'],
    ['Best', 'laptime'],
    ['B.Spd', 'numeric'],
    ['Pits', 'numeric'],
  ] as [string, string][],
};

type Row = (string | number | [string | number, string])[];
const row = (num: string, driver: string, laps: number, gap: number | string, best = 0): Row => [
  num,
  'RUN',
  driver,
  'Chv',
  laps,
  gap,
  '',
  [31, ''],
  170,
  [best, ''],
  171,
  0,
];

const keyframe = (cars: Row[], session: object): Timing71Frame => ({ cars, session });
const interval = (
  cars: [number[], unknown][],
  session: [unknown, unknown][] = [],
): Timing71Frame => ({
  cars: cars.map(([at, value]) => ['change', at, ['', value]]) as never,
  session: session.map(([key, value]) => ['change', key, ['', value]]) as never,
});

const COL = { State: 1, Laps: 4, Gap: 5, Best: 9 };

function play(frames: Timing71Frame[]): Session[] {
  const converter = new Timing71Converter(manifest);
  return frames.map((frame, i) => {
    const result = parseLiveFeed(converter.push(frame, 1_000 + i * 5));
    if (!result.ok) throw new Error(result.error);
    expect(result.issues).toEqual([]);
    return result.session;
  });
}

const start = keyframe(
  [
    row('22', 'Joey Logano (C)', 0, ''),
    row('5', 'Kyle Larson (C)', 0, ''),
    row('88', 'Connor Zilisch ', 0, ''),
  ],
  { flagState: 'none', timeElapsed: 0, trackData: [1, 30], lapsRemain: 100 },
);

describe('Timing71Converter', () => {
  it('produces a parseable live feed with session details', () => {
    const [s] = play([start]);
    expect(s).toMatchObject({
      runName: 'Test 100',
      series: { id: 1, name: 'Cup Series' },
      lap: 0,
      lapsInRace: 100,
      lapsToGo: 100,
      flag: { code: 0 },
      stage: { number: 1, endLap: 30 },
    });
    expect(s!.cars.map((c) => [c.position, c.carNumber, c.startingPosition])).toEqual([
      [1, '22', 1],
      [2, '5', 2],
      [3, '88', 3],
    ]);
    expect(s!.cars[1]!.name.badges).toEqual(['contender']);
  });

  it('tracks the leader per lap into laps-led ranges and lead changes', () => {
    const frames = [
      start,
      // Lap 1: #5 passes #22 for the lead (rows swap).
      interval(
        [
          [[0, 0], '5'],
          [[0, 2], 'Kyle Larson (C)'],
          [[0, COL.Laps], 1],
          [[1, 0], '22'],
          [[1, 2], 'Joey Logano (C)'],
          [[1, COL.Laps], 1],
          [[1, COL.Gap], 0.4],
          [[2, COL.Laps], 1],
          [[2, COL.Gap], 1.2],
        ],
        [['flagState', 'green']],
      ),
      interval([
        [[0, COL.Laps], 2],
        [[1, COL.Laps], 2],
        [[2, COL.Laps], 2],
      ]),
    ];
    const last = play(frames).at(-1)!;
    expect(last.flag.kind).toBe('green');
    const larson = last.cars.find((c) => c.carNumber === '5')!;
    const logano = last.cars.find((c) => c.carNumber === '22')!;
    expect(larson.lapsLedRanges).toEqual([{ start: 1, end: 2 }]);
    expect(larson.lapsLed).toBe(2);
    // Pole-sitter gets lap 0, as in NASCAR's feed, but no laps led.
    expect(logano.lapsLedRanges).toEqual([{ start: 0, end: 0 }]);
    expect(logano.lapsLed).toBe(0);
    expect(last).toMatchObject({ leadChanges: 1, leaders: 1 });
    expect(larson.positionsGained).toBe(1);
  });

  it('turns PIT/RUN state changes into pit stops', () => {
    const frames = [
      start,
      interval(
        [[[0, COL.Laps], 10]],
        [
          ['flagState', 'green'],
          ['timeElapsed', 300],
        ],
      ),
      interval([[[0, COL.State], 'PIT']], [['timeElapsed', 310]]),
      interval([[[0, COL.State], 'RUN']], [['timeElapsed', 345]]),
    ];
    const sessions = play(frames);
    const inPit = sessions[2]!.cars[0]!.pitStops;
    expect(inPit).toEqual([
      expect.objectContaining({ lap: 10, leaderLap: 10, inTime: 310, outTime: null, inRank: 1 }),
    ]);
    const done = sessions[3]!.cars[0]!.pitStops;
    expect(done).toEqual([
      expect.objectContaining({ inTime: 310, outTime: 345, durationSeconds: 35 }),
    ]);
  });

  it('counts caution segments and laps, and keeps the checkered flag after the session closes', () => {
    const frames = [
      start,
      interval([[[0, COL.Laps], 1]], [['flagState', 'green']]),
      interval([[[0, COL.Laps], 2]], [['flagState', 'caution']]),
      interval([[[0, COL.Laps], 3]]),
      interval([[[0, COL.Laps], 4]], [['flagState', 'green']]),
      interval([[[0, COL.Laps], 5]], [['flagState', 'chequered']]),
      interval([], [['flagState', 'none']]),
    ];
    const sessions = play(frames);
    expect(sessions[2]!.flag.kind).toBe('yellow');
    expect(sessions.at(-1)!.cautions).toEqual({ segments: 1, laps: 2 });
    expect(sessions.at(-1)!.flag.kind).toBe('checkered');
  });

  it('reads lapped gaps and marks a car that never leaves the pits as out', () => {
    const frames = [
      start,
      interval(
        [
          [[0, COL.Laps], 20],
          [[2, COL.Gap], '2 laps'],
          [[2, COL.State], 'PIT'],
        ],
        [['flagState', 'green']],
      ),
      interval([[[0, COL.Laps], 29]]),
      interval([[[0, COL.Laps], 30]]),
    ];
    const sessions = play(frames);
    const zilisch = (s: Session) => s.cars.find((c) => c.carNumber === '88')!;
    expect(zilisch(sessions[1]!).gapToLeader).toEqual({ kind: 'laps', laps: 2 });
    expect(zilisch(sessions[2]!).statusCode).toBe(1);
    expect(zilisch(sessions[3]!)).toMatchObject({ statusCode: 3, isOnTrack: false });
  });

  it('records the lap a best lap was set on', () => {
    const frames = [
      start,
      interval([
        [[1, COL.Laps], 3],
        [
          [1, COL.Best],
          [30.5, ''],
        ],
      ]),
    ];
    expect(play(frames)[1]!.cars[1]!.bestLap).toMatchObject({ seconds: 30.5, lap: 3 });
  });

  it('applies changes to one part of a two-part cell without losing the other', () => {
    const frames = [
      start,
      interval([[[1, COL.Best, 0], 30.5]]),
      // Highlight marker changes on its own must not overwrite the lap time.
      interval([[[1, COL.Best, 1], 'sb']]),
      interval([[[1, COL.Best, 1], '']]),
    ];
    const sessions = play(frames);
    for (const s of sessions.slice(1)) expect(s.cars[1]!.bestLap?.seconds).toBe(30.5);
  });

  it('rejects a recording without the columns it needs', () => {
    expect(() => new Timing71Converter({ ...manifest, colSpec: [['Num', 'text']] })).toThrow(
      /no "State" column/,
    );
  });
});

describe('readReplayOptions', () => {
  it('reads name, speed and start lap with sensible defaults', () => {
    expect(readReplayOptions('')).toBeNull();
    expect(readReplayOptions('?replay=My%20Race')).toEqual({
      name: 'My Race',
      speed: 10,
      startLap: 0,
    });
    expect(readReplayOptions('?replay=x&speed=30&lap=200')).toEqual({
      name: 'x',
      speed: 30,
      startLap: 200,
    });
    expect(readReplayOptions('?replay=x&speed=-1&lap=abc')).toMatchObject({
      speed: 10,
      startLap: 0,
    });
  });
});
