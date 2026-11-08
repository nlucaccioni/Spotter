import { useEffect, useRef, useState } from 'react';

/**
 * Shows a card full screen: the browser's full-screen mode where it's available, otherwise the
 * card covers the page. Escape leaves either way. Attach `ref` to the card.
 */
export function useFullScreen() {
  const ref = useRef<HTMLElement>(null);
  const [overlay, setOverlay] = useState(false);
  const [native, setNative] = useState(false);

  useEffect(() => {
    const onChange = () => setNative(document.fullscreenElement === ref.current && !!ref.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (!overlay) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOverlay(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay]);

  const active = native || overlay;
  const toggle = () => {
    if (native) {
      void document.exitFullscreen();
    } else if (overlay) {
      setOverlay(false);
    } else if (ref.current?.requestFullscreen && document.fullscreenEnabled) {
      ref.current.requestFullscreen().catch(() => setOverlay(true));
    } else {
      setOverlay(true);
    }
  };
  return { ref, active, toggle };
}

/** The card class while full screen (see .analysis-card--full). */
export const FULL_SCREEN_CLASS = 'analysis-card--full';
