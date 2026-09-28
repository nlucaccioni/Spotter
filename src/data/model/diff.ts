import type { CarState, Flag, PitStop, Session } from './types.ts';

// Compares consecutive snapshots of the same session and reports what happened in between.

export interface CarRef {
  carNumber: string;
  /** Short display name, e.g. "K. Larson". */
  name: string;
}

export type RaceEvent =
  | { kind: 'flag'; lap: number; flag: Flag }
  | { kind: 'lead-change'; lap: number; car: CarRef }
  | { kind: 'pit-in'; lap: number; car: CarRef; fromPosition: number }
  | { kind: 'pit-out'; lap: number; car: CarRef; position: number | null }
  | { kind: 'out'; lap: number; car: CarRef }
  | { kind: 'dvp'; lap: number; car: CarRef }
  | { kind: 'fastest-lap'; lap: number; car: CarRef; seconds: number };

export interface SnapshotDiff {
  events: RaceEvent[];
  /** Positions gained (+) or lost (−) since the previous snapshot, by car number. */
  positionChanges: Map<string, number>;
}

const EMPTY: SnapshotDiff = { events: [], positionChanges: new Map() };

export function isSameSession(a: Session, b: Session): boolean {
  return a.raceId === b.raceId && a.runId === b.runId && a.runName === b.runName;
}

export function diffSessions(prev: Session | null, next: Session): SnapshotDiff {
  if (!prev || !isSameSession(prev, next)) return EMPTY;

  const lap = next.lap;
  const events: RaceEvent[] = [];
  const positionChanges = new Map<string, number>();
  const before = new Map(prev.cars.map((c) => [c.carNumber, c]));

  if (prev.flag.kind !== next.flag.kind || prev.flag.code !== next.flag.code) {
    events.push({ kind: 'flag', lap, flag: next.flag });
  }

  const newLeader = next.cars[0];
  if (newLeader && prev.cars[0] && newLeader.carNumber !== prev.cars[0].carNumber) {
    events.push({ kind: 'lead-change', lap, car: ref(newLeader) });
  }

  for (const car of next.cars) {
    const old = before.get(car.carNumber);
    if (!old) continue;

    if (old.position !== car.position) {
      positionChanges.set(car.carNumber, old.position - car.position);
    }

    events.push(...pitEvents(old, car, lap));

    if (!isOutOfRace(old) && isOutOfRace(car)) events.push({ kind: 'out', lap, car: ref(car) });
    if (!old.isOnDvp && car.isOnDvp) events.push({ kind: 'dvp', lap, car: ref(car) });
  }

  const fastest = next.fastestLap;
  if (fastest && (!prev.fastestLap || fastest.seconds < prev.fastestLap.seconds)) {
    const car = next.cars.find((c) => c.carNumber === fastest.carNumber);
    if (car) events.push({ kind: 'fastest-lap', lap, car: ref(car), seconds: fastest.seconds });
  }

  return { events, positionChanges };
}

function pitEvents(old: CarState, car: CarState, lap: number): RaceEvent[] {
  const last = car.pitStops.at(-1);
  if (!last) return [];
  const previous = old.pitStops.at(-1);
  const isNewStop = car.pitStops.length > old.pitStops.length || !sameStop(previous, last);

  const events: RaceEvent[] = [];
  if (isNewStop) {
    events.push({
      kind: 'pit-in',
      lap,
      car: ref(car),
      fromPosition: last.inRank ?? old.position,
    });
  }
  const leftPits = last.outTime !== null && (isNewStop || previous?.outTime === null);
  if (leftPits) {
    events.push({ kind: 'pit-out', lap, car: ref(car), position: last.outRank });
  }
  return events;
}

function sameStop(a: PitStop | undefined, b: PitStop): boolean {
  return a !== undefined && a.lap === b.lap && (a.inTime === null || a.inTime === b.inTime);
}

function isOutOfRace(car: CarState): boolean {
  return car.statusCode === 3;
}

function ref(car: CarState): CarRef {
  return { carNumber: car.carNumber, name: car.name.initial };
}

const FLAG_TEXT: Record<Flag['kind'], string> = {
  green: 'Green flag',
  yellow: 'Caution',
  red: 'Red flag',
  white: 'White flag',
  checkered: 'Checkered flag',
  unknown: '',
};

export function describeEvent(event: RaceEvent): string {
  switch (event.kind) {
    case 'flag':
      return FLAG_TEXT[event.flag.kind] || `Flag: ${event.flag.label}`;
    case 'lead-change':
      return `${car(event.car)} takes the lead`;
    case 'pit-in':
      return `${car(event.car)} pits from P${event.fromPosition}`;
    case 'pit-out':
      return `${car(event.car)} leaves the pits${event.position ? ` in P${event.position}` : ''}`;
    case 'out':
      return `${car(event.car)} is out of the race`;
    case 'dvp':
      return `${car(event.car)} is on the DVP clock`;
    case 'fastest-lap':
      return `${car(event.car)} sets the fastest lap, ${event.seconds.toFixed(3)}`;
  }
}

function car(ref: CarRef): string {
  return `#${ref.carNumber} ${ref.name}`;
}
