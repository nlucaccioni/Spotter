// DEV ONLY. Records live feeds for later replay (`?replay=<folder>`, see README).
//
//   npm run record                         NASCAR's featured session
//   npm run record -- --series 1           a series' current race (source option)
//   npm run record -- --out "<folder>"     append to an existing recording (e.g. after a crash)
//
// Options: --source <id> (default nascar), --interval <seconds> (default 5),
// --after-finish <minutes> to keep going after the finish (default 5; post-race data is useful
// too), --feed <name>=<url> to add or replace a feed. Anything else goes to the source.
// Stop any time with Ctrl+C; every frame is already on disk.
//
// Recordings are third-party data: they go in recordings/, which is git-ignored.

import fs from 'node:fs';
import path from 'node:path';
import {
  frameLine,
  isRecordingManifest,
  MANIFEST_FILE,
  parseFrames,
  RECORDING_FORMAT,
  recordingFolderName,
  RECORDINGS_DIR,
  type RecordingManifest,
} from '../src/dev/recording.ts';
import { SOURCES } from '../src/dev/sources/index.ts';

function parseArgs(argv: string[]) {
  const options: Record<string, string> = {};
  const feeds: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]!.replace(/^--/, '');
    const value = argv[i + 1];
    if (!argv[i]!.startsWith('--') || value === undefined) {
      throw new Error(`Expected --<option> <value>, got "${argv.slice(i).join(' ')}"`);
    }
    i++;
    if (key === 'feed') {
      const [name, ...url] = value.split('=');
      feeds[name!] = url.join('=');
    } else {
      options[key] = value;
    }
  }
  return { options, feeds };
}

const time = () => new Date().toTimeString().slice(0, 8);

async function main() {
  const { options, feeds: extraFeeds } = parseArgs(process.argv.slice(2));
  const source = SOURCES[options.source ?? 'nascar'];
  if (!source) throw new Error(`Unknown --source; known: ${Object.keys(SOURCES).join(', ')}`);
  const intervalMs = Number(options.interval ?? 5) * 1000;
  const afterFinishMs = Number(options['after-finish'] ?? 5) * 60_000;

  let dir: string | null = null;
  let manifest: RecordingManifest;
  const last = new Map<string, string>();

  if (options.out) {
    dir = path.resolve(RECORDINGS_DIR, options.out);
    const existing: unknown = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST_FILE), 'utf8'));
    if (!isRecordingManifest(existing)) throw new Error(`${dir} is not a recording`);
    manifest = existing;
    // Skip frames identical to what's already recorded.
    for (const name of Object.keys(manifest.feeds)) {
      const file = path.join(dir, `${name}.ndjson`);
      const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      // A crash can leave a partial last line; start new frames on a line of their own.
      if (text && !text.endsWith('\n')) fs.appendFileSync(file, '\n');
      const body = parseFrames(text).at(-1)?.[1];
      if (body !== undefined) last.set(name, JSON.stringify(body));
    }
    console.log(`Appending to ${dir}`);
  } else {
    manifest = {
      format: RECORDING_FORMAT,
      version: 1,
      source: source.id,
      title: '',
      startedAt: Date.now(),
      intervalMs,
      feeds: { ...(await source.feeds(options)), ...extraFeeds },
    };
  }

  const feedNames = Object.keys(manifest.feeds);
  const mainFeed = feedNames[0]!;
  for (const name of feedNames) console.log(`  ${name}: ${manifest.feeds[name]}`);

  const errors = new Map<string, string>();
  let frames = 0;
  let finishAt: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function poll(name: string): Promise<unknown> {
    try {
      const response = await fetch(manifest.feeds[name]!, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body: unknown = await response.json();
      if (errors.delete(name)) console.log(`${time()}  ${name}: recovered`);
      return body;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Log each new problem once, not every poll (e.g. 403 until a session starts).
      if (errors.get(name) !== message) console.log(`${time()}  ${name}: ${message}`);
      errors.set(name, message);
      return undefined;
    }
  }

  async function tick() {
    const now = Date.now();
    for (const name of feedNames) {
      const body = await poll(name);
      if (body === undefined) continue;

      // The folder is named after the session, so it's created on the first good response.
      if (!dir) {
        if (name !== mainFeed) continue;
        manifest.title = source!.title(body);
        dir = path.resolve(RECORDINGS_DIR, recordingFolderName(new Date(now), manifest.title));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
        console.log(`Recording to ${dir}`);
      }

      const text = JSON.stringify(body);
      if (text === last.get(name)) continue;
      last.set(name, text);
      fs.appendFileSync(path.join(dir, `${name}.ndjson`), frameLine(now, body));

      if (name === mainFeed) {
        console.log(`${time()}  #${++frames}  ${source!.progress(body)}`);
        if (finishAt === null && source!.isFinished(body)) {
          finishAt = now + afterFinishMs;
          console.log(`Finished; recording ${afterFinishMs / 60_000} more minutes.`);
        }
      }
    }
    if (finishAt !== null && Date.now() >= finishAt) stop();
    else timer = setTimeout(tick, Math.max(0, now + intervalMs - Date.now()));
  }

  function stop() {
    clearTimeout(timer);
    console.log(`\nStopped after ${frames} new ${mainFeed} frames.`);
    if (dir) console.log(`Replay: ?replay=${encodeURIComponent(path.basename(dir))}`);
    process.exit(0);
  }

  process.on('SIGINT', stop);
  await tick();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
