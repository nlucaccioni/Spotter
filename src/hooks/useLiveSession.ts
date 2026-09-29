import { useSyncExternalStore } from 'react';
import { createDelayBuffer, type Timed } from '../data/delayBuffer.ts';
import { createLiveSessionPoller, LIVE_FEED_URL, type LiveSnapshot } from '../data/liveSession.ts';
import { documentVisibility, type Poller, type PollerState } from '../data/polling/poller.ts';
import { createSessionHistory, type HistoryUpdate } from '../data/sessionHistory.ts';
import { createBrowserFetcher } from '../data/sources/browserFetcher.ts';
import type { Fetcher } from '../data/sources/fetcher.ts';
import {
  readReplayOptions,
  RECORDED_FRAME_SECONDS,
  type ReplayOptions,
} from '../dev/replayParams.ts';

// One poller per tab, shared by every component that uses the hook. It starts with the first
// subscriber and stops when the last one unmounts. New snapshots pass through the TV-delay
// buffer; each one shown is diffed against the previous one to produce events and position
// changes, so events, flashes and slides are delayed along with the data. Switching feeds
// (another series) starts over with a fresh poller, buffer and history.

interface StoreState {
  /** Real-time polling state (status, errors); never delayed. */
  poll: PollerState<LiveSnapshot>;
  /** The snapshot on screen, after the TV delay. */
  shown: Timed<LiveSnapshot> | null;
  history: HistoryUpdate | null;
  /** When the next held snapshot is due, or null. */
  nextDueAt: number | null;
  delaySeconds: number;
}

// Dev builds only: `?replay=<folder>` swaps the network fetcher for a recorded session.
const replay: ReplayOptions | null = import.meta.env.DEV
  ? readReplayOptions(window.location.search)
  : null;

function createStore() {
  const fetcher = replay ? lazyReplayFetcher(replay) : createBrowserFetcher();
  const listeners = new Set<() => void>();
  let poller: Poller<LiveSnapshot> | null = null;
  let unsubscribePoller: (() => void) | null = null;
  let history = createSessionHistory();
  let buffer = createDelayBuffer<LiveSnapshot>();
  let lastData: LiveSnapshot | null = null;
  // Replays ignore the URL, so they start straight away; otherwise App picks the feed.
  let url: string | null = replay ? LIVE_FEED_URL : null;
  let delayMs = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let state: StoreState = {
    poll: NOT_POLLING,
    shown: null,
    history: null,
    nextDueAt: null,
    delaySeconds: 0,
  };
  let subscribers = 0;

  /** Shows whatever is due, and schedules the next release. */
  function flush(poll: PollerState<LiveSnapshot> = state.poll) {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const due = buffer.release(Date.now(), delayMs);
    const shown = due ?? state.shown;
    const update = due ? history.push(due.value.session, due.at) : state.history;
    const nextDueAt = buffer.nextDueAt(delayMs);
    if (nextDueAt !== null) timer = setTimeout(() => flush(), Math.max(0, nextDueAt - Date.now()));
    state = { poll, shown, history: update, nextDueAt, delaySeconds: delayMs / 1000 };
    for (const listener of listeners) listener();
  }

  /** Starts polling `url` from scratch: nothing from the previous feed carries over. */
  function connect() {
    unsubscribePoller?.();
    poller?.stop();
    poller = null;
    unsubscribePoller = null;
    history = createSessionHistory();
    buffer = createDelayBuffer<LiveSnapshot>();
    lastData = null;
    state = { ...state, shown: null, history: null };
    if (url === null) {
      flush(NOT_POLLING);
      return;
    }
    const next = createLiveSessionPoller({
      fetcher,
      url,
      visibility: documentVisibility(),
      onSnapshot: logSnapshot,
      // Replays don't touch NASCAR's CDN, so the politeness floor doesn't apply.
      ...(replay && {
        timing: { activeMs: (RECORDED_FRAME_SECONDS * 1000) / replay.speed, minMs: 50, jitter: 0 },
      }),
    });
    poller = next;
    unsubscribePoller = next.subscribe((poll) => {
      if (poll.data && poll.data !== lastData) {
        lastData = poll.data;
        buffer.push(poll.data, poll.lastSuccessAt ?? Date.now());
      }
      flush(poll);
    });
    flush(next.getState());
    if (subscribers > 0) next.start();
  }

  connect();

  return {
    getState: () => state,
    refresh: () => poller?.refresh(),
    setUrl(next: string | null) {
      if (replay || next === url) return;
      url = next;
      connect();
    },
    setDelaySeconds(seconds: number) {
      const next = Math.max(0, seconds) * 1000;
      if (next === delayMs) return;
      delayMs = next;
      flush();
    },
    subscribe(onChange: () => void) {
      listeners.add(onChange);
      if (subscribers++ === 0) poller?.start();
      return () => {
        listeners.delete(onChange);
        if (--subscribers === 0) poller?.stop();
      };
    },
  };
}

/** Before a feed is chosen (e.g. while a series' schedule loads). */
const NOT_POLLING: PollerState<LiveSnapshot> = {
  status: 'connecting',
  data: null,
  error: null,
  consecutiveErrors: 0,
  lastSuccessAt: null,
  lastChangeAt: null,
  nextPollAt: null,
};

const NO_CARS: ReadonlySet<string> = new Set();

let store: ReturnType<typeof createStore> | null = null;
const getStore = () => (store ??= createStore());
const subscribe = (onChange: () => void) => getStore().subscribe(onChange);
const getSnapshot = () => getStore().getState();

/** Switches the board to another live feed; null stops polling until one is chosen. */
export function setLiveFeedUrl(url: string | null) {
  getStore().setUrl(url);
}

/** Sets the TV delay; the board then shows each update this many seconds after it arrives. */
export function setLiveDelaySeconds(seconds: number) {
  getStore().setDelaySeconds(seconds);
}

export function useLiveSession() {
  const { poll, shown, history, nextDueAt, delaySeconds } = useSyncExternalStore(
    subscribe,
    getSnapshot,
  );
  return {
    session: shown?.value.session ?? null,
    status: poll.status,
    error: poll.error,
    /** When the data on screen arrived (so with a TV delay, it's that long ago). */
    lastUpdated: shown?.at ?? null,
    lastChanged: poll.lastChangeAt,
    delaySeconds,
    /** Data has arrived but is being held for the TV delay: when the first update is due. */
    holdingUntil: shown === null ? nextDueAt : null,
    nextPollAt: poll.nextPollAt,
    events: history?.events ?? [],
    positionChanges: history?.positionChanges ?? null,
    updateId: history?.updateId ?? 0,
    outLaps: history?.outLaps ?? NO_CARS,
    replay,
    retry: () => getStore().refresh(),
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
