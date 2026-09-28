// DEV ONLY. `?replay=<folder>[&speed=<n>][&lap=<n>]` plays a recorded session through the same
// pipeline as live data (PROJECT_BRIEF.md §6). Kept tiny and dependency-free so the replay code
// itself can be loaded lazily and never ships in a production build.

export interface ReplayOptions {
  /** Replay folder name in the project root. */
  name: string;
  /** Playback speed; recordings have one frame per ~5 s, so 10 = one frame every 0.5 s. */
  speed: number;
  /** Fast-forward to this leader lap before playing. */
  startLap: number;
}

export function readReplayOptions(search: string): ReplayOptions | null {
  const params = new URLSearchParams(search);
  const name = params.get('replay');
  if (!name) return null;
  const speed = Number(params.get('speed') ?? 10);
  const startLap = Number(params.get('lap') ?? 0);
  return {
    name,
    speed: Number.isFinite(speed) && speed > 0 ? speed : 10,
    startLap: Number.isFinite(startLap) && startLap > 0 ? startLap : 0,
  };
}

/** Real seconds between recorded frames. */
export const RECORDED_FRAME_SECONDS = 5;
