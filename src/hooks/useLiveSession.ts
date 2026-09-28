import { useSyncExternalStore } from 'react';
import { createLiveSessionPoller, type LiveSnapshot } from '../data/liveSession.ts';
import { documentVisibility, type Poller, type PollerState } from '../data/polling/poller.ts';
import { createBrowserFetcher } from '../data/sources/browserFetcher.ts';

// One poller per tab, shared by every component that uses the hook. It starts with the first
// subscriber and stops when the last one unmounts.
let poller: Poller<LiveSnapshot> | null = null;
let subscribers = 0;

function getPoller(): Poller<LiveSnapshot> {
  poller ??= createLiveSessionPoller({
    fetcher: createBrowserFetcher(),
    visibility: documentVisibility(),
    onSnapshot: logSnapshot,
  });
  return poller;
}

function subscribe(onChange: () => void): () => void {
  const p = getPoller();
  const unsubscribe = p.subscribe(onChange);
  if (subscribers++ === 0) p.start();
  return () => {
    unsubscribe();
    if (--subscribers === 0) p.stop();
  };
}

const getSnapshot = () => getPoller().getState();

export type LiveSessionState = PollerState<LiveSnapshot>;

export function useLiveSession() {
  const state = useSyncExternalStore(subscribe, getSnapshot);
  return {
    session: state.data?.session ?? null,
    status: state.status,
    error: state.error,
    lastUpdated: state.lastSuccessAt,
    lastChanged: state.lastChangeAt,
    nextPollAt: state.nextPollAt,
  };
}

const seenFlagCodes = new Set<number | null>();

function logSnapshot({ session, issues }: LiveSnapshot) {
  for (const issue of issues) {
    console.warn(`[live-feed] dropped vehicle at index ${issue.index}:\n${issue.message}`);
  }
  // PROJECT_BRIEF.md §3.4: log each distinct flag_state so the mapping can be confirmed.
  if (import.meta.env.DEV && !seenFlagCodes.has(session.flag.code)) {
    seenFlagCodes.add(session.flag.code);
    console.info(
      `[live-feed] flag_state ${session.flag.code} -> ${session.flag.label}` +
        ` (lap ${session.lap}, ${session.runName})`,
    );
  }
}
