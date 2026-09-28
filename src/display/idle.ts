// Reports when the pointer has been still for a while, so the cursor and on-screen controls can
// be hidden on the dedicated display (PROJECT_BRIEF.md §5.1 "Display mode").

const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

export interface IdleTracker {
  isIdle(): boolean;
  dispose(): void;
}

export function createIdleTracker(
  target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
  onChange: (idle: boolean) => void,
  timeoutMs = 3000,
): IdleTracker {
  let idle = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const set = (value: boolean) => {
    if (value === idle) return;
    idle = value;
    onChange(idle);
  };

  const arm = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => set(true), timeoutMs);
  };

  const onActivity = () => {
    set(false);
    arm();
  };

  for (const type of ACTIVITY_EVENTS) target.addEventListener(type, onActivity, { passive: true });
  arm();

  return {
    isIdle: () => idle,
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      for (const type of ACTIVITY_EVENTS) target.removeEventListener(type, onActivity);
    },
  };
}
