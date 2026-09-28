import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

// DEV ONLY (`apply: 'serve'`, never part of a build). Serves Timing71 replay downloads that sit
// in the project root, e.g. "2026-09-27 19-07 NASCAR Cup Series - Hollywood Casino 400 - Race/".
// Those folders are third-party data: they are git-ignored locally and never committed.
//
//   GET /__replays          -> ["<folder name>", ...]
//   GET /__replays/<folder> -> { manifest, frames: [[epochSeconds, frame], ...] }

const FRAME_FILE = /^(\d+)(i?)\.json$/;

function isReplayDir(dir: string): boolean {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    return Array.isArray(manifest.colSpec);
  } catch {
    return false;
  }
}

export function devReplays(root: string = process.cwd()): Plugin {
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
          const names = fs
            .readdirSync(root, { withFileTypes: true })
            .filter((e) => e.isDirectory() && isReplayDir(path.join(root, e.name)))
            .map((e) => e.name);
          send(200, names);
          return;
        }

        // Only direct children of the project root; no path tricks.
        const dir = path.resolve(root, name);
        if (path.dirname(dir) !== path.resolve(root) || !isReplayDir(dir)) {
          send(404, { error: `No replay folder named "${name}"` });
          return;
        }

        const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
        const frames = fs
          .readdirSync(dir)
          .map((file) => ({ file, match: FRAME_FILE.exec(file) }))
          .filter((f) => f.match)
          .sort((a, b) => Number(a.match![1]) - Number(b.match![1]))
          .map(({ file, match }) => [
            Number(match![1]),
            JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')),
          ]);
        send(200, { manifest, frames });
      });
    },
  };
}
