// DEV ONLY. Converts a Timing71 replay recording into NASCAR live-feed snapshots, so recorded
// races run through the same parser, diff and UI as live data. Recordings are third-party data:
// they stay on the developer's machine and are never committed or deployed.
//
// Timing71 format (as observed in a 2026 Cup race download):
// - manifest.json: { name, description, colSpec: [[label, type, desc?], ...], startTime }
// - <epoch>.json: keyframe { cars: rows[], session: {...} } where each row follows colSpec
// - <epoch>i.json: interval frame; `cars` / `session` are lists of
//   ["change", [row, col] | key | [key, index], [old, new]]
//
// Anything Timing71 doesn't carry (laps-led ranges, lead changes, caution counts, pit stop
// times, starting positions, best-lap lap numbers) is derived across frames.

export interface Timing71Manifest {
  name: string;
  description: string;
  colSpec: [string, string, string?][];
  startTime: number;
}

export interface Timing71Session {
  flagState?: string;
  timeElapsed?: number;
  /** [stage number, laps remaining in stage] */
  trackData?: [number, number];
  lapsRemain?: number;
}

type Cell = string | number | [string | number, string];
type Change = ['change', unknown, [unknown, unknown]];

export interface Timing71Frame {
  cars: Cell[][] | Change[];
  session: Timing71Session | Change[];
}

const FLAG_CODES: Record<string, number> = {
  green: 1,
  yellow: 2,
  caution: 2,
  sc: 2,
  code_60: 2,
  vsc: 2,
  red: 3,
  white: 4,
  chequered: 9,
  none: 0,
};

