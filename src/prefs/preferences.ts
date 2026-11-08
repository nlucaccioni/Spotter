import { z } from 'zod';
import { COLUMNS, type ColumnId } from '../components/board/layout.ts';
import { SERIES_IDS, type SeriesId } from '../data/feeds/schedule.ts';
import type { CarState } from '../data/model/types.ts';

// User preferences (PROJECT_BRIEF.md §5.2, milestone 6). Persisted as JSON in localStorage;
// parsing is tolerant so a stale or hand-edited value never breaks the board.

export type Theme = 'dark' | 'light';

/** Which live timing to follow: whatever NASCAR is featuring, or one series. */
export type LiveSeries = 'auto' | SeriesId;

export const TEAM_DISPLAYS = ['full', 'short', 'logo'] as const;
export type TeamDisplay = (typeof TEAM_DISPLAYS)[number];

/** Team display per series (logos for Cup, shorthand for O'Reilly, …). */
export type TeamDisplayBySeries = Record<SeriesId, TeamDisplay>;

export interface Preferences {
  theme: Theme;
  showTicker: boolean;
  /** Columns the user has turned off. */
  hiddenColumns: ColumnId[];
  /** Favorite drivers, by favoriteKey(). */
  favorites: string[];
  /** Show favorites at the top of the table. */
  pinFavorites: boolean;
  /** Opt-in: team-styled car-number graphics hotlinked from NASCAR's CDN. */
  showCarBadges: boolean;
  /** Opt-in: manufacturer logos hotlinked from nascar.com in place of the text pills. */
  showMfrLogos: boolean;
  /** Opt-in: the leaderboard's Team column. */
  showTeamColumn: boolean;
  /** How teams are shown (board and points page), per series: full name, shorthand, or logo. */
  teamDisplay: TeamDisplayBySeries;
  /** TV delay: show each update this many seconds after it arrives (0 = live). */
  delaySeconds: number;
  liveSeries: LiveSeries;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  showTicker: true,
  hiddenColumns: [],
  favorites: [],
  pinFavorites: false,
  showCarBadges: false,
  showMfrLogos: false,
  showTeamColumn: false,
  teamDisplay: { 1: 'full', 2: 'full', 3: 'full' },
  delaySeconds: 0,
  liveSeries: 'auto',
};

export const MAX_DELAY_SECONDS = 900;

/** Identity columns that can't be hidden. */
export const REQUIRED_COLUMNS: readonly ColumnId[] = ['pos', 'car', 'driver'];

/** Columns with an on/off switch via hiddenColumns. Team is off by default, so it has its own. */
export const TOGGLEABLE_COLUMNS = COLUMNS.filter(
  (c) => !REQUIRED_COLUMNS.includes(c.id) && c.id !== 'team',
);

const columnIds = COLUMNS.map((c) => c.id) as [ColumnId, ...ColumnId[]];

const schema = z.object({
  theme: z.enum(['dark', 'light']).catch(DEFAULT_PREFERENCES.theme),
  showTicker: z.boolean().catch(DEFAULT_PREFERENCES.showTicker),
  hiddenColumns: z
    .array(z.unknown())
    .catch([])
    .transform((ids) =>
      ids.filter(
        (id): id is ColumnId =>
          columnIds.includes(id as ColumnId) && !REQUIRED_COLUMNS.includes(id as ColumnId),
      ),
    ),
  favorites: z
    .array(z.unknown())
    .catch([])
    .transform((keys) => keys.filter((k): k is string => typeof k === 'string')),
  pinFavorites: z.boolean().catch(DEFAULT_PREFERENCES.pinFavorites),
  showCarBadges: z.boolean().catch(DEFAULT_PREFERENCES.showCarBadges),
  showMfrLogos: z.boolean().catch(DEFAULT_PREFERENCES.showMfrLogos),
  showTeamColumn: z.boolean().catch(DEFAULT_PREFERENCES.showTeamColumn),
  teamDisplay: z.unknown().optional().transform(parseTeamDisplay),
  delaySeconds: z.number().catch(0).transform(clampDelay),
  liveSeries: z
    .union([z.literal('auto'), z.number()])
    .catch('auto')
    .transform((v): LiveSeries => (SERIES_IDS.includes(v as SeriesId) ? (v as SeriesId) : 'auto')),
});

const teamDisplayValue = z.enum(TEAM_DISPLAYS);

/** Per-series values; an older single value applies to every series. */
function parseTeamDisplay(value: unknown): TeamDisplayBySeries {
  const single = teamDisplayValue.safeParse(value);
  const all = (d: TeamDisplay) => ({ 1: d, 2: d, 3: d });
  if (single.success) return all(single.data);
  const byId =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const result = { ...DEFAULT_PREFERENCES.teamDisplay };
  for (const id of SERIES_IDS) {
    const parsed = teamDisplayValue.safeParse(byId[String(id)]);
    if (parsed.success) result[id] = parsed.data;
  }
  return result;
}

/** The team display for a series; full names for series without their own setting. */
export function teamDisplayFor(prefs: Preferences, seriesId: number | null): TeamDisplay {
  return SERIES_IDS.includes(seriesId as SeriesId)
    ? prefs.teamDisplay[seriesId as SeriesId]
    : 'full';
}

/** Parses stored JSON; anything missing or invalid falls back to the default. */
export function parsePreferences(json: string | null): Preferences {
  if (!json) return DEFAULT_PREFERENCES;
  try {
    const result = schema.safeParse(JSON.parse(json));
    return result.success ? result.data : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Stable key for a favorite driver: NASCAR's driver id when the feed has one, otherwise the
 * suffix-free full name (dev replays have no ids).
 */
export function favoriteKey(car: Pick<CarState, 'driverId' | 'name'>): string {
  return car.driverId !== null ? `id:${car.driverId}` : `name:${car.name.full}`;
}

export function toggleInList<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/** Whole seconds within 0..MAX_DELAY_SECONDS. */
export function clampDelay(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  return Math.min(MAX_DELAY_SECONDS, Math.max(0, Math.round(seconds)));
}

/** Parses typed delay text ("30", " 45s"); null if it isn't a number. */
export function parseDelayInput(text: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*s?\s*$/i.exec(text);
  return match ? clampDelay(Number(match[1])) : null;
}
