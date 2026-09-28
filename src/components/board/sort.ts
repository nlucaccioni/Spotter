import type { CarState, Gap } from '../../data/model/types.ts';
import type { ColumnId } from './layout.ts';

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  column: ColumnId;
  direction: SortDirection;
}

export const DEFAULT_SORT: SortState = { column: 'pos', direction: 'asc' };

/** Columns where bigger is better start descending. */
const DESCENDING_FIRST = new Set<ColumnId>(['change', 'laps', 'led', 'pits']);

/** Next sort state after clicking a column header. */
export function nextSort(current: SortState, column: ColumnId): SortState {
  if (current.column === column) {
    return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { column, direction: DESCENDING_FIRST.has(column) ? 'desc' : 'asc' };
}

type SortValue = number | string | null;

function sortValue(car: CarState, column: ColumnId): SortValue {
  switch (column) {
    case 'pos':
    case 'gap':
      return car.position;
    case 'change':
      return car.positionsGained;
    case 'car': {
      const n = Number.parseInt(car.carNumber, 10);
      return Number.isNaN(n) ? car.carNumber : n;
    }
    case 'driver':
      return car.name.last.toLowerCase();
    case 'mfr':
      return car.manufacturer.name;
    case 'interval':
      return gapRank(car.interval);
    case 'last':
      return car.lastLap?.seconds ?? null;
    case 'best':
      return car.bestLap?.seconds ?? null;
    case 'laps':
      return car.lapsCompleted;
    case 'led':
      return car.lapsLed;
    case 'pits':
      return car.pitStops.length;
    case 'status':
      return car.statusCode;
  }
}

function gapRank(gap: Gap): number | null {
  switch (gap.kind) {
    case 'leader':
      return -1;
    case 'time':
      return gap.seconds;
    case 'laps':
      return 1_000_000 + gap.laps;
    case 'unknown':
      return null;
  }
}

/** Moves cars matching `pinned` to the top, keeping the existing order within each group. */
export function pinToTop(
  cars: readonly CarState[],
  pinned: (car: CarState) => boolean,
): CarState[] {
  return [...cars.filter(pinned), ...cars.filter((car) => !pinned(car))];
}

/** Returns a sorted copy. Missing values always sort last; ties fall back to position. */
export function sortCars(cars: readonly CarState[], sort: SortState): CarState[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...cars].sort((a, b) => {
    const va = sortValue(a, sort.column);
    const vb = sortValue(b, sort.column);
    if (va !== vb) {
      if (va === null) return 1;
      if (vb === null) return -1;
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb));
      if (cmp !== 0) return cmp * sign;
    }
    return a.position - b.position;
  });
}
