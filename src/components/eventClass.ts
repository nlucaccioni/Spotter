import type { RaceEvent } from '../data/model/diff.ts';

/** Colour classes for an event: by kind, and flags by the flag they show. */
export function eventClass(event: RaceEvent): string {
  const kind = `ticker__item--${event.kind}`;
  return event.kind === 'flag' ? `${kind} ticker__item--flag-${event.flag.kind}` : kind;
}
