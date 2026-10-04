// DEV ONLY. Recording source for NASCAR's live feeds (docs/feed-notes.md).
//
//   npm run record                  live-feed.json + live-points.json (whatever NASCAR features)
//   npm run record -- --series 1    that series' current race (1 Cup, 2 O'Reilly, 3 Truck)

import { LIVE_POINTS_URL } from '../../data/feeds/points.ts';
import {
  currentRace,
  parseRaceList,
  raceListUrl,
  SERIES_IDS,
  SERIES_SHORT,
  seriesLiveFeedUrl,
  seriesLivePointsUrl,
  type SeriesId,
} from '../../data/feeds/schedule.ts';
import type { RecordingSource } from '../recording.ts';

// Not imported from liveSession.ts, which pulls in the whole polling stack.
const LIVE_FEED_URL = 'https://cf.nascar.com/live/feeds/live-feed.json';

const RUN_TYPES: Record<number, string> = { 1: 'Practice', 2: 'Qualifying', 3: 'Race' };
const CHECKERED = 9;

interface FeedHeader {
  lap_number?: number;
  laps_in_race?: number;
  flag_state?: number;
  run_name?: string;
  run_type?: number;
  series_id?: number;
}

const header = (body: unknown) => (body ?? {}) as FeedHeader;

export const nascar: RecordingSource = {
  id: 'nascar',

  async feeds(options) {
    if (!options.series) return { 'live-feed': LIVE_FEED_URL, 'live-points': LIVE_POINTS_URL };
    const series = Number(options.series) as SeriesId;
    if (!SERIES_IDS.includes(series)) {
      throw new Error(`--series must be one of ${SERIES_IDS.join(', ')}`);
    }
    const year = new Date().getFullYear();
    const response = await fetch(raceListUrl(year, series));
    if (!response.ok) throw new Error(`Schedule: HTTP ${response.status}`);
    const race = currentRace(parseRaceList(await response.json()), Date.now());
    if (!race) throw new Error(`No current ${SERIES_SHORT[series]} race`);
    return {
      'live-feed': seriesLiveFeedUrl(series, race.raceId),
      'live-points': seriesLivePointsUrl(series, race.raceId),
    };
  },

  // Matches both live-feed.json and series_<n>/<race>/live_feed.json.
  feedForUrl(url) {
    if (/\/live[-_]feed\.json/.test(url)) return 'live-feed';
    if (/\/live[-_]points\.json/.test(url)) return 'live-points';
    return null;
  },

  title(body) {
    const { series_id, run_name, run_type } = header(body);
    const series = SERIES_SHORT[series_id as SeriesId];
    return [`NASCAR${series ? ` ${series}` : ''}`, run_name, RUN_TYPES[run_type ?? 0]]
      .filter(Boolean)
      .join(' - ');
  },

  progress(body) {
    const { lap_number, laps_in_race, flag_state } = header(body);
    return `lap ${lap_number ?? '?'}/${laps_in_race ?? '?'}, flag ${flag_state ?? '?'}`;
  },

  isFinished: (body) => header(body).flag_state === CHECKERED,
};
