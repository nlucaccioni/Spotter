import type { Flag, FlagKind } from './types.ts';

// `flag_state` codes. 1 and 9 are confirmed; 2, 3, 4 are believed (see docs/feed-notes.md).
// Colours live in CSS as --flag-<kind>, so this module only maps code -> kind + label.
const KNOWN_FLAGS: Record<number, { kind: FlagKind; label: string }> = {
  1: { kind: 'green', label: 'Green' },
  2: { kind: 'yellow', label: 'Caution' },
  3: { kind: 'red', label: 'Red flag' },
  4: { kind: 'white', label: 'White flag' },
  9: { kind: 'checkered', label: 'Checkered' },
};

export function flagFromCode(code: number | null): Flag {
  const known = code === null ? undefined : KNOWN_FLAGS[code];
  if (known) return { code, ...known };
  return { code, kind: 'unknown', label: code === null ? 'Unknown' : `Unknown (${code})` };
}
