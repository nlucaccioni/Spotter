# NASCAR Live Timing — Project Brief

A browser-based live timing board for NASCAR races, meant to sit on a second screen while watching a race. Inspired by Timing71. It's a static React site hosted on GitHub Pages (project URL for now, custom subdomain later), with a Windows/Mac desktop wrapper (Tauri) planned later.

This document is the source of truth for scope and architecture. Read it fully before starting, and keep it updated as decisions change.

---

## 1. Goals and non-goals

**Goals (v1)**

- Live timing board for the current NASCAR session, updating every few seconds.
- Works as a purely static site: no backend and no server of our own. Each viewer's browser fetches directly from NASCAR's public CDN.
- Clean, dense, readable in dark mode by default (people use it next to a TV).
- **Designed first for a portrait (vertical) monitor** so the whole field is visible at once. See §5.1. Landscape and smaller screens are supported, but secondary.
- Polite to NASCAR's CDN: modest polling, conditional requests, backoff, and pausing when the tab is hidden.

**Later (not v1)**

- Lap-by-lap charts, gap charts, pit strategy views (from `lap-times.json` / racing-insights feeds).
- Season schedule, points standings, past race results.
- Tauri desktop build (Windows/Mac) reusing the same frontend.
- A user-configurable "TV delay" so the board lines up with a delayed broadcast.

**Non-goals**

- No backend, database, user accounts, or analytics.
- No proxying or re-hosting NASCAR data. Browsers fetch it directly.
- No NASCAR logos, official marks, or team/car imagery hosted by us.

---

## 2. Tech stack

- **Vite + React + TypeScript** (strict mode).
- **State:** React state + a small custom hook for polling. No Redux. Add a lightweight store (e.g. Zustand) only if it clearly earns its place.
- **Validation:** `zod` schemas for every external feed. The feeds are undocumented and can change without notice, so parse defensively and never crash on a missing field.
- **Styling:** plain CSS or CSS modules with CSS variables for theming. No heavy UI kit. Tailwind is acceptable if preferred, but keep it simple.
- **Testing:** Vitest for the pure data layer (parsing, diffing, gap math). Test against recorded fixtures, not the live network.
- **Lint/format:** ESLint + Prettier.
- **Package manager:** npm.

