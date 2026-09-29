// TV delay: holds snapshots until they are `delay` old, so the board lines up with a delayed
// broadcast. Polling isn't slowed down; only what's shown is held back.

export interface Timed<T> {
  value: T;
  /** Epoch ms when the snapshot was received. */
  at: number;
}

export interface DelayBuffer<T> {
  push(value: T, at: number): void;
  /**
   * The newest snapshot received at or before `now - delayMs`, or null if none is due yet.
   * Everything up to and including it is removed from the buffer.
   */
  release(now: number, delayMs: number): Timed<T> | null;
  /** When the next held snapshot becomes due, or null if nothing is held. */
  nextDueAt(delayMs: number): number | null;
  size(): number;
}

/** @param max cap on held snapshots (at 5 s polling, 400 covers a 30+ minute delay) */
export function createDelayBuffer<T>(max = 400): DelayBuffer<T> {
  let items: Timed<T>[] = [];

  return {
    push(value, at) {
      items.push({ value, at });
      if (items.length > max) items = items.slice(-max);
    },
    release(now, delayMs) {
      const cutoff = now - delayMs;
      let index = -1;
      for (let i = 0; i < items.length && items[i]!.at <= cutoff; i++) index = i;
      if (index < 0) return null;
      const due = items[index]!;
      items = items.slice(index + 1);
      return due;
    },
    nextDueAt(delayMs) {
      const first = items[0];
      return first ? first.at + delayMs : null;
    },
    size: () => items.length,
  };
}