const SERIES_IDS: [RegExp, number][] = [
  [/cup/i, 1],
  [/o'?reilly|xfinity/i, 2],
  [/truck/i, 3],
];

// Columns we read, by colSpec label.
const COLS = ['Num', 'State', 'Driver', 'Car', 'Laps', 'Gap', 'Last', 'Spd', 'Best', 'B.Spd'];

interface PitStopState {
  lap: number;
  leaderLap: number;
  inTime: number;
  outTime: number;
  inRank: number;
  outRank: number;
}

interface CarHistory {
  startingPosition: number;
  bestLapTime: number;
  bestLap: number;
  pitStops: PitStopState[];
  wasInPit: boolean;
  /** Position in the previous frame; a car loses places on pit road before State flips. */
  lastPosition: number;
  /** Leader lap when this car entered the pits, to spot cars that never come back. */
  pitEnteredAtLeaderLap: number;
}

/** Laps in the pits (by the leader's count) after which a car is treated as out of the race. */
const OUT_AFTER_LEADER_LAPS = 10;

export class Timing71Converter {
  private readonly col: Record<string, number>;
  private rows: Cell[][] = [];
  private session: Timing71Session = {};
  private readonly cars = new Map<string, CarHistory>();
  private lapsLed: { car: string; start: number; end: number }[] = [];
  private leadChanges = 0;
  private readonly leaders = new Set<string>();
  private cautionSegments = 0;
  private cautionLaps = 0;
  private lastLeaderLap = -1;
  private lastFlag = 'none';
  private flag = 'none';

  private readonly manifest: Timing71Manifest;

  constructor(manifest: Timing71Manifest) {
    this.manifest = manifest;
    this.col = Object.fromEntries(manifest.colSpec.map(([label], i) => [label, i]));
    for (const name of COLS) {
      if (this.col[name] === undefined) throw new Error(`Timing71 colSpec has no "${name}" column`);
    }
  }

  /** Applies one frame and returns the equivalent NASCAR live-feed JSON. */
  push(frame: Timing71Frame, timestampSeconds: number): Record<string, unknown> {
    this.apply(frame);
    this.derive();
    return this.toLiveFeed(timestampSeconds);
  }

  private apply(frame: Timing71Frame) {
    if (Array.isArray(frame.session)) {
      for (const [, key, [, value]] of frame.session as Change[]) {
        if (Array.isArray(key)) {
          const [name, index] = key as [keyof Timing71Session, number];
          const arr = [...((this.session[name] as unknown[] | undefined) ?? [])];
          arr[index] = value;
          (this.session as Record<string, unknown>)[name] = arr;
        } else {
          (this.session as Record<string, unknown>)[key as string] = value;
        }
      }
    } else {
      this.session = { ...frame.session };
    }

    const cars = frame.cars as unknown[];
    const isKeyframe = !Array.isArray(frame.session);
    if (isKeyframe) {
      this.rows = (cars as Cell[][]).map((row) => [...row]);
    } else {
      // Paths are [row, col] for plain cells, or [row, col, part] for two-part cells such as
      // [lapTime, highlight], where part 1 is a marker like "pb" or "sb".
      for (const [, [row, colIndex, part], [, value]] of cars as [
        string,
        [number, number, number?],
        [unknown, unknown],
      ][]) {
        const cells = (this.rows[row] ??= []);
        if (part === undefined) {
          cells[colIndex] = value as Cell;
        } else {
          const current = cells[colIndex];
          const pair: [string | number, string] = Array.isArray(current)
            ? [...current]
            : [current ?? '', ''];
          pair[part] = value as never;
          cells[colIndex] = pair;
        }
      }
    }
  }

  private cell(row: Cell[], name: string): Cell | undefined {
    return row[this.col[name]!];
  }

  private num(row: Cell[], name: string): number {
    const value = this.cell(row, name);
    const raw = Array.isArray(value) ? value[0] : value;
    return typeof raw === 'number' ? raw : 0;
  }

  private str(row: Cell[], name: string): string {
    const value = this.cell(row, name);
    return typeof value === 'string' ? value : String(value ?? '');
  }

  private get leaderLap(): number {
    return this.rows[0] ? this.num(this.rows[0], 'Laps') : 0;
  }

  private derive() {
    const leaderLap = this.leaderLap;
    const elapsed = this.session.timeElapsed ?? 0;
    // Timing71 reports "none" once the session closes; keep showing the last real flag.
    const reported = this.session.flagState ?? 'none';
    const flag = reported === 'none' && this.lastFlag !== 'none' ? this.lastFlag : reported;

    // Cautions: a new segment on each transition into caution; laps counted as the leader
    // completes them under caution.
    const isCaution = FLAG_CODES[flag] === 2;
    if (isCaution && FLAG_CODES[this.lastFlag] !== 2) this.cautionSegments += 1;

    this.rows.forEach((row, index) => {
      const number = this.str(row, 'Num');
      if (!number) return;
      let car = this.cars.get(number);
      if (!car) {
        car = {
          startingPosition: index + 1,
          bestLapTime: 0,
          bestLap: 0,
          pitStops: [],
          wasInPit: false,
          lastPosition: index + 1,
          pitEnteredAtLeaderLap: 0,
        };
        this.cars.set(number, car);
      }

      const best = this.num(row, 'Best');
      if (best > 0 && (car.bestLapTime === 0 || best < car.bestLapTime)) {
        car.bestLapTime = best;
        car.bestLap = this.num(row, 'Laps');
      }

      const inPit = this.str(row, 'State') === 'PIT';
      if (inPit && !car.wasInPit) {
        car.pitStops.push({
          // Laps completed at pit-in, by the car and by the leader (matches NASCAR's feed).
          lap: this.num(row, 'Laps'),
          leaderLap,
          inTime: elapsed,
          outTime: 0,
          inRank: car.lastPosition,
          outRank: 0,
        });
        car.pitEnteredAtLeaderLap = leaderLap;
      } else if (!inPit && car.wasInPit) {
        const stop = car.pitStops.at(-1);
        if (stop) {
          stop.outTime = Math.max(elapsed, stop.inTime + 0.001);
          stop.outRank = index + 1;
        }
      }
      car.wasInPit = inPit;
      car.lastPosition = index + 1;
    });

    if (leaderLap > this.lastLeaderLap && this.rows[0]) {
      const leader = this.str(this.rows[0], 'Num');
      // Lap 0 is recorded for the pole-sitter, as NASCAR's laps_led does, so the first
      // leader on lap 1 counts as a lead change; it isn't counted as a separate leader.
      for (let lap = this.lastLeaderLap + 1; lap <= leaderLap; lap++) {
        const current = this.lapsLed.at(-1);
        if (current && current.car === leader && current.end === lap - 1) {
          current.end = lap;
        } else {
          if (current) this.leadChanges += 1;
          this.lapsLed.push({ car: leader, start: lap, end: lap });
        }
        if (lap > 0) this.leaders.add(leader);
        if (isCaution) this.cautionLaps += 1;
      }
      this.lastLeaderLap = leaderLap;
    }
    this.lastFlag = flag;
    this.flag = flag;
  }

  private toLiveFeed(timestampSeconds: number): Record<string, unknown> {
    const leaderLap = this.leaderLap;
    const lapsRemain = this.session.lapsRemain ?? 0;
    const [stageNum, stageRemain] = this.session.trackData ?? [];
    const flag = this.flag;
    const [runName] = this.manifest.description.split(' - ');

    return {
      lap_number: leaderLap,
      laps_in_race: leaderLap + lapsRemain,
      laps_to_go: lapsRemain,
      elapsed_time: this.session.timeElapsed ?? 0,
      flag_state: FLAG_CODES[flag] ?? 0,
      race_id: null,
      run_id: null,
      run_name: runName ?? this.manifest.description,
      series_id: SERIES_IDS.find(([pattern]) => pattern.test(this.manifest.name))?.[1] ?? null,
      run_type: 3,
      track_name: '',
      time_of_day_os: new Date(timestampSeconds * 1000).toISOString(),
      number_of_caution_segments: this.cautionSegments,
      number_of_caution_laps: this.cautionLaps,
      number_of_lead_changes: this.leadChanges,
      number_of_leaders: this.leaders.size,
      stage:
        typeof stageNum === 'number'
          ? {
              stage_num: stageNum,
              finish_at_lap: leaderLap + (stageRemain ?? 0),
              laps_in_stage: null,
            }
          : null,
      vehicles: this.rows.map((row, index) => this.toVehicle(row, index, leaderLap)),
    };
  }

  private toVehicle(row: Cell[], index: number, leaderLap: number): Record<string, unknown> {
    const number = this.str(row, 'Num');
    const car = this.cars.get(number);
    const laps = this.num(row, 'Laps');
    const gap = this.cell(row, 'Gap');
    const lapsDown = typeof gap === 'string' ? Number.parseInt(gap, 10) : NaN;
    const delta =
      index === 0 ? 0 : typeof gap === 'number' ? gap : Number.isNaN(lapsDown) ? null : -lapsDown;

    const inPit = this.str(row, 'State') === 'PIT';
    const out =
      inPit && car !== undefined && leaderLap - car.pitEnteredAtLeaderLap >= OUT_AFTER_LEADER_LAPS;
    const driver = this.str(row, 'Driver').trim();
    const [first = '', ...rest] = driver.split(' ');

    return {
      running_position: index + 1,
      vehicle_number: number,
      vehicle_manufacturer: this.str(row, 'Car'),
      driver: {
        driver_id: null,
        full_name: driver,
        first_name: first,
        last_name: rest.join(' '),
        is_in_chase: /\(C\)/.test(driver),
      },
      sponsor_name: '',
      delta,
      laps_completed: laps,
      last_lap_time: this.num(row, 'Last'),
      last_lap_speed: this.num(row, 'Spd'),
      best_lap: car?.bestLap ?? 0,
      best_lap_time: this.num(row, 'Best'),
      best_lap_speed: this.num(row, 'B.Spd'),
      laps_led: this.lapsLed
        .filter((r) => r.car === number)
        .map((r) => ({ start_lap: r.start, end_lap: r.end })),
      pit_stops: (car?.pitStops ?? []).map((p) => ({
        pit_in_lap_count: p.lap,
        pit_in_leader_lap: p.leaderLap,
        pit_in_elapsed_time: p.inTime,
        pit_out_elapsed_time: p.outTime,
        pit_in_rank: p.inRank,
        pit_out_rank: p.outRank,
        positions_gained_lossed: p.outRank ? p.inRank - p.outRank : 0,
      })),
      status: out ? 3 : 1,
      is_on_track: !out,
      is_on_dvp: false,
      starting_position: car?.startingPosition ?? null,
    };
  }
}
