import type { CarState, Session } from './types.ts';

// Which cars are on their out lap: they've left pit road and haven't completed a lap since.
//
// This can't be read from a single snapshot: depending on where a car exits pit road relative
// to the timing line, its lap count at pit-out is either the stop lap or one more (both are
// common; see docs/feed-notes.md). So we record the car's lap count at the moment we see it
// leave, and it's on its out lap until that count goes up.

export interface OutLapTracker {
  /** Call with each new snapshot of the same session; returns car numbers on an out lap. */
  update(prev: Session | null, next: Session): ReadonlySet<string>;
  reset(): void;
}

export function createOutLapTracker(): OutLapTracker {
  /** car number -> { stop lap, laps completed when we saw it leave pit road } */
  let exits = new Map<string, { stopLap: number; lapsAtExit: number }>();

  return {
    update(prev, next) {
      const before = new Map(prev?.cars.map((c) => [c.carNumber, c]));
      const onOutLap = new Set<string>();

      for (const car of next.cars) {
        const stop = car.pitStops.at(-1);
        if (!stop || car.isOnPitRoad) {
          exits.delete(car.carNumber);
          continue;
        }
        let exit = exits.get(car.carNumber);
        if (!exit || exit.stopLap !== stop.lap) {
          const old = before.get(car.carNumber);
          // Only when we actually saw the car leave (it was on pit road, or the whole stop
          // happened between two snapshots). Otherwise we can't know its lap count at exit.
          if (!old || !leftPitRoad(old, car)) {
            exits.delete(car.carNumber);
            continue;
          }
          exit = { stopLap: stop.lap, lapsAtExit: car.lapsCompleted };
          exits.set(car.carNumber, exit);
        }
        if (car.lapsCompleted > exit.lapsAtExit) exits.delete(car.carNumber);
        else onOutLap.add(car.carNumber);
      }
      return onOutLap;
    },
    reset() {
      exits = new Map();
    },
  };
}

// Only called once `car` is off pit road. The live feed sets a pit-out time as soon as a car
// enters pit road, so `isOnPitRoad` (not the pit-out time) says whether it was still there.
function leftPitRoad(old: CarState, car: CarState): boolean {
  return old.isOnPitRoad || car.pitStops.length > old.pitStops.length;
}
