import { useEffect, useRef, useState } from 'react';
import {
  lapTimesUrl,
  parseLapTimes,
  parsePitStops,
  parseRaceSummary,
  pitDataUrl,
  type LapTimes,
  type PitStop,
  type RaceSummary,
} from '../data/feeds/race.ts';
import { parseLivePoints, parseSeasonPoints, seasonPointsUrl } from '../data/feeds/points.ts';
import { provisionalSummary } from '../data/analysis/race.ts';
import { isPenaltyUpdate, type OfficialStandings } from '../data/analysis/season.ts';
import {
  parseRaceList,
  raceListUrl,
  seriesLivePointsUrl,
  SERIES_IDS,
  type RaceListing,
  type SeriesId,
} from '../data/feeds/schedule.ts';
import { weekendFeedUrl } from '../data/feeds/weekend.ts';
import { fetchCached, fetchCachedStrict, fetchFresh } from '../data/sources/cachedFetch.ts';
import {
  manufacturerPointsUrl,
  ownerPointsUrl,
  parseManufacturerPoints,
  parseOwnerPoints,
  type ManufacturerStanding,
  type OwnerStanding,
} from '../data/feeds/standings.ts';

// Data for the analysis page. Everything comes from NASCAR's per-race files, which are cached
// for the page's lifetime (see cachedFetch.ts), so switching views or series back is instant.

const BATCH = 6;
/** How often a race in progress re-reads its lap times, pit stops and results. */
const LIVE_REFRESH_MS = 30_000;

export type Load<T> =
  | { status: 'loading'; data: null; progress?: [done: number, total: number] }
  | { status: 'error'; data: null; retry: () => void }
  | { status: 'ready'; data: T };

const isSeries = (id: number): id is SeriesId => SERIES_IDS.includes(id as SeriesId);

/**
 * Races that have been run this season, oldest first, plus `liveRaceId` (the race in progress)
 * if given. In a past season every race whose weekend has started counts: NASCAR leaves some
 * winners blank in old race lists (late 2022).
 */
