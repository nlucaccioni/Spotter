import { useSyncExternalStore } from 'react';
import { createDelayBuffer, type Timed } from '../data/delayBuffer.ts';
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
// subscriber and stops when the last one unmounts. New snapshots pass through the TV-delay
// buffer; each one shown is diffed against the previous one to produce events and position
// changes, so events, flashes and slides are delayed along with the data.

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
  const buffer = createDelayBuffer<LiveSnapshot>();
  const listeners = new Set<() => void>();
  let lastData: LiveSnapshot | null = null;
  let delayMs = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let state: StoreState = {
    poll: poller.getState(),
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

  poller.subscribe((poll) => {
    if (poll.data && poll.data !== lastData) {
      lastData = poll.data;
      buffer.push(poll.data, poll.lastSuccessAt ?? Date.now());
    }
    flush(poll);
  });

  return {
    getState: () => state,
    refresh: () => poller.refresh(),
    setDelaySeconds(seconds: number) {
      const next = Math.max(0, seconds) * 1000;
      if (next === delayMs) return;
      delayMs = next;
      flush();
    },
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
