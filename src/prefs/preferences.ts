import { z } from 'zod';
import { COLUMNS, type ColumnId } from '../components/board/layout.ts';
import type { CarState } from '../data/model/types.ts';

// User preferences (PROJECT_BRIEF.md §5.2, milestone 6). Persisted as JSON in localStorage;
// parsing is tolerant so a stale or hand-edited value never breaks the board.

export type Theme = 'dark' | 'light';

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
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  showTicker: true,
  hiddenColumns: [],
  favorites: [],
  pinFavorites: false,
  showCarBadges: false,
};

/** Identity columns that can't be hidden. */
export const REQUIRED_COLUMNS: readonly ColumnId[] = ['pos', 'car', 'driver'];

export const TOGGLEABLE_COLUMNS = COLUMNS.filter((c) => !REQUIRED_COLUMNS.includes(c.id));

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
});

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
