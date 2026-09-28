import type { Badge, CarState, DriverName, PitStop } from '../../data/model/types.ts';
import type { NameFormat } from './layout.ts';

export function formatLapTime(seconds: number | undefined): string {
  return seconds === undefined ? '—' : seconds.toFixed(3);
}

export function formatChange(gained: number | null): string {
  if (gained === null) return '—';
  if (gained > 0) return `▲${gained}`;
  if (gained < 0) return `▼${-gained}`;
  return '–';
}

export function formatName(name: DriverName, format: NameFormat): string {
  return name[format];
}

export const BADGE_LABELS: Record<Badge, { short: string; title: string }> = {
  contender: { short: 'C', title: 'Playoff contender' },
  ineligible: { short: 'i', title: 'Not eligible for driver points in this series' },
  rookie: { short: 'R', title: 'Rookie' },
};

const MANUFACTURER_SHORT: Record<string, string> = {
  Chevrolet: 'Chevy',
  Ford: 'Ford',
  Toyota: 'Toyota',
};

export function formatManufacturer(name: string): string {
  return MANUFACTURER_SHORT[name] ?? name;
}

export function formatStatus(car: CarState): string {
  if (car.statusCode === 1) return car.isOnTrack ? 'Run' : 'Off track';
  if (car.statusCode === 3) return 'Out';
  return car.statusCode === null ? '—' : `Status ${car.statusCode}`;
}

export function isOut(car: CarState): boolean {
  return !car.isOnTrack || car.statusCode === 3;
}

/** 'pit' = on pit road now; 'out' = on the out lap (see data/model/outLaps.ts). */
export type PitIndicator = 'pit' | 'out' | null;

export const PIT_INDICATOR_LABELS: Record<'pit' | 'out', { short: string; title: string }> = {
  pit: { short: 'PIT', title: 'On pit road' },
  out: { short: 'OUT', title: "Out lap: left pit road and hasn't completed a lap yet" },
};

/** Live-session pit indicator. Not shown once the session is finished, or for cars out of it. */
export function pitIndicator(
  car: CarState,
  sessionFinished: boolean,
  onOutLap: boolean,
): PitIndicator {
  if (sessionFinished || isOut(car)) return null;
  const last: PitStop | undefined = car.pitStops.at(-1);
  if (!last) return null;
  if (last.inTime !== null && last.outTime === null) return 'pit';
  return onOutLap ? 'out' : null;
}

/** Stop count and, unless compact, the last pit lap as "·L215" (no spaces, to keep it tight). */
export function formatPits(car: CarState, compact = false): { count: string; last: string | null } {
  const last = car.pitStops.at(-1);
  return {
    count: String(car.pitStops.length),
    last: last && !compact ? `·L${last.lap}` : null,
  };
}
