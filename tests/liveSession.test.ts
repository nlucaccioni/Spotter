import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  contentFingerprint,
  createLiveSessionPoller,
  LIVE_FEED_URL,
  loadLiveSnapshot,
} from '../src/data/liveSession.ts';
import { FeedError, type Fetcher } from '../src/data/sources/fetcher.ts';
import kansas from './fixtures/cup-2026-kansas-final.json';

const fetcherReturning = (value: unknown): Fetcher & { fetchJson: ReturnType<typeof vi.fn> } => ({
  fetchJson: vi.fn(async () => value),
});

afterEach(() => {
  vi.useRealTimers();
});

describe('loadLiveSnapshot', () => {
  it('fetches the live feed URL and parses it', async () => {
    const fetcher = fetcherReturning(kansas);
    const snapshot = await loadLiveSnapshot(fetcher);
    expect(fetcher.fetchJson).toHaveBeenCalledWith(LIVE_FEED_URL, {});
    expect(snapshot.session.cars).toHaveLength(36);
    expect(snapshot.issues).toEqual([]);
  });

  it('rejects with an "invalid" FeedError when the body is not a live feed', async () => {
    const error = await loadLiveSnapshot(fetcherReturning({ hello: 'world' })).catch((e) => e);
    expect(error).toBeInstanceOf(FeedError);
    expect(error.kind).toBe('invalid');
  });
});

describe('contentFingerprint', () => {
  it('ignores the self-updating timestamps', () => {
    const republished = {
      ...kansas,
      time_of_day_os: '2026-09-27T22:12:10.4385252-05:00',
      time_of_day: 79930,
    };
    expect(contentFingerprint(republished)).toBe(contentFingerprint(kansas));
  });

  it('changes when the content changes', () => {
    expect(contentFingerprint({ ...kansas, elapsed_time: 10_362 })).not.toBe(
      contentFingerprint(kansas),
    );
  });
});

describe('createLiveSessionPoller', () => {
  it('treats a checkered flag as idle and reports each snapshot', async () => {
    vi.useFakeTimers();
    const onSnapshot = vi.fn();
    const poller = createLiveSessionPoller({
      fetcher: fetcherReturning(kansas),
      onSnapshot,
      random: () => 0.5,
    });
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.getState().status).toBe('idle');
    expect(poller.getState().nextPollAt! - Date.now()).toBe(60_000);
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('stays live during a green-flag session', async () => {
    vi.useFakeTimers();
    const poller = createLiveSessionPoller({
      fetcher: fetcherReturning({ ...kansas, flag_state: 1 }),
      random: () => 0.5,
    });
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.getState().status).toBe('live');
    poller.stop();
  });
});
