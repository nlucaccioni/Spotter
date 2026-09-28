import { parseLiveFeed, type ParseIssue } from './feeds/liveFeed.parse.ts';
import type { Session } from './model/types.ts';
import { createPoller, type Poller, type PollerConfig } from './polling/poller.ts';
import { FeedError, type Fetcher } from './sources/fetcher.ts';

export const LIVE_FEED_URL = 'https://cf.nascar.com/live/feeds/live-feed.json';

export interface LiveSnapshot {
  session: Session;
  issues: ParseIssue[];
  /** Feed content minus its self-updating timestamps; equal fingerprints = nothing happened. */
  fingerprint: string;
}

export interface LiveSessionOptions extends Pick<
  PollerConfig<LiveSnapshot>,
  'timing' | 'visibility' | 'random'
> {
  fetcher: Fetcher;
  url?: string;
  /** Called with every successfully parsed snapshot (e.g. for logging). */
  onSnapshot?: (snapshot: LiveSnapshot) => void;
}

/** Fetches and parses one live-feed snapshot. Rejects with a FeedError. */
export async function loadLiveSnapshot(
  fetcher: Fetcher,
  url: string = LIVE_FEED_URL,
  signal?: AbortSignal,
): Promise<LiveSnapshot> {
  const raw = await fetcher.fetchJson(url, signal ? { signal } : {});
  const result = parseLiveFeed(raw);
  if (!result.ok) throw new FeedError('invalid', `Unexpected feed shape: ${result.error}`);
  return { session: result.session, issues: result.issues, fingerprint: contentFingerprint(raw) };
}

// The feed is republished every ~45 s even when idle, with a fresh `time_of_day_os`
// (see docs/feed-notes.md), so those fields are excluded from the comparison.
export function contentFingerprint(raw: unknown): string {
  if (raw === null || typeof raw !== 'object') return JSON.stringify(raw);
  const content = { ...(raw as Record<string, unknown>) };
  delete content.time_of_day_os;
  delete content.time_of_day;
  return JSON.stringify(content);
}

export function createLiveSessionPoller(options: LiveSessionOptions): Poller<LiveSnapshot> {
  const { fetcher, url, onSnapshot, ...pollerOptions } = options;
  return createPoller<LiveSnapshot>({
    ...pollerOptions,
    async load(signal) {
      const snapshot = await loadLiveSnapshot(fetcher, url, signal);
      onSnapshot?.(snapshot);
      return snapshot;
    },
    fingerprint: (snapshot) => snapshot.fingerprint,
    isFinished: (snapshot) => snapshot.session.flag.kind === 'checkered',
  });
}
