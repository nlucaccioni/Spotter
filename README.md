# Spotter

An unofficial, browser-based live timing board for NASCAR sessions, built to sit on a second
(portrait) screen next to the TV. Inspired by Timing71.

It is a purely static site: each viewer's browser fetches NASCAR's public CDN feed directly.
There is no backend. See [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) for scope and architecture, and
[`docs/feed-notes.md`](docs/feed-notes.md) for confirmed feed behaviour.

> Unofficial fan project. Not affiliated with or endorsed by NASCAR. Data © NASCAR.

## Development

Requires Node 24 (see `.nvmrc`) and npm.

```sh
npm install
npm run dev          # local dev server
npm test             # unit tests (Vitest)
npm run lint         # ESLint
npm run format       # Prettier (write); format:check to verify
npm run build        # type-check + production build into dist/
npm run preview      # serve the production build locally
npm run record       # record live feeds for replay (dev only, see below)
```

### Recording a live session (dev only)

While a session is live, run:

```sh
npm run record                 # whatever NASCAR is featuring (live-feed + live-points)
npm run record -- --series 1   # a series' current race (1 Cup, 2 O'Reilly, 3 Truck)
```

It polls every 5 s and saves each changed response to `recordings/<date> <time> <title>/`
(git-ignored). It stops 5 minutes after the checkered flag (`--after-finish <minutes>`), or press
Ctrl+C at any time; every frame is already on disk. To continue an interrupted recording, pass
`--out "<folder name>"`. Other options: `--interval <seconds>`, `--feed <name>=<url>`.

The format is described in `src/dev/recording.ts`. Each sport or timing provider is a source in
`src/dev/sources/`, which lists the feeds to record and maps feed URLs back to them for replay.
Supporting another series means adding a source.

### Replaying a recorded race (dev only)

Replays play a recording from `npm run record` or a Timing71 session download. For Timing71,
drop the unzipped folder (named like
`2026-09-27 19-07 NASCAR Cup Series - Hollywood Casino 400 - Race`) into the project root.
Then run `npm run dev` and open:

```
http://localhost:5173/?replay=<folder name>&speed=10&lap=200
```

- `speed`: playback speed (default 10×). Playback follows the recorded timestamps; the board and
  the points page share one clock.
- `lap`: fast-forward to this leader lap first.
- `http://localhost:5173/__replays` lists the folders the dev server can see.

Recordings and Timing71 folders are third-party data and must never be committed.
`recordings/` is in `.gitignore`. Add Timing71 folders to your local `.git/info/exclude` (not
`.gitignore`), for example:

```
/20[0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]-[0-9][0-9] */
```

The replay code is only reachable from dev builds and is not included in production bundles.

## Deployment

Every push to `main` runs lint, format check, tests and build, then deploys `dist/` to GitHub
Pages via GitHub Actions (`.github/workflows/deploy.yml`). Pull requests run the same checks
without deploying.

One-time setup (owner):

- Repo **Settings → Pages**: set **Source** to **GitHub Actions**. The site is then served at
  `https://<github-username>.github.io/<repo>/`.

Later, to use a custom subdomain: enter it under **Settings → Pages → Custom domain**, add a DNS
`CNAME` record pointing it to `<github-username>.github.io`, and enable **Enforce HTTPS** once
the certificate is issued. No code change is needed; asset paths are relative (`base: './'`).

## License

[MIT](LICENSE)
