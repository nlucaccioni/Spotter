import { diffSessions, isSameSession, type RaceEvent } from './model/diff.ts';
import type { Session } from './model/types.ts';

// Keeps recent snapshots and the events derived from them (PROJECT_BRIEF.md §4: last N
// snapshots in memory, no persistence).

export interface TimedEvent {
  /** Unique, increasing. */
  id: number;
  /** Epoch ms when the snapshot revealing the event arrived. */
  at: number;
  event: RaceEvent;
}

export interface HistoryUpdate {
  /** Increases on every pushed snapshot; lets the UI restart animations. */
  updateId: number;
  /** Newest first. */
  events: TimedEvent[];
  positionChanges: Map<string, number>;
}

export interface SessionHistory {
  push(session: Session, at: number): HistoryUpdate;
  snapshots(): readonly Session[];
}

export function createSessionHistory(maxSnapshots = 20, maxEvents = 50): SessionHistory {
  let snapshots: Session[] = [];
  let events: TimedEvent[] = [];
  let nextEventId = 1;
  let updateId = 0;

  return {
    push(session, at) {
      const prev = snapshots.at(-1) ?? null;
      if (prev && !isSameSession(prev, session)) {
        snapshots = [];
        events = [];
      }
      const diff = diffSessions(prev, session);
      const fresh = diff.events.map((event) => ({ id: nextEventId++, at, event })).reverse();
      events = [...fresh, ...events].slice(0, maxEvents);
      snapshots = [...snapshots, session].slice(-maxSnapshots);
      updateId += 1;
      return { updateId, events, positionChanges: diff.positionChanges };
    },
    snapshots: () => snapshots,
  };
}
