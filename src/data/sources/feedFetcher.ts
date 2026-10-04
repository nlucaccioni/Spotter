import { readReplayOptions, type ReplayOptions } from '../../dev/replayParams.ts';
import { createBrowserFetcher } from './browserFetcher.ts';
import type { Fetcher } from './fetcher.ts';

// The fetcher for timing feeds. Dev builds only: `?replay=<folder>` swaps in a recorded session,
// shared by every feed so they all play on the same clock.

export const replay: ReplayOptions | null = import.meta.env.DEV
  ? readReplayOptions(globalThis.location?.search ?? '')
  : null;

let replayFetcher: Promise<Fetcher> | null = null;

export function createFeedFetcher(timeoutMs?: number): Fetcher {
  const network = createBrowserFetcher(timeoutMs);
  if (!replay) return network;
  const options = replay;
  return {
    async fetchJson(url, fetchOptions) {
      replayFetcher ??= import('../../dev/replay.ts').then((m) =>
        m.createReplayFetcher(options, network),
      );
      return (await replayFetcher).fetchJson(url, fetchOptions);
    },
  };
}
