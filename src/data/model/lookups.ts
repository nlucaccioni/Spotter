import type { Manufacturer, Series } from './types.ts';

const MANUFACTURERS: Record<string, string> = {
  Chv: 'Chevrolet',
  Frd: 'Ford',
  Tyt: 'Toyota',
};

export function manufacturerFromCode(code: string): Manufacturer {
  return { code, name: MANUFACTURERS[code] ?? (code || 'Unknown') };
}

// Only 1 = Cup is confirmed; 2 and 3 are believed (see docs/feed-notes.md).
const SERIES: Record<number, string> = {
  1: 'Cup Series',
  2: "O'Reilly Auto Parts Series",
  3: 'Truck Series',
};

export function seriesFromId(id: number | null): Series {
  const name = id === null ? undefined : SERIES[id];
  return { id, name: name ?? (id === null ? 'Unknown series' : `Series ${id}`) };
}
