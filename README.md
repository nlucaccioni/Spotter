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
```

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
