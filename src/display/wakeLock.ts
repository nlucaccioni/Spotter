// Keeps the screen awake while a session is live, via the Screen Wake Lock API. Browsers
// release the lock whenever the page is hidden, so it's re-requested when the page is visible
// again. Unsupported browsers or refused requests are silently ignored.

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

export interface WakeLockApi {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

export interface VisibilityLike {
  visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface WakeLockManager {
  /** Whether the lock is wanted (e.g. session is live). */
  setWanted(wanted: boolean): void;
  isHeld(): boolean;
  dispose(): void;
}

export function createWakeLockManager(
  api: WakeLockApi | undefined,
  doc: VisibilityLike,
): WakeLockManager {
  let wanted = false;
  let sentinel: WakeLockSentinelLike | null = null;
  let requesting = false;

  async function sync() {
    if (!api) return;
    const shouldHold = wanted && doc.visibilityState === 'visible';
    if (shouldHold && !sentinel && !requesting) {
      requesting = true;
      try {
        const lock = await api.request('screen');
        lock.addEventListener('release', () => {
          if (sentinel === lock) sentinel = null;
        });
        sentinel = lock;
        // Wanted state may have changed while the request was pending.
        if (!(wanted && doc.visibilityState === 'visible')) await release();
      } catch {
        // Not allowed (e.g. battery saver) — skip silently.
      } finally {
        requesting = false;
      }
    } else if (!shouldHold && sentinel) {
      await release();
    }
  }

  async function release() {
    const lock = sentinel;
    sentinel = null;
    if (lock && !lock.released) {
      try {
        await lock.release();
      } catch {
        // Already released.
      }
    }
  }

  const onVisibility = () => void sync();
  doc.addEventListener('visibilitychange', onVisibility);

  return {
    setWanted(value) {
      wanted = value;
      void sync();
    },
    isHeld: () => sentinel !== null,
    dispose() {
      doc.removeEventListener('visibilitychange', onVisibility);
      wanted = false;
      void release();
    },
  };
}
