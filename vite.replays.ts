import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import {
  isRecordingManifest,
  MANIFEST_FILE,
  parseFrames,
  RECORDINGS_DIR,
} from './src/dev/recording.ts';

// DEV ONLY (`apply: 'serve'`, never part of a build). Serves recorded sessions for `?replay=`:
//
// - Spotter recordings (`npm run record`) in recordings/, see src/dev/recording.ts.
// - Timing71 replay downloads in the project root, e.g.
//   "2026-09-27 19-07 NASCAR Cup Series - Hollywood Casino 400 - Race/".
//
// Both are third-party data: they are git-ignored and never committed.
//
//   GET /__replays          -> ["<folder name>", ...]
//   GET /__replays/<folder> -> ReplayPayload (src/dev/replay.ts)

const FRAME_FILE = /^(\d+)(i?)\.json$/;

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function isTiming71Dir(dir: string): boolean {
  const manifest = readJson(path.join(dir, 'manifest.json')) as { colSpec?: unknown } | null;
  return Array.isArray(manifest?.colSpec);
}

const isRecordingDir = (dir: string) =>
  isRecordingManifest(readJson(path.join(dir, MANIFEST_FILE)));

function subfolders(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

function loadRecording(dir: string) {
  const manifest = readJson(path.join(dir, MANIFEST_FILE)) as { feeds: Record<string, string> };
  const feeds = Object.fromEntries(
    Object.keys(manifest.feeds).map((name) => {
      const file = path.join(dir, `${name}.ndjson`);
      return [name, fs.existsSync(file) ? parseFrames(fs.readFileSync(file, 'utf8')) : []];
    }),
  );
  return { kind: 'recording', manifest, feeds };
}

function loadTiming71(dir: string) {
  const manifest = readJson(path.join(dir, 'manifest.json'));
  const frames = fs
    .readdirSync(dir)
    .map((file) => ({ file, match: FRAME_FILE.exec(file) }))
    .filter((f) => f.match)
    .sort((a, b) => Number(a.match![1]) - Number(b.match![1]))
    .map(({ file, match }) => [Number(match![1]), readJson(path.join(dir, file))]);
  return { kind: 'timing71', manifest, frames };
}

export function devReplays(root: string = process.cwd()): Plugin {
  const recordings = path.resolve(root, RECORDINGS_DIR);
  return {
    name: 'spotter-dev-replays',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__replays', (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };

        const name = decodeURIComponent((req.url ?? '/').split('?')[0]!.replace(/^\/+/, ''));
        if (!name) {
          send(200, [
            ...subfolders(recordings).filter((n) => isRecordingDir(path.join(recordings, n))),
            ...subfolders(root).filter((n) => isTiming71Dir(path.join(root, n))),
          ]);
          return;
        }

        // Only direct children of recordings/ or the project root; no path tricks.
        const recording = path.resolve(recordings, name);
        const timing71 = path.resolve(root, name);
        if (path.dirname(recording) === recordings && isRecordingDir(recording)) {
          send(200, loadRecording(recording));
        } else if (path.dirname(timing71) === path.resolve(root) && isTiming71Dir(timing71)) {
          send(200, loadTiming71(timing71));
        } else {
          send(404, { error: `No replay folder named "${name}"` });
        }
      });
    },
  };
}
