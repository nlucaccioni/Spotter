import { useState } from 'react';

// Which drivers the charts colour in. Each picked driver holds a colour slot until removed, so
// adding or removing someone never repaints the others. The picker doubles as the legend.

export const MAX_PICKED = 8;

export const seriesColor = (slot: number) => `var(--series-${slot + 1})`;

export interface Pickable {
  id: string;
  label: string;
}

type Slots = readonly (string | null)[];

function fill(ids: readonly string[]): Slots {
  const slots: (string | null)[] = new Array<string | null>(MAX_PICKED).fill(null);
  ids.slice(0, MAX_PICKED).forEach((id, i) => (slots[i] = id));
  return slots;
}

/**
 * Picked drivers by colour slot. Starts from `defaults` and starts over from them whenever
 * `resetKey` changes (another series or race).
 */
export function usePicked(defaults: readonly string[], resetKey: string) {
  const [state, setState] = useState<{ key: string; slots: Slots } | null>(null);
  const slots = state?.key === resetKey ? state.slots : fill(defaults);
  const set = (next: Slots) => setState({ key: resetKey, slots: next });
  return {
    slots,
    slotOf: (id: string) => {
      const slot = slots.indexOf(id);
      return slot < 0 ? null : slot;
    },
    add: (id: string) => {
      const free = slots.indexOf(null);
      if (free < 0 || slots.includes(id)) return;
      set(slots.map((s, i) => (i === free ? id : s)));
    },
    remove: (id: string) => set(slots.map((s) => (s === id ? null : s))),
    /** Back to the default picks. */
    reset: () => set(fill(defaults)),
    /** No one highlighted. */
    clear: () => set(fill([])),
  };
}
