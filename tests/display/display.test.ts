import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdleTracker } from '../../src/display/idle.ts';
import { createWakeLockManager, type WakeLockApi } from '../../src/display/wakeLock.ts';

describe('createIdleTracker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('goes idle after the timeout and wakes on activity', () => {
    const target = new EventTarget();
    const onChange = vi.fn();
    const tracker = createIdleTracker(target, onChange, 3000);

    vi.advanceTimersByTime(2999);
    expect(tracker.isIdle()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(tracker.isIdle()).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(true);

    target.dispatchEvent(new Event('pointermove'));
    expect(tracker.isIdle()).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(false);

    // Activity keeps pushing the timeout back.
    vi.advanceTimersByTime(2000);
    target.dispatchEvent(new Event('keydown'));
    vi.advanceTimersByTime(2000);
    expect(tracker.isIdle()).toBe(false);
    tracker.dispose();
  });

  it('stops listening after dispose', () => {
    const target = new EventTarget();
    const onChange = vi.fn();
    createIdleTracker(target, onChange, 3000).dispose();
    vi.advanceTimersByTime(10_000);
    target.dispatchEvent(new Event('pointermove'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

function fakeDocument(state: DocumentVisibilityState = 'visible') {
  const target = new EventTarget();
  const doc = {
    visibilityState: state,
    addEventListener: (type: string, fn: () => void) => target.addEventListener(type, fn),
    removeEventListener: (type: string, fn: () => void) => target.removeEventListener(type, fn),
    setVisibility(value: DocumentVisibilityState) {
      doc.visibilityState = value;
      target.dispatchEvent(new Event('visibilitychange'));
    },
  };
  return doc;
}

function fakeWakeLock() {
  const sentinels: { released: boolean; release: () => Promise<void>; fire: () => void }[] = [];
  const api: WakeLockApi = {
    request: vi.fn(async () => {
      const handlers: (() => void)[] = [];
      const sentinel = {
        released: false,
        async release() {
          sentinel.released = true;
          handlers.forEach((h) => h());
        },
        addEventListener: (_: 'release', h: () => void) => void handlers.push(h),
        fire: () => {
          sentinel.released = true;
          handlers.forEach((h) => h());
        },
      };
      sentinels.push(sentinel);
      return sentinel;
    }),
  };
  return { api, sentinels };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createWakeLockManager', () => {
  it('holds the lock only while wanted and visible, and re-acquires after the page returns', async () => {
    const { api, sentinels } = fakeWakeLock();
    const doc = fakeDocument();
    const manager = createWakeLockManager(api, doc);

    manager.setWanted(true);
    await flush();
    expect(manager.isHeld()).toBe(true);

    // The browser releases the lock when the page is hidden.
    doc.setVisibility('hidden');
    sentinels[0]!.fire();
    await flush();
    expect(manager.isHeld()).toBe(false);

    doc.setVisibility('visible');
    await flush();
    expect(api.request).toHaveBeenCalledTimes(2);
    expect(manager.isHeld()).toBe(true);

    manager.setWanted(false);
    await flush();
    expect(manager.isHeld()).toBe(false);
    expect(sentinels[1]!.released).toBe(true);
    manager.dispose();
  });

  it('does nothing when the API is missing or the request is refused', async () => {
    const doc = fakeDocument();
    const unsupported = createWakeLockManager(undefined, doc);
    unsupported.setWanted(true);
    await flush();
    expect(unsupported.isHeld()).toBe(false);

    const refused = createWakeLockManager(
      { request: () => Promise.reject(new Error('NotAllowedError')) },
      doc,
    );
    refused.setWanted(true);
    await flush();
    expect(refused.isHeld()).toBe(false);
  });

  it('releases a lock that arrives after it stopped being wanted', async () => {
    const { api, sentinels } = fakeWakeLock();
    const manager = createWakeLockManager(api, fakeDocument());
    manager.setWanted(true);
    manager.setWanted(false);
    await flush();
    expect(sentinels[0]!.released).toBe(true);
    expect(manager.isHeld()).toBe(false);
  });
});
