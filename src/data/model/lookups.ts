import type { Manufacturer, Series } from './types.ts';

const MANUFACTURERS: Record<string, string> = {
  Chv: 'Chevrolet',
  Frd: 'Ford',
  Tyt: 'Toyota',
};

export function manufacturerFromCode(code: string): Manufacturer {
  return { code, name: MANUFACTURERS[code] ?? (code || 'Unknown') };
}

/** For feeds that give the full name ("Chevrolet") instead of the code. */
export function manufacturerFromName(name: string): Manufacturer {
  const code = Object.keys(MANUFACTURERS).find((c) => MANUFACTURERS[c] === name.trim());
  return code ? { code, name: MANUFACTURERS[code]! } : { code: '', name: name.trim() || 'Unknown' };
}

const SERIES: Record<number, string> = {
  1: 'Cup Series',
  2: "O'Reilly Auto Parts Series",
  3: 'Craftsman Truck Series',
};

export function seriesFromId(id: number | null): Series {
  const name = id === null ? undefined : SERIES[id];
  return { id, name: name ?? (id === null ? 'Unknown series' : `Series ${id}`) };
}
