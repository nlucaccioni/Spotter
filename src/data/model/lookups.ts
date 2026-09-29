import type { Manufacturer, Series } from './types.ts';

const MANUFACTURERS: Record<string, string> = {
  Chv: 'Chevrolet',
  Frd: 'Ford',
  Tyt: 'Toyota',
  Ram: 'RAM',
};

/**
 * Other spellings mapped to the codes above. RAM (Truck Series, 2026) is "RAM" in results and
 * standings; its live-feed code isn't confirmed yet, so the likely forms are all accepted.
 */
const CODE_ALIASES: Record<string, string> = {
  ram: 'Ram',
  rm: 'Ram',
};

export function manufacturerFromCode(code: string): Manufacturer {
  const canonical = MANUFACTURERS[code] ? code : CODE_ALIASES[code.trim().toLowerCase()];
  if (canonical) return { code: canonical, name: MANUFACTURERS[canonical]! };
  return { code, name: code || 'Unknown' };
}

/** For feeds that give the full name ("Chevrolet", "RAM") instead of the code. */
export function manufacturerFromName(name: string): Manufacturer {
  const wanted = name.trim().toLowerCase();
  const code = Object.keys(MANUFACTURERS).find((c) => MANUFACTURERS[c]!.toLowerCase() === wanted);
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
