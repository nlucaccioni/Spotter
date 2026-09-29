import { z } from 'zod';

// Season schedules and per-series live feeds (CORS: *, see docs/feed-notes.md). live-feed.json
// only carries whichever session NASCAR is featuring; each race also has its own live feed,
// which serves that race's latest session (practice, qualifying, then the race) and returns 403
// until the first one starts.

/** Series the board can follow directly (1 Cup, 2 O'Reilly, 3 Truck). */
export const SERIES_IDS = [1, 2, 3] as const;
export type SeriesId = (typeof SERIES_IDS)[number];

export const SERIES_SHORT: Record<SeriesId, string> = { 1: 'Cup', 2: "O'Reilly", 3: 'Truck' };

export function raceListUrl(year: number, seriesId: SeriesId): string {
  return `https://cf.nascar.com/cacher/${year}/${seriesId}/race_list_basic.json`;
}

export function seriesLiveFeedUrl(seriesId: SeriesId, raceId: number): string {
  return `https://cf.nascar.com/live/feeds/series_${seriesId}/${raceId}/live_feed.json`;
}

export function seriesLivePointsUrl(seriesId: SeriesId, raceId: number): string {
  return `https://cf.nascar.com/live/feeds/series_${seriesId}/${raceId}/live_points.json`;
}

export interface RaceListing {
  raceId: number;
  name: string;
  trackName: string;
  /** When the weekend's first on-track session (practice, qualifying or race) starts. */
  firstSessionMs: number;
}

const event = z.object({
  start_time_utc: z.string().catch(''),
  run_type: z.number().catch(0),
});

const race = z.object({
  race_id: z.number().int().positive(),
  race_name: z.string().catch(''),
  track_name: z.string().catch(''),
  date_scheduled: z.string().catch(''),
  schedule: z.array(z.unknown()).nullable().catch(null),
});

/** Parses race_list_basic.json. Races that can't be placed in time are dropped. */
export function parseRaceList(raw: unknown): RaceListing[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = race.safeParse(item);
    if (!parsed.success) return [];
    const r = parsed.data;
    const firstSessionMs = firstOnTrackMs(r.schedule) ?? parseUtc(r.date_scheduled);
    if (firstSessionMs === null) return [];
    return [
      { raceId: r.race_id, name: r.race_name.trim(), trackName: r.track_name, firstSessionMs },
    ];
  });
}

/** Earliest practice/qualifying/race start (run_type 1–3; 0 is off-track, e.g. garage hours). */
function firstOnTrackMs(schedule: unknown[] | null): number | null {
  const starts = (schedule ?? []).flatMap((item) => {
    const parsed = event.safeParse(item);
    if (!parsed.success || parsed.data.run_type < 1) return [];
    const ms = parseUtc(parsed.data.start_time_utc);
    return ms === null ? [] : [ms];
  });
  return starts.length ? Math.min(...starts) : null;
}

// Times come without an offset. `start_time_utc` is UTC; `date_scheduled` (the fallback, for
// races with no session schedule yet) is Eastern, so it lands a few hours early. Close enough to
// pick a weekend.
function parseUtc(text: string): number | null {
  if (!text) return null;
  const ms = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(text) ? text : `${text}Z`);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * The race whose weekend is under way or most recently finished: the latest one whose first
 * on-track session has started. Between weekends that's the last race, showing its results.
 */
export function currentRace(races: readonly RaceListing[], now: number): RaceListing | null {
  let best: RaceListing | null = null;
  for (const r of races) {
    if (r.firstSessionMs <= now && (!best || r.firstSessionMs > best.firstSessionMs)) best = r;
  }
  return best;
}
