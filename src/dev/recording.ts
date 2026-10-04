// DEV ONLY. Spotter's own recording format, shared by the recorder (scripts/record.ts), the dev
// server (vite.replays.ts) and replay (replay.ts). Runs in Node and the browser, so no DOM or
// Node APIs here.
//
// A recording is a folder under recordings/ (git-ignored, third-party data):
//
//   recordings/2026-10-04 18-24 NASCAR Cup - Bank of America ROVAL 400 - Race/
//     recording.json      RecordingManifest
//     live-feed.ndjson    one {"t": <epoch ms>, "body": <response JSON>} per line, only when changed
//     live-points.ndjson
//
// Feeds are recorded raw, exactly as the network served them, so replays go through the same
// parsing as live data. A source (one per sport or timing provider) names the feeds to record
// and how replays map a requested URL back to one of them.

export const RECORDINGS_DIR = 'recordings';
export const MANIFEST_FILE = 'recording.json';
export const RECORDING_FORMAT = 'spotter-recording';

export interface RecordingManifest {
  format: typeof RECORDING_FORMAT;
  version: 1;
  /** A RecordingSource id. */
  source: string;
  title: string;
  /** Epoch ms. */
  startedAt: number;
  intervalMs: number;
  /** Feed name -> the URL it was recorded from. */
  feeds: Record<string, string>;
}

/** One recorded response: [epoch ms, parsed body]. */
export type RecordedFrame = [number, unknown];

export interface RecordingSource {
  id: string;
  /** Feed name -> URL. The first feed is the main one (titles, progress, finish). */
  feeds(options: Record<string, string>): Promise<Record<string, string>>;
  /** Which recorded feed answers a request for `url`, or null to pass it to the network. */
  feedForUrl(url: string): string | null;
  /** A human title for the session in the main feed's body. */
  title(body: unknown): string;
  /** One-line progress for the recorder's log. */
  progress(body: unknown): string;
  /** The session in the main feed's body is over. */
  isFinished(body: unknown): boolean;
}

export function isRecordingManifest(value: unknown): value is RecordingManifest {
  const m = value as Partial<RecordingManifest> | null;
  return m?.format === RECORDING_FORMAT && m.version === 1 && typeof m.feeds === 'object';
}

/** One NDJSON line. `body` is re-serialized so each line is a single line. */
export function frameLine(t: number, body: unknown): string {
  return `${JSON.stringify({ t, body })}\n`;
}

/**
 * Parses a feed's NDJSON. A recorder that was killed mid-write leaves a partial last line,
 * which is skipped.
 */
export function parseFrames(text: string): RecordedFrame[] {
  const frames: RecordedFrame[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const { t, body } = JSON.parse(line) as { t: unknown; body: unknown };
      if (typeof t === 'number') frames.push([t, body]);
    } catch {
      // Partial line.
    }
  }
  return frames.sort((a, b) => a[0] - b[0]);
}

/** "2026-10-04 18-24 <title>", safe as a folder name on every OS. */
export function recordingFolderName(startedAt: Date, title: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = startedAt;
  const stamp =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}-${pad(d.getMinutes())}`;
  const safe = title
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return safe ? `${stamp} ${safe}` : stamp;
}
