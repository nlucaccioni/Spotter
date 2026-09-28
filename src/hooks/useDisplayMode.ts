import { useCallback, useEffect, useRef, useState } from 'react';
import { createIdleTracker } from '../display/idle.ts';
import {
  createWakeLockManager,
  type WakeLockApi,
  type WakeLockManager,
} from '../display/wakeLock.ts';

/**
 * Display-mode behaviour for the dedicated screen: idle detection (to hide the cursor and
 * controls), fullscreen state, and a screen wake lock while `keepAwake` is true.
 */
export function useDisplayMode(keepAwake: boolean) {
  const [idle, setIdle] = useState(false);
  const [fullscreen, setFullscreen] = useState(() => document.fullscreenElement !== null);

  useEffect(() => {
    const tracker = createIdleTracker(window, setIdle);
    return () => tracker.dispose();
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Created per effect run so StrictMode's mount/unmount/mount doesn't reuse a disposed manager.
  const wakeLock = useRef<WakeLockManager | null>(null);
  useEffect(() => {
    const manager = createWakeLockManager(
      (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock,
      document,
    );
    wakeLock.current = manager;
    return () => {
      manager.dispose();
      wakeLock.current = null;
    };
  }, []);
  useEffect(() => wakeLock.current?.setWanted(keepAwake), [keepAwake]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  return {
    idle,
    fullscreen,
    canFullscreen: document.fullscreenEnabled === true,
    toggleFullscreen,
  };
}
