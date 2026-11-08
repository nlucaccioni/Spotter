import { useEffect, useState } from 'react';
import { parseRaceList, raceListUrl, SERIES_IDS, type SeriesId } from '../data/feeds/schedule.ts';
import { mergeTeams, parseWeekendTeams, weekendFeedUrl } from '../data/feeds/weekend.ts';
import { createBrowserFetcher } from '../data/sources/browserFetcher.ts';

// Team names come from race weekend feeds (~50 KB each). Starting with the given race (or the
// latest one under way), earlier weekends are read until every wanted driver has a team or the
// season runs out, so part-timers get the team they last raced for. Feeds are cached for the
// page's lifetime: a weekend's entries don't change once it's under way.

const fetcher = createBrowserFetcher(20_000);
const cache = new Map<string, Promise<unknown>>();
const BATCH = 4;
const EMPTY: ReadonlyMap<number, string> = new Map();

function fetchCached<T>(url: string, parse: (raw: unknown) => T, fallback: T): Promise<T> {
  let entry = cache.get(url) as Promise<T> | undefined;
  if (!entry) {
    entry = fetcher
      .fetchJson(url)
      .then(parse)
      .catch(() => {
        cache.delete(url); // retry on a later render
        return fallback;
      });
    cache.set(url, entry);
  }
  return entry;
}

interface Options {
  year: number;
  seriesId: number;
  /** The race to read first (the one on the board), if known. */
  raceId: number | null;
  /** Drivers that need a team; the search stops once all are found. */
  driverIds: readonly number[];
  enabled: boolean;
}

/** Team name by driver id; fills in as weekend feeds arrive. */
export function useTeamNames({ year, seriesId, raceId, driverIds, enabled }: Options) {
  // Tagged with the season it's for, so switching series never shows the last one's teams.
  const [found, setFound] = useState<{ season: string; teams: ReadonlyMap<number, string> }>({
    season: '',
    teams: EMPTY,
  });
  const season = `${year}/${seriesId}`;
  // A stable key so a new poll with the same drivers doesn't restart the search.
  const wantedKey = [...new Set(driverIds)].sort((a, b) => a - b).join(',');

  useEffect(() => {
    if (!enabled || !SERIES_IDS.includes(seriesId as SeriesId)) return;
    let active = true;
    const wanted = wantedKey ? wantedKey.split(',').map(Number) : [];

    void (async () => {
      const races = await fetchCached(raceListUrl(year, seriesId as SeriesId), parseRaceList, []);
      const now = Date.now();
      const started = races
        .filter((r) => r.firstSessionMs <= now)
        .sort((a, b) => b.firstSessionMs - a.firstSessionMs)
        .map((r) => r.raceId);
      const order = raceId === null ? started : [raceId, ...started.filter((id) => id !== raceId)];

      const perRace: Map<number, string>[] = [];
      for (let i = 0; i < order.length; i += BATCH) {
        const batch = await Promise.all(
          order
            .slice(i, i + BATCH)
            .map((id) =>
              fetchCached(weekendFeedUrl(year, seriesId, id), parseWeekendTeams, new Map()),
            ),
        );
        if (!active) return;
        perRace.push(...batch);
        const merged = mergeTeams(perRace);
        setFound({ season: `${year}/${seriesId}`, teams: merged });
        if (wanted.every((id) => merged.has(id))) return;
      }
    })();

    return () => {
      active = false;
    };
  }, [enabled, year, seriesId, raceId, wantedKey]);

  return enabled && found.season === season ? found.teams : EMPTY;
}
