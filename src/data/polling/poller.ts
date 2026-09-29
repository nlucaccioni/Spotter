// Framework-agnostic polling engine implementing the rules in PROJECT_BRIEF.md §3.3:
// modest interval with jitter, a hard floor, slow polling when idle, exponential backoff on
// errors, pause while the page is hidden, and never more than one request in flight.

export type PollStatus =
  /** No successful response yet. */
  | 'connecting'
  /** Data is changing; polling at the active interval. */
  | 'live'
  /** Session finished, or content unchanged for a while; polling slowly. */
  | 'idle'
  /** Last request failed; backing off. `data` still holds the last good value, if any. */
  | 'error'
  /** Page hidden; not polling. */
  | 'paused';

export interface PollerState<T> {
  status: PollStatus;
  data: T | null;
  error: Error | null;
  consecutiveErrors: number;
  /** Epoch ms of the last successful response. */
  lastSuccessAt: number | null;
  /** Epoch ms when the content fingerprint last changed. */
  lastChangeAt: number | null;
  /** Epoch ms of the next scheduled request, or null when none is scheduled. */
  nextPollAt: number | null;
}

export interface PollerTiming {
  activeMs: number;
  idleMs: number;
  /** Unchanged content for this long counts as idle. */
  idleAfterMs: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  /** ±fraction applied to every delay. */
  jitter: number;
  /** No delay is ever shorter than this. */
  minMs: number;
}

export const DEFAULT_TIMING: PollerTiming = {
  activeMs: 5_000,
  idleMs: 60_000,
  idleAfterMs: 3 * 60_000,
  backoffBaseMs: 10_000,
  backoffMaxMs: 5 * 60_000,
  jitter: 0.1,
  minMs: 3_000,
};

export interface VisibilitySource {
  isHidden(): boolean;
  /** Returns an unsubscribe function. */
  subscribe(onChange: () => void): () => void;
}

export interface PollerConfig<T> {
  /** Performs one request. Rejects on any failure. */
  load: (signal: AbortSignal) => Promise<T>;
  /** Content identity, used to detect "nothing is happening". */
  fingerprint: (data: T) => string;
  /** True when the data itself says the session is over (e.g. checkered flag). */
  isFinished?: (data: T) => boolean;
  timing?: Partial<PollerTiming>;
  visibility?: VisibilitySource;
  /** Injectable for tests. */
  random?: () => number;
}

export interface Poller<T> {
  start(): void;
  stop(): void;
  /** Request now instead of waiting (e.g. a "Retry" button). No-op while a request is running. */
  refresh(): void;
  getState(): PollerState<T>;
  subscribe(listener: (state: PollerState<T>) => void): () => void;
}

export function createPoller<T>(config: PollerConfig<T>): Poller<T> {
  const timing = { ...DEFAULT_TIMING, ...config.timing };
  const random = config.random ?? Math.random;
  const listeners = new Set<(state: PollerState<T>) => void>();

  let state: PollerState<T> = {
    status: 'connecting',
    data: null,
    error: null,
    consecutiveErrors: 0,
    lastSuccessAt: null,
    lastChangeAt: null,
    nextPollAt: null,
  };
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: AbortController | null = null;
  let lastFingerprint: string | null = null;
  let statusBeforePause: PollStatus = 'connecting';
  let unsubscribeVisibility: (() => void) | null = null;

  const isHidden = () => config.visibility?.isHidden() ?? false;

  function setState(patch: Partial<PollerState<T>>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  }

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function pause(patch: Partial<PollerState<T>> = {}) {
    clearTimer();
    const status = patch.status ?? state.status;
    if (status !== 'paused') statusBeforePause = status;
    setState({ ...patch, status: 'paused', nextPollAt: null });
  }

  /** Records the outcome of a request and schedules the next one after `baseMs` (jittered). */
  function schedule(baseMs: number, patch: Partial<PollerState<T>>) {
    if (isHidden()) {
      pause(patch);
      return;
    }
    const jittered = baseMs * (1 + (random() * 2 - 1) * timing.jitter);
    const delay = Math.max(timing.minMs, Math.round(jittered));
    clearTimer();
    timer = setTimeout(() => void tick(), delay);
    setState({ ...patch, nextPollAt: Date.now() + delay });
  }

  async function tick() {
    timer = undefined;
    if (!running || inFlight) return;
    if (isHidden()) {
      pause();
      return;
    }

    const controller = new AbortController();
    inFlight = controller;
    try {
      const data = await config.load(controller.signal);
      if (controller.signal.aborted) return;

      const now = Date.now();
      const fingerprint = config.fingerprint(data);
      const lastChangeAt =
        fingerprint !== lastFingerprint || state.lastChangeAt === null ? now : state.lastChangeAt;
      lastFingerprint = fingerprint;

      const idle = (config.isFinished?.(data) ?? false) || now - lastChangeAt >= timing.idleAfterMs;
      schedule(idle ? timing.idleMs : timing.activeMs, {
        status: idle ? 'idle' : 'live',
        data,
        error: null,
        consecutiveErrors: 0,
        lastSuccessAt: now,
        lastChangeAt,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      const consecutiveErrors = state.consecutiveErrors + 1;
      const backoff = Math.min(
        timing.backoffBaseMs * 2 ** (consecutiveErrors - 1),
        timing.backoffMaxMs,
      );
      schedule(backoff, {
        status: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
        consecutiveErrors,
      });
    } finally {
      if (inFlight === controller) inFlight = null;
    }
  }

  function onVisibilityChange() {
    if (!running) return;
    if (isHidden()) {
      pause();
    } else if (state.status === 'paused') {
      // Resume immediately; the next response replaces this provisional status.
      setState({ status: statusBeforePause });
      void tick();
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      unsubscribeVisibility = config.visibility?.subscribe(onVisibilityChange) ?? null;
      if (isHidden()) pause();
      else void tick();
    },

    stop() {
      if (!running) return;
      running = false;
      clearTimer();
      inFlight?.abort();
      inFlight = null;
      unsubscribeVisibility?.();
      unsubscribeVisibility = null;
      if (state.status === 'paused') setState({ status: statusBeforePause, nextPollAt: null });
      else setState({ nextPollAt: null });
    },

    refresh() {
      if (!running || inFlight) return;
      clearTimer();
      void tick();
    },

    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** VisibilitySource backed by the Page Visibility API. */
export function documentVisibility(doc: Document = document): VisibilitySource {
  return {
    isHidden: () => doc.visibilityState === 'hidden',
    subscribe(onChange) {
      doc.addEventListener('visibilitychange', onChange);
      return () => doc.removeEventListener('visibilitychange', onChange);
    },
  };
}
