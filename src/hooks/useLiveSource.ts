import { useEffect, useState } from 'react';
import { LIVE_POINTS_URL } from '../data/feeds/points.ts';
import {
  currentRace,
  parseRaceList,
  raceListUrl,
  seriesLiveFeedUrl,
  seriesLivePointsUrl,
  type RaceListing,
  type SeriesId,
} from '../data/feeds/schedule.ts';
import { LIVE_FEED_URL } from '../data/liveSession.ts';
import { createBrowserFetcher } from '../data/sources/browserFetcher.ts';
import type { LiveSeries } from '../prefs/preferences.ts';
import { useNow } from './useNow.ts';

export interface LiveSource {
  /** Null while the series' schedule is loading (or failed to load). */
  feedUrl: string | null;
  pointsUrl: string | null;
  /** The race being followed, when a series is picked. */
  race: RaceListing | null;
  /** The schedule couldn't be loaded; it's retried automatically. */
  error: Error | null;
}

const RETRY_MS = 30_000;
const fetcher = createBrowserFetcher(30_000);

// Schedules rarely change, so each series' is fetched once per page. The previous season is
// included so early January still finds the last race.
const schedules = new Map<SeriesId, Promise<RaceListing[]>>();

function loadSchedule(seriesId: SeriesId): Promise<RaceListing[]> {
  let loading = schedules.get(seriesId);
  if (!loading) {
    const year = new Date().getFullYear();
    loading = Promise.all(
      [year - 1, year].map((y) =>
        fetcher.fetchJson(raceListUrl(y, seriesId)).then(parseRaceList, () => []),
      ),
    ).then(([previous = [], current = []]) => {
      if (previous.length + current.length === 0) throw new Error('No schedule available');
      return [...previous, ...current];
    });
    loading.catch(() => schedules.delete(seriesId));
    schedules.set(seriesId, loading);
  }
  return loading;
}

/**
 * Which feeds to poll. "auto" follows live-feed.json (whatever NASCAR is featuring); a series
 * follows that series' current race, moving on when the next weekend's first session starts.
 */
export function useLiveSource(series: LiveSeries): LiveSource {
  // Tagged with the series it belongs to, so switching never shows the old series' race.
  const [loaded, setLoaded] = useState<{
    series: SeriesId;
    races: RaceListing[] | null;
    error: Error | null;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const now = useNow(60_000);

  useEffect(() => {
    if (series === 'auto') return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    loadSchedule(series).then(
      (races) => !cancelled && setLoaded({ series, races, error: null }),
      (error: unknown) => {
        if (cancelled) return;
        setLoaded({
          series,
          races: null,
          error: error instanceof Error ? error : new Error(String(error)),
        });
        retry = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
      },
    );
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, [series, attempt]);

  if (series === 'auto') {
    return { feedUrl: LIVE_FEED_URL, pointsUrl: LIVE_POINTS_URL, race: null, error: null };
  }
  const current = loaded?.series === series ? loaded : null;
  const race = current?.races ? currentRace(current.races, now) : null;
  return {
    feedUrl: race && seriesLiveFeedUrl(series, race.raceId),
    pointsUrl: race && seriesLivePointsUrl(series, race.raceId),
    race,
    error: current?.error ?? null,
  };
}
