// DEV ONLY. A Fetcher that plays a recorded session served by vite.replays.ts. Playback follows a
// clock running at `speed`× from the first request: each request gets the latest frame recorded
// at or before that moment, then the last frame once the recording ends. All feeds share the
// clock, so the board and the points page stay in step. Requests for feeds the recording doesn't
// have go to the network. Loaded with a dynamic import from the dev-only branch, so it never
// ships in a build.

import { FeedError, type Fetcher } from '../data/sources/fetcher.ts';
import type { RecordedFrame, RecordingManifest } from './recording.ts';
import type { ReplayOptions } from './replayParams.ts';
import { SOURCES } from './sources/index.ts';
import { Timing71Converter, type Timing71Frame, type Timing71Manifest } from './timing71.ts';

export type ReplayPayload =
  | { kind: 'recording'; manifest: RecordingManifest; feeds: Record<string, RecordedFrame[]> }
  | { kind: 'timing71'; manifest: Timing71Manifest; frames: [number, Timing71Frame][] };

/** One feed's frames, played forward only (Timing71 frames must be converted in order). */
class Track {
  private next = 0;
  private current: unknown = undefined;

  constructor(
    private readonly frames: RecordedFrame[],
    private readonly convert: (raw: unknown, t: number) => unknown = (raw) => raw,
  ) {}

  get start(): number | undefined {
    return this.frames[0]?.[0];
  }

  get done(): boolean {
    return this.next >= this.frames.length;
  }

  /** The latest frame at or before `t` (undefined before the first one). */
  advanceTo(t: number): unknown {
    while (!this.done && this.frames[this.next]![0] <= t) this.step();
    return this.current;
  }

  /** Plays one more frame; returns it with its time. */
  step(): { t: number; value: unknown } {
    const [t, raw] = this.frames[this.next++]!;
    this.current = this.convert(raw, t);
    return { t, value: this.current };
  }
}

export interface ReplayPlayer {
  label: string;
  /** The feed for `url` at `atMs` wall-clock time, or `missing` when it isn't recorded. */
  frameFor(url: string, atMs: number): unknown;
}

export const missing = Symbol('missing');

export function createReplayPlayer(
  payload: ReplayPayload,
  options: ReplayOptions,
  startedAtMs: number,
): ReplayPlayer {
  let tracks: Record<string, Track>;
  let feedForUrl: (url: string) => string | null;
  let label: string;
  let mainFeed: string;

  if (payload.kind === 'timing71') {
    const converter = new Timing71Converter(payload.manifest);
    // Timing71 stamps frames in epoch seconds.
    const frames = payload.frames.map(([s, frame]): RecordedFrame => [s * 1000, frame]);
    tracks = {
      'live-feed': new Track(frames, (raw, t) => converter.push(raw as Timing71Frame, t / 1000)),
    };
    feedForUrl = SOURCES.nascar!.feedForUrl;
    label = `${payload.manifest.name} — ${payload.manifest.description}`;
    mainFeed = 'live-feed';
  } else {
    const source = SOURCES[payload.manifest.source];
    tracks = Object.fromEntries(
      Object.entries(payload.feeds).map(([name, frames]) => [name, new Track(frames)]),
    );
    feedForUrl = source?.feedForUrl ?? ((url) => (url in tracks ? url : null));
    label = payload.manifest.title;
    mainFeed = Object.keys(payload.manifest.feeds)[0]!;
  }

  const main = tracks[mainFeed];
  let recordedStart = main?.start ?? 0;

  // Fast-forward to the requested lap.
  if (main && options.startLap > 0) {
    while (!main.done) {
      const { t, value } = main.step();
      recordedStart = t;
      if (Number((value as { lap_number?: unknown }).lap_number) >= options.startLap) break;
    }
  }

  return {
    label,
    frameFor(url, atMs) {
      const name = feedForUrl(url);
      const track = name === null ? undefined : tracks[name];
      if (!track) return missing;
      return track.advanceTo(recordedStart + (atMs - startedAtMs) * options.speed);
    },
  };
}

export function createReplayFetcher(options: ReplayOptions, network: Fetcher): Fetcher {
  let loading: Promise<ReplayPlayer> | null = null;

  async function load(): Promise<ReplayPlayer> {
    const response = await fetch(`/__replays/${encodeURIComponent(options.name)}`);
    if (!response.ok) {
      const available = await fetch('/__replays').then((r) => r.json() as Promise<string[]>);
      throw new FeedError(
        'http',
        `Replay "${options.name}" not found. Available: ${available.join(', ') || 'none'}`,
        response.status,
      );
    }
    const player = createReplayPlayer(
      (await response.json()) as ReplayPayload,
      options,
      Date.now(),
    );
    console.info(
      `[replay] ${player.label} at ${options.speed}×` +
        (options.startLap ? `, from lap ${options.startLap}` : ''),
    );
    return player;
  }

  return {
    async fetchJson(url, fetchOptions) {
      loading ??= load();
      const frame = (await loading).frameFor(url, Date.now());
      if (frame === missing) return network.fetchJson(url, fetchOptions);
      // Like a feed that isn't live yet.
      if (frame === undefined) throw new FeedError('http', 'Not recorded yet', 403);
      return frame;
    },
  };
}
