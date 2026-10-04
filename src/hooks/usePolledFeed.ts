import { useCallback, useEffect, useRef, useState } from 'react';
import { createDelayBuffer, type DelayBuffer } from '../data/delayBuffer.ts';
import {
  createPoller,
  documentVisibility,
  type Poller,
  type PollStatus,
} from '../data/polling/poller.ts';
import { createFeedFetcher } from '../data/sources/feedFetcher.ts';

export interface PolledFeed<T> {
  data: T | null;
  status: PollStatus;
  error: Error | null;
  /** When the data on screen arrived. */
  lastUpdated: number | null;
  /** Data is held for the TV delay until this time (nothing shown yet). */
  holdingUntil: number | null;
  retry: () => void;
}

interface Options {
  /** Polling interval while the page is open (the poller's jitter, floor and backoff apply). */
  intervalMs: number;
  /** TV delay: show each update this many seconds after it arrives. */
  delaySeconds: number;
}

const fetcher = createFeedFetcher();

/**
 * Polls a JSON feed while the component is mounted, through the same polling engine as the live
 * feed (jitter, backoff, pause when hidden, one request at a time) and the same TV delay.
 * A null `url` means "nothing to fetch yet".
 */
export function usePolledFeed<T>(
  url: string | null,
  parse: (raw: unknown) => T,
  { intervalMs, delaySeconds }: Options,
): PolledFeed<T> {
  // State is tagged with the URL it belongs to, so switching feeds never shows the old data.
  const [state, setState] = useState<{ url: string | null } & Omit<PolledFeed<T>, 'retry'>>({
    url: null,
    ...EMPTY,
  });
  const delayMs = useRef(delaySeconds * 1000);
  const buffer = useRef<DelayBuffer<T> | null>(null);
  const flushRef = useRef<() => void>(() => {});
  const pollerRef = useRef<Poller<T> | null>(null);

  useEffect(() => {
    if (!url) return;

    const held = createDelayBuffer<T>();
    buffer.current = held;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let shown: { data: T; at: number } | null = null;
    let lastData: T | null = null;

    const poller = createPoller<T>({
      load: (signal) => fetcher.fetchJson(url, { signal }).then(parse),
      fingerprint: (data) => JSON.stringify(data),
      timing: { activeMs: intervalMs, idleMs: intervalMs * 4 },
      visibility: documentVisibility(),
    });
    pollerRef.current = poller;

    const flush = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      const due = held.release(Date.now(), delayMs.current);
      if (due) shown = { data: due.value, at: due.at };
      const nextDueAt = held.nextDueAt(delayMs.current);
      if (nextDueAt !== null) timer = setTimeout(flush, Math.max(0, nextDueAt - Date.now()));
      const poll = poller.getState();
      setState({
        url,
        data: shown?.data ?? null,
        status: poll.status,
        error: poll.error,
        lastUpdated: shown?.at ?? null,
        holdingUntil: shown === null ? nextDueAt : null,
      });
    };
    flushRef.current = flush;

    const unsubscribe = poller.subscribe((poll) => {
      if (poll.data !== null && poll.data !== lastData) {
        lastData = poll.data;
        held.push(poll.data, poll.lastSuccessAt ?? Date.now());
      }
      flush();
    });
    poller.start();
    return () => {
      unsubscribe();
      poller.stop();
      if (timer !== undefined) clearTimeout(timer);
      pollerRef.current = null;
    };
  }, [url, parse, intervalMs]);

  // Changing the delay re-evaluates what's due without restarting the poller.
  useEffect(() => {
    delayMs.current = delaySeconds * 1000;
    flushRef.current();
  }, [delaySeconds]);

  const retry = useCallback(() => pollerRef.current?.refresh(), []);
  const current = url !== null && state.url === url ? state : EMPTY;
  return {
    data: current.data,
    status: current.status,
    error: current.error,
    lastUpdated: current.lastUpdated,
    holdingUntil: current.holdingUntil,
    retry,
  };
}

const EMPTY = {
  data: null,
  status: 'connecting' as PollStatus,
  error: null,
  lastUpdated: null,
  holdingUntil: null,
};
