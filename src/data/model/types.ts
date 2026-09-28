// Normalized domain model. The UI and the rest of the data layer depend on these types,
// never on the raw feed shape (see feeds/liveFeed.schema.ts for that).

export type Badge = 'contender' | 'ineligible' | 'rookie';

export interface DriverName {
  /** Suffix-free full name, e.g. "Kyle Larson". */
  full: string;
  /** Initialed first name, e.g. "K. Larson" or "J.H. Nemechek". */
  initial: string;
  /** Last name only, e.g. "Larson". */
  last: string;
  badges: Badge[];
}

export type FlagKind = 'green' | 'yellow' | 'red' | 'white' | 'checkered' | 'unknown';

export interface Flag {
  /** Raw `flag_state`, or null if the feed didn't provide one. */
  code: number | null;
  kind: FlagKind;
  label: string;
}

export type Gap =
  | { kind: 'leader' }
  | { kind: 'time'; seconds: number }
  | { kind: 'laps'; laps: number }
  | { kind: 'unknown' };

export interface Manufacturer {
  /** Raw feed code, e.g. "Chv". */
  code: string;
  name: string;
}

export interface Series {
  id: number | null;
  name: string;
}

export interface LapTime {
  seconds: number;
  mph: number | null;
}

export interface BestLap extends LapTime {
  /** Lap number the best lap was set on. */
  lap: number | null;
}

export interface LapRange {
  start: number;
  end: number;
}

export interface PitStop {
  lap: number;
  leaderLap: number | null;
  /** Session elapsed seconds at pit-in / pit-out; null when the feed has no timing for the stop. */
  inTime: number | null;
  outTime: number | null;
  /** Pit-road time (out − in), when both are known. */
  durationSeconds: number | null;
  inRank: number | null;
  outRank: number | null;
  /** Positive = gained positions on the stop. */
  positionChange: number | null;
}

export interface CarStats {
  averageRunningPosition: number | null;
  averageSpeed: number | null;
  averageRestartSpeed: number | null;
  passesMade: number | null;
  timesPassed: number | null;
  qualityPasses: number | null;
  passingDifferential: number | null;
  fastestLapsRun: number | null;
  lapsPositionImproved: number | null;
  positionDifferentialLast10Percent: number | null;
}

export interface CarState {
  position: number;
  carNumber: string;
  driverId: number | null;
  name: DriverName;
  manufacturer: Manufacturer;
  sponsor: string;
  /** Raw `delta`: seconds behind the leader, or a negative whole number of laps down. */
  delta: number | null;
  gapToLeader: Gap;
  /** Gap to the car one position ahead. Approximate; see gaps.ts. */
  interval: Gap;
  lapsCompleted: number;
  lastLap: LapTime | null;
  bestLap: BestLap | null;
  lapsLed: number;
  lapsLedRanges: LapRange[];
  pitStops: PitStop[];
  /** Raw `status`: 1 = running, 3 = out of race observed. See docs/feed-notes.md. */
  statusCode: number | null;
  isOnTrack: boolean;
  isOnDvp: boolean;
  startingPosition: number | null;
  /** starting − current position; positive = gained. */
  positionsGained: number | null;
  stats: CarStats;
}

export interface Stage {
  number: number | null;
  endLap: number | null;
  laps: number | null;
}

export interface FastestLap {
  carNumber: string;
  seconds: number;
  lap: number | null;
}

export interface Session {
  raceId: number | null;
  runId: number | null;
  runName: string;
  runType: number | null;
  series: Series;
  track: { id: number | null; name: string; lengthMiles: number | null };
  lap: number;
  lapsInRace: number;
  lapsToGo: number;
  elapsedSeconds: number;
  flag: Flag;
  /** Epoch ms parsed from `time_of_day_os`. Advances even when nothing changed; see feed-notes. */
  updatedAtMs: number | null;
  stage: Stage | null;
  cautions: { segments: number; laps: number };
  leadChanges: number;
  leaders: number;
  fastestLap: FastestLap | null;
  /** Sorted by running position. */
  cars: CarState[];
}