**Decided in milestone 1 (2026-09-27):** Vite 8, React 19, TypeScript 6 (strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`), Vitest 5, ESLint 9 flat config + typescript-eslint, Prettier 3. Node 24 (`.nvmrc`). Plain CSS with CSS variables; dark theme default via `<html data-theme>`. Fonts: Geist Sans for all sans-serif text and Geist Mono for all monospaced (timing) text, self-hosted via `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` (SIL OFL 1.1; no third-party font requests).

---

## 3. Data sources

All data comes from NASCAR's public CDN at `cf.nascar.com`. It's undocumented, unofficial, and could change or be locked down at any time. There are no API keys.

### 3.1 Verified: live feed

`https://cf.nascar.com/live/feeds/live-feed.json`

**CORS has been verified.** A `fetch()` from a third-party origin (example.com) succeeded in the browser. This is the foundation of the static-site approach.

The feed always reflects whatever single session NASCAR currently has live (any series). Between sessions it keeps serving the last session's final state.

**Top-level fields (observed):**

| Field                                                  | Notes                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| `lap_number`, `laps_in_race`, `laps_to_go`             | Race progress                                                       |
| `elapsed_time`                                         | Seconds since session start                                         |
| `flag_state`                                           | Numeric. See §3.4                                                   |
| `race_id`, `run_id`, `run_name`                        | e.g. `run_name: "Hollywood Casino 400"`                             |
| `series_id`                                            | 1 = Cup, 2 = O'Reilly Auto Parts Series, 3 = Craftsman Truck Series |
| `run_type`                                             | 3 observed for a race. Others (practice/qualifying) to confirm      |
| `track_id`, `track_name`, `track_length`               | Length in miles                                                     |
| `time_of_day_os`                                       | ISO timestamp of the feed update. Use it for staleness detection    |
| `number_of_caution_segments`, `number_of_caution_laps` |                                                                     |
| `number_of_lead_changes`, `number_of_leaders`          |                                                                     |
| `stage`                                                | `{ stage_num, finish_at_lap, laps_in_stage }`                       |
| `vehicles`                                             | Array, see below                                                    |

**Per-vehicle fields (observed):**

| Field                                                                                 | Notes                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `running_position`                                                                    | Current position                                                                                                                                                                                                                                                                                  |
| `vehicle_number`                                                                      | String (e.g. `"5"`, `"88"`)                                                                                                                                                                                                                                                                       |
| `vehicle_manufacturer`                                                                | `Chv`, `Frd`, `Tyt`                                                                                                                                                                                                                                                                               |
| `driver`                                                                              | `{ driver_id, full_name, first_name, last_name, is_in_chase }`                                                                                                                                                                                                                                    |
| `sponsor_name`                                                                        |                                                                                                                                                                                                                                                                                                   |
| `delta`                                                                               | **Two meanings:** seconds behind leader if on lead lap; a **negative whole number = laps down** (e.g. `-10.0`). Leader is `0.0`                                                                                                                                                                   |
| `laps_completed`                                                                      |                                                                                                                                                                                                                                                                                                   |
| `last_lap_time`, `last_lap_speed`                                                     |                                                                                                                                                                                                                                                                                                   |
| `best_lap`, `best_lap_time`, `best_lap_speed`                                         | `best_lap` is the lap number it was set on                                                                                                                                                                                                                                                        |
| `laps_led`                                                                            | Array of `{ start_lap, end_lap }` ranges                                                                                                                                                                                                                                                          |
| `pit_stops`                                                                           | Array of `{ pit_in_lap_count, pit_in_elapsed_time, pit_out_elapsed_time, pit_in_rank, pit_out_rank, positions_gained_lossed, pit_in_leader_lap }`. Entries with all-zero times appear at the start and should be ignored. A final entry with zero times may be an in-progress or placeholder stop |
| `status`                                                                              | 1 observed = running. 3 observed for a car out of the race (`is_on_track: false`). Others to confirm                                                                                                                                                                                              |
| `is_on_track`, `is_on_dvp`                                                            | `is_on_dvp` = Damaged Vehicle Policy clock active                                                                                                                                                                                                                                                 |
| `starting_position`, `average_running_position`                                       |                                                                                                                                                                                                                                                                                                   |
| `passes_made`, `times_passed`, `quality_passes`, `passing_differential`               |                                                                                                                                                                                                                                                                                                   |
| `fastest_laps_run`, `laps_position_improved`, `position_differential_last_10_percent` |                                                                                                                                                                                                                                                                                                   |
| `average_speed`, `average_restart_speed`                                              |                                                                                                                                                                                                                                                                                                   |

**Driver name quirks:** names carry status suffixes inside `full_name` and `last_name`:

- `(C)` = playoff contender (also reflected by `driver.is_in_chase`)
- `(i)` = ineligible for driver points in this series
- `#` = rookie

Strip these from display names and render them as small badges instead.

### 3.2 Unverified: other feeds (for later milestones)

Found in community projects. **Check CORS for each one before depending on it.** If CORS fails for a feed, that feature waits for the Tauri desktop build or a different approach.

| Feed                                                                            | Purpose                                                                |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `https://cf.nascar.com/live-ops/live-ops.json`                                  | Which race NASCAR is currently featuring (`live_current_series1_race`) |
| `https://cf.nascar.com/cacher/{year}/1/race_list_basic.json`                    | Cup schedule                                                           |
| `https://cf.nascar.com/cacher/{year}/race_list_basic.json`                      | Other series schedules                                                 |
| `https://cf.nascar.com/cacher/{year}/1/schedule-combined-feed.json`             | Combined Cup schedule                                                  |
| `https://cf.nascar.com/cacher/{year}/{series}/{race_id}/weekend-feed.json`      | Full weekend data/results                                              |
| `https://cf.nascar.com/cacher/{year}/{series}/{race_id}/live-stage-points.json` | Live stage/points                                                      |
| `https://cf.nascar.com/cacher/{year}/{series}/{race_id}/lap-times.json`         | Per-lap history (historical)                                           |
| `https://cf.nascar.com/cacher/live/series_{series}/{race_id}/lap-times.json`    | Per-lap history (live). Returns 403 before the session starts          |
| `https://cf.nascar.com/racing-insights/raw-feed/{race_id}-NCS.json`             | Official gap-to-leader / gap-to-car-ahead, pit events                  |
| `https://cf.nascar.com/cacher/drivers.json`                                     | Driver list                                                            |

A 403 from these endpoints often means "session not live yet," not "you're blocked." Handle it quietly.

### 3.3 Polling rules (important)

NASCAR publishes no rate limit, and there's no uptime guarantee. Be conservative:

- **Default interval: 5 seconds** while a session is active. Never below 3 s.
- Use `fetch(url, { cache: "no-cache" })` so the browser revalidates with `If-None-Match` / `If-Modified-Since` when the CDN provides `ETag` / `Last-Modified`. Check the actual response headers (`Cache-Control`, `ETag`, `Last-Modified`) and adjust.
- Add ±10% jitter to the interval.
- **Pause polling when the tab is hidden** (`document.visibilitychange`) and resume immediately when it becomes visible.
- **Slow down when idle:** if the flag is checkered or the session content (`elapsed_time`, `lap_number`, vehicles) hasn't changed for several minutes, drop to polling every 60 s. Don't use `time_of_day_os` or the `ETag` for this: after the checkered flag the feed is still republished every ~45 s with a fresh `time_of_day_os` and `ETag` but identical content (observed 2026-09-27, see `docs/feed-notes.md`).
- **Exponential backoff on errors** (network, 403, 429, 5xx): 10 s → 20 s → 40 s … capped at 5 min. Show a clear "connection issue" state in the UI.
- Never run more than one in-flight request per feed. Skip a tick if the previous request hasn't finished.
- Only one polling loop per tab, even if multiple components need the data.

**As implemented (milestone 3):** "several minutes" of unchanged content = 3 min. Requests time out after 15 s. Jitter also applies to idle and backoff delays, and the 3 s floor applies after jitter. Returning to a visible tab polls immediately, even during error backoff. Idle detection compares the feed with `time_of_day_os` and `time_of_day` removed.

### 3.4 Flag states

`flag_state` is numeric. Confirmed from observation: `1` = green, `9` = checkered. Believed: `2` = yellow/caution, `3` = red, `4` = white. Anything else should render as "Unknown (n)" rather than crashing.

**Log every distinct `flag_state` value seen (console, dev mode only)** so the mapping can be confirmed during real races and updated here.

---

## 4. Architecture

Keep the data layer framework-agnostic and pure, so it can be reused unchanged in the Tauri build and tested without React.

```
src/
  data/
    sources/
      fetcher.ts          # Interface: fetchJson(url, opts) — the ONLY place network I/O happens
      browserFetcher.ts   # Implementation using window.fetch (v1)
    feeds/
      liveFeed.schema.ts  # zod schema + inferred TS types
      liveFeed.parse.ts   # raw JSON -> normalized domain model
    model/
      types.ts            # Domain types: Session, CarState, PitStop, Flag, etc.
      names.ts            # Strip (C)/(i)/# suffixes -> { displayName, badges }
      gaps.ts             # gap-to-leader / gap-to-car-ahead / laps-down logic
      diff.ts             # Compare consecutive snapshots -> events (pos change, pit in/out, flag change, lead change)
      flags.ts            # flag_state -> label/color
      lookups.ts          # manufacturer codes, series ids -> display names
    polling/
      poller.ts           # Framework-agnostic polling engine implementing §3.3
  hooks/
    useLiveSession.ts     # React wrapper around poller; exposes { session, status, lastUpdated, events }
  components/
    SessionHeader.tsx     # Race name, track, lap X/Y, stage, flag banner, cautions, lead changes
    TimingTable.tsx       # Main board
    TimingRow.tsx
    FlagBanner.tsx
    ConnectionStatus.tsx  # Live / stale / reconnecting / idle
    EventTicker.tsx       # Recent events from diff.ts (e.g. "#5 pits from P1", "Caution lap 215")
  styles/
  App.tsx
  main.tsx
tests/
  fixtures/               # Recorded live-feed.json snapshots
```

**Key rules**

- `fetcher.ts` is the swap point. The Tauri build or a future proxy should only need a new fetcher implementation.
- Parsing is tolerant: unknown fields are ignored, and missing optional fields get sensible defaults. A schema failure for one vehicle should not blank the whole board. Log it and skip or patch that row.
- Keep the last N snapshots in memory (e.g. 20) for diffing and simple trends. No persistence in v1.

### Gap calculations (`gaps.ts`)

- Gap to leader: if `delta >= 0`, show seconds (`+2.391`). If `delta < 0`, show laps down (`-10 L`). Leader shows `Leader`.
- Gap to car ahead (interval): for two consecutive lead-lap cars, `delta[n] - delta[n-1]`. Across a lap boundary, show the lap difference. Treat this as an approximation until the racing-insights feed is integrated (it provides official values).

---

## 5. v1 UI

Dark theme default, with a light theme toggle. Monospace/tabular numbers for all timing columns.

### 5.1 Primary display: portrait monitor

The owner's setup is a monitor rotated to vertical orientation, used as a dedicated second screen beside the TV. **This is the primary design target.** The point of the vertical screen is to see the entire field at once, so layout decisions should serve that.

**Target viewports**

- Design against a portrait 1080×1920 screen. Also check 1440×2560 and 2160×3840.
- **Account for Windows display scaling.** At 125% or 150% scaling, a 1080-px-wide portrait monitor gives only ~864 or ~720 CSS px of width. The layout must work well from roughly **720 to 1440 CSS px wide** in portrait.

**Whole field without scrolling**

- A Cup field is ~36–40 cars. In portrait, all rows should fit on screen with no vertical scrolling.
- Row height and font size should be computed from the available height divided by the number of cars (CSS `clamp()` with viewport units, or a small measure-and-fit hook). Rows scale up when the field is smaller and stay readable when it's full.
- Set a minimum readable size. If the field can't fit at that size (e.g. a very short window), fall back to scrolling instead of shrinking text further.

**Layout (top to bottom, single column)**

1. Flag banner: a full-width, color-coded strip with a text label. It must be readable from across a room.
2. Compact session header: race name, track, lap `X / Y`, laps to go, stage, cautions, lead changes, last-updated indicator. Keep it to one or two lines so the table gets most of the height.
3. Timing table filling the remaining height.
4. Optional compact event ticker at the bottom (one or two lines). Can be toggled off to give the table more room.

No sidebars or side panels in portrait. Settings live in a small overlay/drawer that's hidden by default.

**Column priority for narrow widths**

Columns drop out in reverse priority order as width shrinks, rather than squeezing everything:

1. Always shown: Pos · Car # · Driver · Gap to leader · Interval · Last lap
2. Shown when there's room: Best lap · ± · Laps led · Pit stops
3. Lowest priority: Mfr · Laps · Status (status can instead be shown through row styling, e.g. dimmed or DVP badge)

Driver names should shorten automatically when space is tight: full name → `K. Larson` → `Larson`.

**"Display mode" for the dedicated screen**

- A fullscreen button using the Fullscreen API.
- Hide the mouse cursor after a few seconds of inactivity.
- Keep the screen awake while a session is live, using the Screen Wake Lock API where supported (silently skipped if unsupported).
- Controls hidden until the mouse moves.

**Other screen shapes (secondary)**

- In landscape on a large screen, consider splitting the field into two side-by-side tables (e.g. P1–20 and P21–40) instead of stretching one table wide. This can be a later enhancement.
- Tablets and phones: a single scrolling table with the high-priority columns only is acceptable.

### 5.2 Content

**Session header:** series, race name, track, lap `X / Y` and laps to go, stage number and stage end lap, a prominent flag banner (color-coded), caution count/laps, lead changes, and a "last updated N s ago" indicator.

**Timing table columns (default):**
Pos · ± (position change since start or last N laps) · Car # · Driver (with badges) · Mfr · Gap to leader · Interval · Last lap · Best lap · Laps · Laps led · Pit stops (count, last pit lap) · Status

**Row states / highlights:**

- Car out of race / not on track → dimmed.
- On DVP → badge.
- Personal best on last lap → highlight last-lap cell.
- Session-best lap → distinct highlight.
- Recently pitted → brief indicator.
- Position change on this update → brief up/down flash.

**Interactions:**

- Click a column header to sort (default by position).
- "Favorite" drivers (stored in `localStorage`) are highlighted and optionally pinned to the top.
- Column visibility toggles (persisted in `localStorage`).

**No session / stale feed:** if `time_of_day_os` is old, show the last session's final results with a clear "Not live — showing last session" state rather than an error.

**Footer disclaimer:** "Unofficial fan project. Not affiliated with or endorsed by NASCAR. Data © NASCAR."

---

## 6. Development and testing

- **Record fixtures first.** Save the current `live-feed.json` into `tests/fixtures/` (a finished race is already available). During live races, record a sequence of snapshots to test diffing and replay.
- **Dev replay mode:** a `?replay=fixtureName` query param (dev builds only) that feeds recorded snapshots through the same pipeline on a timer. This allows UI development without a live race.
  - **As implemented (milestone 5):** `?replay=<folder>&speed=<n>&lap=<n>` plays a **Timing71 replay download** placed in the project root. A dev-server-only Vite plugin (`vite.replays.ts`, `apply: 'serve'`) serves it, and `src/dev/timing71.ts` converts each frame into NASCAR live-feed JSON. Fields Timing71 doesn't carry are derived across frames: laps-led ranges, lead changes, caution counts, pit stops (from PIT/RUN state), starting positions and best-lap lap numbers. On the 2026 Kansas race this matches the official final feed exactly for finishing order, starting grid, laps led, lead changes (13) and leaders (7). It's approximate for cautions (4 segments / 30 laps vs the official 5 / 26) and misses one pit stop each for #1 and #54. DVP and sponsor names aren't available, and Timing71 strips the `(i)` and `#` name markers (it keeps `(C)`), so replays show only contender badges. That's a limitation of the recording; the live feed has all of them.
  - **Replay folders are third-party data:** they're excluded locally via `.git/info/exclude` and `.prettierignore`, and are never committed or deployed. The converter's tests use a small hand-made recording.
- Unit tests for: name suffix parsing, gap/interval math (lead lap, lapped, leader), flag mapping (including unknowns), snapshot diffing, pit stop filtering, and poller backoff and visibility logic (fake timers).
- **Check layouts at portrait viewports** using browser DevTools device emulation: 720×1280, 864×1536, 1080×1920, and 1440×2560 CSS px, with both a full field (40 cars) and a small one. Replay mode makes this easy.

---

## 7. Deployment: GitHub Pages

- Deploy with **GitHub Actions** (`actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages`) on push to `main`.
- **For now there is no custom domain.** The site is served at `https://<github-username>.github.io/<repo>/`.
- Vite `base` is `'./'` (relative asset paths), so the same build works under `/<repo>/` today and at a subdomain root later. Revisit if client-side routing is added.
- There is no `public/CNAME`. With Actions-based deploys, the custom domain is set in repo Settings → Pages, not by a CNAME file.
- Owner tasks (not code): in repo Settings → Pages, set source to "GitHub Actions". Later, for a custom subdomain: set the custom domain there, and at the DNS provider add a `CNAME` record pointing the subdomain to `<github-username>.github.io`. Enable "Enforce HTTPS" once the certificate is issued.
- If client-side routing is added later, use hash routing or a `404.html` fallback, since Pages has no SPA rewrites. v1 can be a single page with no router.

---

## 8. Milestones

1. **Scaffold:** Vite + React + TS, ESLint/Prettier, Vitest, GitHub Actions Pages deploy, README. (CNAME dropped until a custom domain exists.) ✅ Done 2026-09-27.
2. **Data layer:** zod schema, parser, names, gaps, flags, and tests against the fixture. ✅ Done 2026-09-27. The parser is pure and returns `issues` (dropped rows) instead of logging; logging, including the dev-only log of distinct `flag_state` values (§3.4), happens where snapshots arrive, in milestone 3.
3. **Poller:** polling engine per §3.3 plus the `useLiveSession` hook and connection status. ✅ Done 2026-09-28. The live-feed wiring lives in `src/data/liveSession.ts`.
4. **Timing board v1:** portrait-first layout per §5.1 (whole field fits, column priority), header, flag banner, table, row highlights, sorting. ✅ Done 2026-09-28. Layout math is pure (`src/components/board/layout.ts`): row height = available height ÷ (cars + header row), clamped to 20–64 px; font = half the row height, clamped to 12–22 px; below 20 px rows the table scrolls. Column widths are in em, so fewer columns fit as the text grows. Optional columns are added in the order Best, ±, Led, Pits, Mfr, Laps, Status, stopping at the first that doesn't fit. Verified by screenshots at 720×1280, 864×1536, 1080×1920 and 1440×2560 with the 36-car Kansas field: every priority-2 column is shown at all four. Position-change flashes stay in milestone 5.
5. **Replay mode + diff events:** event ticker, position-change flashes. ✅ Done 2026-09-28. `src/data/model/diff.ts` turns consecutive snapshots into events: flag changes, lead changes, pit in/out, out of the race, DVP and new fastest lap. It also reports per-car position changes. `src/data/sessionHistory.ts` keeps the last 20 snapshots and 50 events. Position-change flashes use the same up/down colors as the ± column (2 s, reduced under `prefers-reduced-motion`). The interval now shows "—" instead of a clamped +0.000 when the car ahead has a bigger gap (seen mid pit cycle). Rows also slide to their new place when the order changes (FLIP animation, 600 ms, `src/hooks/useRowReorderAnimation.ts`). This covers position swaps and re-sorting, is skipped on resize and under `prefers-reduced-motion`, and an interrupted slide continues from where the row is on screen.
6. **Preferences + display mode:** favorites, column toggles, theme toggle (localStorage), fullscreen, cursor hide, wake lock. ✅ Done 2026-09-28. Preferences (`src/prefs/`) are stored as one JSON value under `spotter.preferences.v1`, parsed tolerantly, synced across tabs, and still work in memory if storage is blocked. They cover theme, event ticker on/off, hidden columns (Pos, # and Driver can't be hidden; hidden columns give their width to others), favorite drivers (keyed by NASCAR driver id, or by name in replays) and pinning favorites to the top. Favorites toggle in the settings drawer or by double-clicking a row, and show an accent bar and accent-colored name. Settings open in a drawer (Escape or the backdrop closes it). Display mode: the cursor hides after 3 s idle; the fullscreen and settings buttons sit in the footer, always visible (owner preference, overriding §5.1's "controls hidden until the mouse moves"), so they never cover data; the screen wake lock is held while the session is live and not checkered, re-acquired when the page becomes visible, and skipped silently when unsupported. A saved light theme is applied by a tiny inline script before first paint. Pit badges: **PIT** while a car is on pit road, **OUT** on its out lap only (until its lap count goes up after leaving pit road; tracked across snapshots, so not shown for stops that finished before the page was opened). Status is shown as short mono caps (RUN / OUT / OFF / S<n>, full meaning on hover). Manufacturers are small, fully rounded colored pills (Chevy gold, Ford blue, Toyota red) with the name inside in mono caps, sized down from the first version, which was too heavy. A dot before the name was also tried and rejected. Brand-associated colors only, no logos or marks, per §1 non-goals. Opt-in (off by default) "Team car-number graphics" shows each car's styled number image hotlinked from NASCAR's CDN (`carbadges`, looked up via `cacher/drivers.json`; only `https://cf.nascar.com/data/images/carbadges/…` URLs are ever rendered; plain number as fallback; framed on a mid-grey plate in the light theme only, where white numbers would otherwise vanish). This is team imagery, so it stays opt-in and is never hosted by us. The footer shows the current time (clock icon) and the last successful feed update (refresh icon) on the right. Icons come from Lucide (`lucide-react`). Table cells use `text-box: trim-both cap alphabetic` so Geist Sans and Geist Mono capitals center on the row (Firefox gets a measured nudge instead).
7. **Polish:** landscape/tablet fallbacks, accessibility (color is never the only signal; flags also get a text label), empty/stale/error states. ✅ Done 2026-09-28.
   - **Landscape:** when the window is wider than tall, the field splits into two side-by-side tables (first half on the left), if that gives text at least as large and still fits the priority-1 columns with short names. Rows slide between the tables when cars cross the halfway position. Verified at 1920×1080 (49 px rows) and 1366×768.
   - **Tablets and phones:** single table, with columns dropping by width. Below 20 px rows the table scrolls, and the layout reserves space for the scrollbar. On phones the footer wraps so the disclaimer stays readable.
   - **Feed states:** a full-screen "Can't reach NASCAR's live timing feed" state with a Retry button when there's no data yet; an amber stale-data warning (data time and age, Retry) while the feed is failing with old data on screen; "No cars in this session yet" for an empty field; and an error boundary so a rendering bug shows a message and Reload instead of a blank page. `poller.refresh()` backs Retry: it skips while a request is running and keeps the backoff count.
   - **Accessibility:** screen readers hear only status changes (not the ticking "updated Ns ago") and flag changes (not every lap). Tables have hidden captions with the rows and sort order. `tests/a11y/contrast.test.ts` checks every text/background pair in both themes against WCAG AA (4.5:1). That test darkened the green and red flags, and the light-theme contender and favorite colors.

**Later milestones:** verify CORS on the other feeds → schedule/points pages → lap charts from lap-times → racing-insights gaps → TV delay slider → Tauri desktop wrapper (new fetcher implementation only).

- **TV delay:** ✅ Done 2026-09-28, as a − / value / + stepper rather than a slider (owner preference). It's in Settings, 0–900 s, typed or stepped (Shift = 10 s), saved with the other preferences. Polling isn't slowed; snapshots are held in `src/data/delayBuffer.ts` and released when they're `delay` old. Events, position flashes and slides therefore follow the delayed data, while connection status and the stale warning stay real-time. The footer shows the delay (timer icon) next to the current time and last update. With a delay set, a fresh page shows "Holding the board for your TV delay" until the first update is due.
- **Points page:** ✅ Done 2026-09-28, at `#/points` (hash routing). Timing and Points buttons in the footer switch pages. There are two tabs:
  - **Live race** (`live/feeds/live-points.json`, polled every 15 s): position, places gained or lost this race, points, gap to leader and to next, points earned this race, and stage 1–3 points (stage winners highlighted). Moves compare pre-race points (total minus earned) with current points, ranking ties equally, so tied drivers don't show false swaps. Drivers not in the session on the board are dimmed.
  - **Season** (`cacher/{year}/{series}/points-feed.json`, every 2 min): the championship table with a Cup / O'Reilly / Truck switcher, plus wins, top 5/10, stage wins, laps led, DNF and starts.

  Both tabs follow the TV delay and highlight favorites, and columns drop out by width using container queries. `usePolledFeed` wraps the same polling engine (jitter, backoff, pause when hidden) for these feeds.

- **Racing-insights gaps (checked 2026-09-28, not built):** `racing-insights/raw-feed/{race_id}-NCS.json` (CORS: *) gives the same `Delta` as the live feed, and `DeltaNext` matched our computed interval for all 25 cars with a time or lap gap in the Kansas final. The other 11 are lapped cars on the same lap as the car ahead: NASCAR shows "0L" where we show "—". So official gaps add no precision. The feed is still valuable for pit stop times, tires, laps since pit, positions gained over recent laps, average lap times, stage finishes and `PointsThisRace`.

---

## 9. Conventions

- Small, focused commits with clear messages.
- Keep this brief updated when decisions change or when unknowns (flag codes, status codes, run types, series IDs) are confirmed.
- Put confirmed feed observations in a `docs/feed-notes.md` file as they're discovered during live races.
- License: MIT, © nlucaccioni.
