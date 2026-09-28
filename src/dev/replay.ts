// DEV ONLY. A Fetcher that plays a Timing71 recording served by vite.replays.ts. Each call
// returns the next frame converted to NASCAR live-feed JSON, then holds on the last one.
// Loaded with a dynamic import from the dev-only branch, so it never ships in a build.

import { FeedError, type Fetcher } from '../data/sources/fetcher.ts';
import type { ReplayOptions } from './replayParams.ts';
import { Timing71Converter, type Timing71Frame, type Timing71Manifest } from './timing71.ts';

interface Recording {
  manifest: Timing71Manifest;
  frames: [number, Timing71Frame][];
}

export function createReplayFetcher(options: ReplayOptions): Fetcher {
  let loading: Promise<void> | null = null;
  let recording: Recording | null = null;
  let converter: Timing71Converter | null = null;
  let index = 0;
  let last: Record<string, unknown> | null = null;

  async function load() {
    const response = await fetch(`/__replays/${encodeURIComponent(options.name)}`);
    if (!response.ok) {
      const available = await fetch('/__replays').then((r) => r.json() as Promise<string[]>);
      throw new FeedError(
        'http',
        `Replay "${options.name}" not found. Available: ${available.join(', ') || 'none'}`,
        response.status,
      );
    }
    recording = (await response.json()) as Recording;
    converter = new Timing71Converter(recording.manifest);

    // Fast-forward to the requested lap.
    while (options.startLap > 0 && index < recording.frames.length) {
      const [ts, frame] = recording.frames[index++]!;
      last = converter.push(frame, ts);
      if (Number(last.lap_number) >= options.startLap) break;
    }
    console.info(
      `[replay] ${recording.manifest.name} — ${recording.manifest.description}: ` +
        `${recording.frames.length} frames at ${options.speed}×` +
        (options.startLap ? `, from lap ${options.startLap}` : ''),
    );
  }

  return {
    async fetchJson() {
      loading ??= load();
      await loading;
      if (recording && converter && index < recording.frames.length) {
        const [ts, frame] = recording.frames[index++]!;
        last = converter.push(frame, ts);
      }
      if (!last) throw new FeedError('invalid', 'Replay has no frames');
      return last;
    },
  };
}
