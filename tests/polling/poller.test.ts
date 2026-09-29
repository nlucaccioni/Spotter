import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPoller,
  type PollerConfig,
  type VisibilitySource,
} from '../../src/data/polling/poller.ts';

interface Data {
  value: string;
  finished?: boolean;
}

function fakeVisibility(hidden = false) {
  const listeners = new Set<() => void>();
  const source: VisibilitySource = {
    isHidden: () => hidden,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
  return {
    source,
    set(value: boolean) {
      hidden = value;
      for (const listener of listeners) listener();
    },
    listenerCount: () => listeners.size,
  };
}

/** A load() whose calls can be resolved or rejected one at a time. */
function controllableLoad() {
  const pending: { resolve: (d: Data) => void; reject: (e: Error) => void; signal: AbortSignal }[] =
    [];
  const load = vi.fn(
    (signal: AbortSignal) =>
      new Promise<Data>((resolve, reject) => pending.push({ resolve, reject, signal })),
  );
  return { load, pending };
}

function makePoller(overrides: Partial<PollerConfig<Data>> = {}) {
  let n = 0;
  const load = vi.fn(async () => ({ value: `v${n++}` }));
  const poller = createPoller<Data>({
    load,
    fingerprint: (d) => d.value,
    isFinished: (d) => d.finished ?? false,
    random: () => 0.5, // no jitter
    ...overrides,
  });
  return { poller, load: (overrides.load as typeof load | undefined) ?? load };
}

/** Advances fake time and lets resulting promise callbacks settle. */
async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-28T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('poller — normal operation', () => {
  it('polls immediately on start, then every 5 s', async () => {
    const { poller, load } = makePoller();
    poller.start();
    await advance(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(poller.getState()).toMatchObject({ status: 'live', data: { value: 'v0' } });

    await advance(4_999);
    expect(load).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(load).toHaveBeenCalledTimes(2);
    await advance(5_000);
    expect(load).toHaveBeenCalledTimes(3);
    poller.stop();
  });

  it('applies ±10% jitter', async () => {
    for (const [random, expected] of [
      [0, 4_500],
      [1, 5_500],
    ] as const) {
      const { poller } = makePoller({ random: () => random });
      poller.start();
      await advance(0);
      expect(poller.getState().nextPollAt! - Date.now()).toBe(expected);
      poller.stop();
    }
  });

  it('never schedules faster than 3 s, whatever the configuration', async () => {
    const { poller } = makePoller({ timing: { activeMs: 500 }, random: () => 0 });
    poller.start();
    await advance(0);
    expect(poller.getState().nextPollAt! - Date.now()).toBe(3_000);
    poller.stop();
  });

  it('notifies subscribers and stops notifying after unsubscribe', async () => {
    const { poller } = makePoller();
    const listener = vi.fn();
    const unsubscribe = poller.subscribe(listener);
    poller.start();
    await advance(0);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'live' }));
    unsubscribe();
    listener.mockClear();
    await advance(5_000);
    expect(listener).not.toHaveBeenCalled();
    poller.stop();
  });
});

