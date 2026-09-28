import { describe, expect, it } from 'vitest';
import { parseLiveFeed } from '../src/data/feeds/liveFeed.parse.ts';
import type { Session } from '../src/data/model/types.ts';
import { createSessionHistory } from '../src/data/sessionHistory.ts';
import kansas from './fixtures/cup-2026-kansas-final.json';

function session(flag: number, raceId = 5628): Session {
  const result = parseLiveFeed({ ...structuredClone(kansas), flag_state: flag, race_id: raceId });
  if (!result.ok) throw new Error(result.error);
  return result.session;
}

describe('createSessionHistory', () => {
  it('accumulates events newest first and counts updates', () => {
    const history = createSessionHistory();
    expect(history.push(session(1), 1000).events).toEqual([]);
    history.push(session(2), 2000);
    const update = history.push(session(1), 3000);
    expect(update.updateId).toBe(3);
    expect(update.events.map((e) => [e.at, e.event.kind === 'flag' && e.event.flag.kind])).toEqual([
      [3000, 'green'],
      [2000, 'yellow'],
    ]);
    expect(update.events[0]!.id).toBeGreaterThan(update.events[1]!.id);
  });

  it('caps snapshots and events', () => {
    const history = createSessionHistory(3, 4);
    let update;
    for (let i = 0; i < 10; i++) update = history.push(session(i % 2 ? 2 : 1), i);
    expect(history.snapshots()).toHaveLength(3);
    expect(update!.events).toHaveLength(4);
  });

  it('starts over when a different session begins', () => {
    const history = createSessionHistory();
    history.push(session(1), 1);
    history.push(session(2), 2);
    const update = history.push(session(1, 9999), 3);
    expect(update.events).toEqual([]);
    expect(history.snapshots()).toHaveLength(1);
  });
});
