import { useSyncExternalStore } from 'react';
import { createLiveSessionPoller, type LiveSnapshot } from '../data/liveSession.ts';
import { documentVisibility, type PollerState } from '../data/polling/poller.ts';
import { createSessionHistory, type HistoryUpdate } from '../data/sessionHistory.ts';
import { createBrowserFetcher } from '../data/sources/browserFetcher.ts';
import type { Fetcher } from '../data/sources/fetcher.ts';
import {
  readReplayOptions,
  RECORDED_FRAME_SECONDS,
  type ReplayOptions,
} from '../dev/replayParams.ts';

// One poller per tab, shared by every component that uses the hook. It starts with the first
// subscriber and stops when the last one unmounts. Each new snapshot is diffed against the
// previous one to produce events and position changes.

interface StoreState {
  poll: PollerState<LiveSnapshot>;
  history: HistoryUpdate | null;
}

// Dev builds only: `?replay=<folder>` swaps the network fetcher for a recorded session.
const replay: ReplayOptions | null = import.meta.env.DEV
  ? readReplayOptions(window.location.search)
  : null;

function createStore() {
  const poller = createLiveSessionPoller({
    fetcher: replay ? lazyReplayFetcher(replay) : createBrowserFetcher(),
    visibility: documentVisibility(),
    onSnapshot: logSnapshot,
    // Replays don't touch NASCAR's CDN, so the politeness floor doesn't apply.
    ...(replay && {
      timing: { activeMs: (RECORDED_FRAME_SECONDS * 1000) / replay.speed, minMs: 50, jitter: 0 },
    }),
  });
  const history = createSessionHistory();
  const listeners = new Set<() => void>();
  let lastData: LiveSnapshot | null = null;
  let state: StoreState = { poll: poller.getState(), history: null };
  let subscribers = 0;

  poller.subscribe((poll) => {
    let update = state.history;
    if (poll.data && poll.data !== lastData) {
      lastData = poll.data;
      update = history.push(poll.data.session, poll.lastSuccessAt ?? Date.now());
    }
    state = { poll, history: update };
    for (const listener of listeners) listener();
  });

  return {
    getState: () => state,
    subscribe(onChange: () => void) {
      listeners.add(onChange);
      if (subscribers++ === 0) poller.start();
      return () => {
        listeners.delete(onChange);
        if (--subscribers === 0) poller.stop();
      };
    },
  };
}

const NO_CARS: ReadonlySet<string> = new Set();

let store: ReturnType<typeof createStore> | null = null;
const getStore = () => (store ??= createStore());
const subscribe = (onChange: () => void) => getStore().subscribe(onChange);
const getSnapshot = () => getStore().getState();

export function useLiveSession() {
  const { poll, history } = useSyncExternalStore(subscribe, getSnapshot);
  return {
    session: poll.data?.session ?? null,
    status: poll.status,
    error: poll.error,
    lastUpdated: poll.lastSuccessAt,
    lastChanged: poll.lastChangeAt,
    nextPollAt: poll.nextPollAt,
    events: history?.events ?? [],
    positionChanges: history?.positionChanges ?? null,
    updateId: history?.updateId ?? 0,
    outLaps: history?.outLaps ?? NO_CARS,
    replay,
  };
}

function lazyReplayFetcher(options: ReplayOptions): Fetcher {
  let fetcher: Promise<Fetcher> | null = null;
  return {
    async fetchJson(url, opts) {
      fetcher ??= import('../dev/replay.ts').then((m) => m.createReplayFetcher(options));
      return (await fetcher).fetchJson(url, opts);
    },
  };
}

const seenFlagCodes = new Set<number | null>();

function logSnapshot({ session, issues }: LiveSnapshot) {
  for (const issue of issues) {
    console.warn(`[live-feed] dropped vehicle at index ${issue.index}:\n${issue.message}`);
  }
  // PROJECT_BRIEF.md §3.4: log each distinct flag_state so the mapping can be confirmed.
  // Replays are skipped: their flag codes come from our own converter, not NASCAR.
  if (import.meta.env.DEV && !replay && !seenFlagCodes.has(session.flag.code)) {
    seenFlagCodes.add(session.flag.code);
    console.info(
      `[live-feed] flag_state ${session.flag.code} -> ${session.flag.label}` +
        ` (lap ${session.lap}, ${session.runName})`,
    );
  }
}