export function useFinishedRaces(
  year: number,
  seriesId: number,
  liveRaceId: number | null = null,
): Load<RaceListing[]> {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; load: Load<RaceListing[]> } | null>(null);
  const key = `${year}/${seriesId}/${liveRaceId}/${attempt}`;

  useEffect(() => {
    if (!isSeries(seriesId)) return;
    let active = true;
    fetchCachedStrict(raceListUrl(year, seriesId), parseRaceList).then(
      (races) => {
        if (!active) return;
        const now = Date.now();
        const past = year < new Date(now).getFullYear();
        const finished = races
          .filter((r) => r.finished || r.raceId === liveRaceId || (past && r.firstSessionMs < now))
          .sort((a, b) => a.firstSessionMs - b.firstSessionMs);
        setState({ key, load: { status: 'ready', data: finished } });
      },
      () => {
        if (active) {
          setState({
            key,
            load: { status: 'error', data: null, retry: () => setAttempt((n) => n + 1) },
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [year, seriesId, liveRaceId, key]);

  return state?.key === key ? state.load : { status: 'loading', data: null };
}

export interface SeasonData {
  /** Official results of each race run, oldest first. */
  races: RaceSummary[];
  /**
   * The official standings after each race (same index), or null where NASCAR's file is
   * missing. Includes penalties and playoff resets, unlike adding up race points.
   */
  official: (OfficialStandings | null)[];
}

/** A race's final live-points file: everyone's season total once that race was over. */
function officialAfterRace(seriesId: number, raceId: number): Promise<OfficialStandings | null> {
  if (!isSeries(seriesId)) return Promise.resolve(null);
  return fetchCachedStrict(seriesLivePointsUrl(seriesId, raceId), parseLivePoints).then(
    (entries) => toStandings(entries),
    () => null,
  );
}

function toStandings(
  entries: readonly { driverId: number | null; points: number; position: number }[],
): OfficialStandings | null {
  const map = new Map<number, { points: number; position: number }>();
  for (const e of entries) {
    if (e.driverId !== null && !map.has(e.driverId)) {
      map.set(e.driverId, { points: e.points, position: e.position });
    }
  }
  return map.size ? map : null;
}

/** Results and official standings for the given races. Races without results are dropped. */
export function useSeasonResults(
  year: number,
  seriesId: number,
  races: readonly RaceListing[] | null,
): Load<SeasonData> {
  const [attempt, setAttempt] = useState(0);
  const ids = races?.map((r) => r.raceId).join(',') ?? null;
  const key = `${year}/${seriesId}/${ids}/${attempt}`;
  const [state, setState] = useState<{ key: string; load: Load<SeasonData> } | null>(null);

  useEffect(() => {
    if (ids === null) return;
    let active = true;
    const raceIds = ids ? ids.split(',').map(Number) : [];
    void (async () => {
      const summaries: (readonly [RaceSummary | null, OfficialStandings | null])[] = [];
      let current: OfficialStandings | null = null;
      try {
        // Today's season standings, for penalties handed out since the latest race.
        const currentStandings = fetchCachedStrict(
          seasonPointsUrl(year, seriesId),
          parseSeasonPoints,
        ).then(toStandings, () => null);
        for (let i = 0; i < raceIds.length; i += BATCH) {
          const batch = await Promise.all(
            raceIds
              .slice(i, i + BATCH)
              .map((id) =>
                Promise.all([
                  fetchCachedStrict(weekendFeedUrl(year, seriesId, id), parseRaceSummary),
                  officialAfterRace(seriesId, id),
                ] as const),
              ),
          );
          if (!active) return;
          summaries.push(...batch);
          if (summaries.length < raceIds.length) {
            setState({
              key,
              load: { status: 'loading', data: null, progress: [summaries.length, raceIds.length] },
            });
          }
        }
        current = await currentStandings;
      } catch {
        if (active) {
          setState({
            key,
            load: { status: 'error', data: null, retry: () => setAttempt((n) => n + 1) },
          });
        }
        return;
      }
      if (!active) return;
      const kept = summaries.filter(
        (s): s is readonly [RaceSummary, OfficialStandings | null] =>
          s[0] !== null && s[0].results.length > 0,
      );
      const official = kept.map(([, standings]) => standings);
      const last = official.length - 1;
      if (current && last >= 0 && isPenaltyUpdate(official[last] ?? null, current)) {
        official[last] = current;
      }
      setState({
        key,
        load: { status: 'ready', data: { races: kept.map(([race]) => race), official } },
      });
    })();
    return () => {
      active = false;
    };
  }, [year, seriesId, ids, key]);

  if (ids === null) return { status: 'loading', data: null };
  return state?.key === key ? state.load : { status: 'loading', data: null, progress: [0, 0] };
}

export interface RaceDetail {
  /**
   * For a race in progress, results so far are filled in from the lap times (see
   * provisionalSummary) until NASCAR posts the official ones.
   */
  summary: RaceSummary | null;
  /** Null when NASCAR has no lap times for the race (or they couldn't be read). */
  laps: LapTimes | null;
  stops: PitStop[] | null;
  /** Still running (or just finished): no official results yet, and refreshed as it goes. */
  live: boolean;
}

/**
 * One race's results, lap times and pit stops. The lap and pit files are optional extras. With
 * `live` (the race in progress), the files are re-read every 30 s until official results are out.
 */
export function useRaceDetail(year: number, seriesId: number, raceId: number | null, live = false) {
  const [attempt, setAttempt] = useState(0);
  const key = `${year}/${seriesId}/${raceId}/${live}/${attempt}`;
  const [state, setState] = useState<{ key: string; load: Load<RaceDetail> } | null>(null);
  const loaded = useRef<string | null>(null);

  useEffect(() => {
    if (raceId === null) return;
    let active = true;
    let official = false;
    const optional = <T>(promise: Promise<T>) => promise.catch(() => null);
    const load = () => {
      // A race in progress always reads the latest files; a finished race uses the cache.
      const get = live ? fetchFresh : fetchCachedStrict;
      Promise.all([
        get(weekendFeedUrl(year, seriesId, raceId), parseRaceSummary),
        optional(get(lapTimesUrl(year, seriesId, raceId), parseLapTimes)),
        optional(get(pitDataUrl(year, seriesId, raceId), parsePitStops)),
      ]).then(
        ([summary, laps, stops]) => {
          if (!active) return;
          official = (summary?.results.length ?? 0) > 0;
          const lapData = laps && laps.cars.length ? laps : null;
          loaded.current = key;
          setState({
            key,
            load: {
              status: 'ready',
              data: {
                summary:
                  summary && lapData && live ? provisionalSummary(summary, lapData) : summary,
                laps: lapData,
                stops: stops && stops.length ? stops : null,
                live: live && !official,
              },
            },
          });
        },
        () => {
          // A failed refresh keeps showing the last data.
          if (active && loaded.current !== key) {
            setState({
              key,
              load: { status: 'error', data: null, retry: () => setAttempt((n) => n + 1) },
            });
          }
        },
      );
    };
    load();
    const timer = live
      ? setInterval(() => {
          if (!official) load();
        }, LIVE_REFRESH_MS)
      : undefined;
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [year, seriesId, raceId, live, key]);

  return state?.key === key ? state.load : ({ status: 'loading', data: null } as Load<RaceDetail>);
}

export interface OfficialGroupStandings {
  owners: OwnerStanding[] | null;
  makes: ManufacturerStanding[] | null;
}

/** Today's official owner and manufacturer standings; null for whichever can't be read. */
export function useGroupStandings(year: number, seriesId: number): OfficialGroupStandings {
  const key = `${year}/${seriesId}`;
  const [state, setState] = useState<{ key: string; data: OfficialGroupStandings } | null>(null);

  useEffect(() => {
    let active = true;
    const orNull = <T>(rows: T[]) => (rows.length ? rows : null);
    void Promise.all([
      fetchCached(ownerPointsUrl(year, seriesId), parseOwnerPoints, []),
      fetchCached(manufacturerPointsUrl(year, seriesId), parseManufacturerPoints, []),
    ]).then(([owners, makes]) => {
      if (active) setState({ key, data: { owners: orNull(owners), makes: orNull(makes) } });
    });
    return () => {
      active = false;
    };
  }, [year, seriesId, key]);

  return state?.key === key ? state.data : { owners: null, makes: null };
}