describe('poller — idle detection', () => {
  it('slows to 60 s when the data says the session is finished', async () => {
    const { poller, load } = makePoller({
      load: vi.fn(async () => ({ value: 'final', finished: true })),
    });
    poller.start();
    await advance(0);
    expect(poller.getState().status).toBe('idle');
    await advance(59_999);
    expect(load).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(load).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('goes idle after 3 minutes of unchanged content, and live again when it changes', async () => {
    let value = 'same';
    const { poller } = makePoller({ load: vi.fn(async () => ({ value })) });
    poller.start();
    await advance(0);
    const firstChange = poller.getState().lastChangeAt;

    await advance(175_000); // 35 polls at 5 s, content unchanged
    expect(poller.getState().status).toBe('live');
    expect(poller.getState().lastChangeAt).toBe(firstChange);

    await advance(5_000); // 180 s since the last change
    expect(poller.getState().status).toBe('idle');
    expect(poller.getState().nextPollAt! - Date.now()).toBe(60_000);

    value = 'changed';
    await advance(60_000);
    expect(poller.getState()).toMatchObject({ status: 'live', lastChangeAt: Date.now() });
    expect(poller.getState().nextPollAt! - Date.now()).toBe(5_000);
    poller.stop();
  });
});

describe('poller — errors and backoff', () => {
  it('backs off 10 s → 20 s → 40 s … capped at 5 min, keeping the last good data', async () => {
    let fail = false;
    const { poller } = makePoller({
      load: vi.fn(async () => {
        if (fail) throw new Error('boom');
        return { value: 'ok' };
      }),
    });
    poller.start();
    await advance(0);
    fail = true;

    const delays: number[] = [];
    await advance(5_000);
    for (let i = 0; i < 7; i++) {
      const delay = poller.getState().nextPollAt! - Date.now();
      delays.push(delay);
      await advance(delay);
    }
    expect(delays).toEqual([10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000]);
    expect(poller.getState()).toMatchObject({
      status: 'error',
      data: { value: 'ok' },
      error: expect.objectContaining({ message: 'boom' }),
    });
    poller.stop();
  });

  it('resets the backoff after a success', async () => {
    let fail = true;
    const { poller } = makePoller({
      load: vi.fn(async () => {
        if (fail) throw new Error('boom');
        return { value: 'ok' };
      }),
    });
    poller.start();
    await advance(0);
    await advance(10_000);
    expect(poller.getState().consecutiveErrors).toBe(2);

    fail = false;
    await advance(20_000);
    expect(poller.getState()).toMatchObject({ status: 'live', consecutiveErrors: 0, error: null });
    expect(poller.getState().nextPollAt! - Date.now()).toBe(5_000);
    poller.stop();
  });

  it('reports an error with no data when the very first request fails', async () => {
    const { poller } = makePoller({ load: vi.fn(() => Promise.reject(new Error('offline'))) });
    poller.start();
    await advance(0);
    expect(poller.getState()).toMatchObject({ status: 'error', data: null });
    poller.stop();
  });
});

describe('poller — visibility', () => {
  it('does not poll while hidden, and resumes immediately when visible', async () => {
    const visibility = fakeVisibility(true);
    const { poller, load } = makePoller({ visibility: visibility.source });
    poller.start();
    await advance(60_000);
    expect(load).not.toHaveBeenCalled();
    expect(poller.getState().status).toBe('paused');

    visibility.set(false);
    await advance(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(poller.getState().status).toBe('live');
    poller.stop();
  });

  it('pauses when the page is hidden mid-session', async () => {
    const visibility = fakeVisibility(false);
    const { poller, load } = makePoller({ visibility: visibility.source });
    poller.start();
    await advance(0);
    visibility.set(true);
    expect(poller.getState()).toMatchObject({ status: 'paused', nextPollAt: null });
    await advance(60_000);
    expect(load).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('does not reschedule when a request finishes after the page was hidden', async () => {
    const visibility = fakeVisibility(false);
    const { load, pending } = controllableLoad();
    const { poller } = makePoller({ load, visibility: visibility.source });
    poller.start();
    visibility.set(true);
    pending[0]!.resolve({ value: 'late' });
    await advance(60_000);
    expect(load).toHaveBeenCalledTimes(1);
    expect(poller.getState()).toMatchObject({ status: 'paused', data: { value: 'late' } });
    poller.stop();
  });
});

describe('poller — request discipline', () => {
  it('never runs two requests at once', async () => {
    const visibility = fakeVisibility(false);
    const { load, pending } = controllableLoad();
    const { poller } = makePoller({ load, visibility: visibility.source });
    poller.start();
    // Flip visibility while the first request is still pending: must not start another.
    visibility.set(true);
    visibility.set(false);
    await advance(30_000);
    expect(load).toHaveBeenCalledTimes(1);

    pending[0]!.resolve({ value: 'a' });
    await advance(5_000);
    expect(load).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('stop() aborts the in-flight request, ignores its result, and stops polling', async () => {
    const visibility = fakeVisibility(false);
    const { load, pending } = controllableLoad();
    const { poller } = makePoller({ load, visibility: visibility.source });
    poller.start();
    poller.stop();
    expect(pending[0]!.signal.aborted).toBe(true);
    pending[0]!.resolve({ value: 'ignored' });
    await advance(60_000);
    expect(poller.getState().data).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    expect(visibility.listenerCount()).toBe(0);
  });

  it('can be restarted after stop()', async () => {
    const { poller, load } = makePoller();
    poller.start();
    await advance(0);
    poller.stop();
    poller.start();
    await advance(0);
    expect(load).toHaveBeenCalledTimes(2);
    poller.stop();
  });
});

describe('poller — refresh', () => {
  it('requests immediately, keeps the backoff count, and ignores clicks while in flight', async () => {
    let fail = true;
    const { poller, load } = makePoller({
      load: vi.fn(async () => {
        if (fail) throw new Error('offline');
        return { value: 'ok' };
      }),
    });
    poller.start();
    await advance(0);
    expect(poller.getState()).toMatchObject({ status: 'error', consecutiveErrors: 1 });

    poller.refresh();
    await advance(0);
    expect(load).toHaveBeenCalledTimes(2);
    expect(poller.getState().consecutiveErrors).toBe(2);

    fail = false;
    poller.refresh();
    await advance(0);
    expect(poller.getState()).toMatchObject({ status: 'live', consecutiveErrors: 0 });
    poller.stop();
  });

  it('does nothing when stopped or while a request is running', async () => {
    const { load, pending } = controllableLoad();
    const { poller } = makePoller({ load });
    poller.refresh();
    expect(load).not.toHaveBeenCalled();
    poller.start();
    poller.refresh();
    expect(load).toHaveBeenCalledTimes(1);
    pending[0]!.resolve({ value: 'a' });
    await advance(0);
    poller.stop();
  });
});
