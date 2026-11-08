# Feed notes

Confirmed observations about NASCAR's undocumented feeds, recorded during live sessions.
See `PROJECT_BRIEF.md` §3 for the baseline. Add a dated entry whenever something is confirmed or changes.

## `flag_state`

| Value | Meaning   | Confirmed   |
| ----- | --------- | ----------- |
| 1     | Green     | Yes         |
| 2     | Yellow    | Believed    |
| 3     | Red       | Believed    |
| 4     | White     | Believed    |
| 8     | Warm-up   | Yes (owner) |
| 9     | Checkered | Yes         |

8 is unofficial (orange): warm-up laps are being timed but the event hasn't started (2026-10-11).

## `vehicles[].status`

| Value | Meaning                                | Confirmed                                                        |
| ----- | -------------------------------------- | ---------------------------------------------------------------- |
| 1     | Running                                | Observed                                                         |
| 3     | Out of race                            | Observed (`is_on_track: false`)                                  |
| 6     | Damaged, behind the wall (not retired) | Believed (one car, 6 → 3 when retired, 2026-10-11); shown as GAR |

## `series_id`

| Value | Series                                  | Confirmed   |
| ----- | --------------------------------------- | ----------- |
| 1     | Cup                                     | Yes         |
| 2     | O'Reilly Auto Parts Series              | Yes (owner) |
| 3     | Craftsman Truck Series ("Truck Series") | Yes (owner) |

## `run_type`

| Value | Meaning | Confirmed |
| ----- | ------- | --------- |
| 3     | Race    | Observed  |

## CORS checks

| Feed                                                      | CORS OK?                                         | Date checked |
| --------------------------------------------------------- | ------------------------------------------------ | ------------ |
| `live/feeds/live-points.json`                             | Yes (`*`)                                        | 2026-09-28   |
| `cacher/{year}/{series}/points-feed.json`                 | Yes (`*`)                                        | 2026-09-28   |
| `cacher/{year}/{series}/racinginsights-points-feed.json`  | Yes (`*`)                                        | 2026-09-28   |
| `cacher/{year}/{series}/{race_id}/live-stage-points.json` | Yes (`*`)                                        | 2026-09-28   |
| `racing-insights/raw-feed/{race_id}-NCS.json`             | Yes (`*`)                                        | 2026-09-28   |
| `cacher/drivers.json`                                     | Yes (`Access-Control-Allow-Origin: *`)           | 2026-09-28   |
| `data/images/carbadges/<series>/<badge>.png`              | Yes (`Access-Control-Allow-Origin: *`)           | 2026-09-28   |
| `cacher/2026/1/5628/weekend-feed.json`                    | Yes (`Access-Control-Allow-Origin: *`)           | 2026-09-28   |
| `live/feeds/series_{series}/{race_id}/live_feed.json`     | Yes (`*`)                                        | 2026-09-28   |
| `live/feeds/series_{series}/{race_id}/live_points.json`   | Yes (`*`)                                        | 2026-09-28   |
| `cacher/{year}/{series}/race_list_basic.json`             | Yes (`*`)                                        | 2026-09-28   |
| `live-ops/live-ops.json`                                  | Yes (`*`)                                        | 2026-09-28   |
| `live/feeds/live-feed.json`                               | Yes (`Access-Control-Allow-Origin: *`, GET/HEAD) | 2026-09-27   |

## Log

### 2026-09-27 — Cup, Kansas Speedway, Hollywood Casino 400 (post-race)

Fixture: `tests/fixtures/cup-2026-kansas-final.json` (race_id 5628, 267/267 laps, `flag_state` 9, 36 cars).

- **HTTP headers:** served from S3 behind CloudFront. `ETag` and `Last-Modified` are present;
  **no `Cache-Control`** header. CORS: `Access-Control-Allow-Origin: *`, methods `GET, HEAD`.
- **Republished while idle:** after the checkered flag, the feed is still rewritten every ~45 s.
  `time_of_day_os`, `ETag` and `Last-Modified` change each time, but `elapsed_time` and all
  vehicle data are byte-identical. So neither `time_of_day_os` nor the ETag tells us whether
  anything happened; compare content (`elapsed_time`, `lap_number`, vehicles) instead.
  Consequence: conditional requests save little here; the idle slowdown matters more.
- **`time_of_day_os` format:** local track time with offset and 7-digit fractional seconds, e.g.
  `2026-09-27T22:11:25.0012228-05:00`. `new Date()` parses it correctly in V8.
- **Fields not in the brief:**
  - Top level: `time_of_day` (seconds since local midnight, e.g. `79885`), `avg_diff_1to3`.
  - Per vehicle: `vehicle_elapsed_time`, `qualifying_status`.
- **`status` values seen:** `1` and `3` only.
- **`laps_led` includes lap 0:** the pole-sitter (#22) has a `{ start_lap: 0, end_lap: 0 }` range,
  so the raw ranges sum to 268 for a 267-lap race. Lap 0 is not counted as a lap led.
- **`pit_stops` entry types** (across all 36 cars):
  - 2 all-zero placeholders at the start of every car's list (lap 0, no times, ranks copied from
    the start). Dropped.
  - Normal stops: lap, pit-in and pit-out elapsed times all present.
  - **Post-race pit-road entries (confirmed 2026-09-28):** after the checkered flag, cars drive
    down pit road and the feed logs it as a stop. 19 cars have one with `pit_in_leader_lap` =
    267 (the final lap) and a pit-in time after the race's `elapsed_time` (e.g. 10409 s vs
    10361 s). 4 more (#1, #22, #34, #77) have one on leader lap 267 with no times at all; #77's
    own lap count was 264, so these follow the leader's lap. The parser drops any stop on or
    after the leader's final lap, or with a pit-in time after the session's elapsed time.
  - In-progress stops: see the 2026-10-04 entry below (not a zero pit-out time, as expected).

### 2026-10-04 — Cars on pit road (live, Cup lap 82–84 caution stops)

- `is_on_track` is **false** while a car is on pit road (`status` stays 1).
- An in-progress stop already has a **non-zero** `pit_out_elapsed_time`: it appears within
  seconds of pit-in and keeps advancing while the car is on pit road (e.g. #21: pit-in 3137.6,
  pit-out 3144.7 at elapsed 3149, then 3175.8 at elapsed 3179, still off track). It can also sit
  unchanged for 30–60 s while the car is stopped. So pit-out time can't say whether a stop is
  over; `is_on_track` flipping back to true does.
- The parser derives `isOnPitRoad`: running, off track, and the last stop's pit-in within 300 s
  of the session clock (longer than that, assume the garage and show OFF). A stop with a pit-in
  time and no pit-out time also counts, which is how the Timing71 replays show it.

### 2026-09-28 — Lap count at pit exit (from the Kansas Timing71 replay)

Of 196 observed pit exits, 134 left pit road with the lap count already one past the stop lap
(the car crossed the timing line on pit road), 60 left with it unchanged (exited before the
line), and 2 with +2. So "out lap" can't be derived from a single snapshot; the board records
each car's lap count when it's seen leaving pit road and shows OUT until that count goes up
(`src/data/model/outLaps.ts`). Worth confirming against NASCAR's own feed during a live race.

### 2026-09-28 — Driver list and car-number badges

- `cacher/drivers.json` (~1.4 MB, 918 drivers) has per driver: `Nascar_Driver_ID` (matches the
  live feed's `driver.driver_id`), `Full_Name`, `Badge`, `Badge_Image`, `Team`, `Driver_Series`
  and image URLs. No car/number colors as data.
- `Badge_Image` is `https://cf.nascar.com/data/images/carbadges/<series id>/<badge>.png`: a 78×70
  transparent PNG of the car number in the team's styling. For Cup the badge id is the car
  number; it isn't always (a Truck entry had `4237`), and each driver has one entry for their
  main series.
- Used only by the opt-in "Team car-number graphics" setting (hotlinked, not hosted by us).

### 2026-09-28 — Points feeds

- `live/feeds/live-points.json` (also served at `live/feeds/series_1/{race_id}/live_points.json`
  and `cacher/live/series_1/{race_id}/live-points.json`): live points for the current session.
  58 entries: everyone with a license, including non-eligible drivers with 0 points. Per driver:
  `points_position`, `points`, `delta_leader`/`delta_next` (negative), `points_earned_this_race`,
  `stage_{1,2,3}_points` and `_winner`, `bonus_points`, `is_points_eligible`, `is_in_chase`,
  and season wins/top 5/top 10. `series_id`/`race_id` are 0, so the series comes from the live feed.
  Names carry the same (C)/(i)/# markers as the live feed.
- `cacher/{year}/{series}/points-feed.json`: season standings. `position`, `points`,
  `points_earned` (last race), deltas, starts, wins, top 5/10, stage wins by stage, laps led, DNF,
  playoff fields, `manufacturer` as a full name, and `driver_suffix` written `Jr` (no period).
  Tied drivers can be listed in a different order than in live-points.
- `racinginsights-points-feed.json` is similar, with `PrevWeekPointsPos` and `PosGL`; not used yet.

### 2026-09-28 — RAM (Truck Series)

- RAM is spelled `RAM` in `points-feed.json` (`manufacturer`) and `weekend-feed.json` (`car_make`,
  `manufacturer`); 18 Truck drivers in the 2026 standings.
- **To confirm during a live Truck session:** the live feed's `vehicle_manufacturer` code for RAM
  (the others are `Chv`, `Frd`, `Tyt`). The board accepts `Ram`, `RAM` and `Rm`; anything else
  shows as plain text until it's added in `src/data/model/lookups.ts`.

### 2026-09-28 — Per-series live feeds and schedules

- `live/feeds/series_{n}/{race_id}/live_feed.json` (also `cacher/live/series_{n}/{race_id}/live-feed.json`)
  has the same shape as `live-feed.json`. Checked on finished races: Cup 5628 (Kansas), O'Reilly
  5660 (Bristol, 38 cars), Truck 5675 (Kansas). A race whose weekend hasn't started returns
  **403** (Cup 5630, O'Reilly 5663).
- `live_points.json` next to it works the same way (O'Reilly 5660: 200).
- `cacher/{year}/{series}/race_list_basic.json`: array of races (`cacher/{year}/race_list_basic.json`
  has all series keyed `series_1`…). Each has `race_id`, `race_name` (sometimes with a trailing
  space), `track_name`, `date_scheduled` (no offset; Eastern: 5630 says 17:30 for a 21:30 UTC
  start), and `schedule`: the weekend's events with `start_time_utc` (UTC, no offset) and
  `run_type` (0 = off-track, e.g. hauler parade or garage hours; 1 practice; 2 qualifying; 3 race).
  A few future races have no on-track events listed yet. Exhibition races (Clash, Duels,
  All-Star) are in the list with `race_type_id` 2. Next season's list already exists (2027: 200).
- `live-ops/live-ops.json` has `live_feed_url_series{n}` and `live_current_series{n}_race`, but on
  2026-09-28 they were no use for picking a race: `live_feed_url_series1` pointed at race 5598,
  `live_current_series{n}_race` was the _next_ race, and `live_current_series{n}_tunein_bar_race` the
  latest. The schedule is used instead.
- **To confirm live:** that a series feed switches to practice/qualifying when the weekend's
  first session starts (the board assumes it does), and how it looks between practice and the race.

### 2026-10-11 — Caution reasons and lap notes (live, Cup Charlotte 5629, lap ~48)

Looked for feeds that say why a caution came out. All of these are CORS `*` (GET/HEAD).

- **`live/feeds/live-flag-data.json`** (featured race) and
  **`live/feeds/series_{series}/{race_id}/live-flag-data.json`** (hyphens; the underscore form
  403s, unlike `live_feed.json`). An array with one entry per flag change: `lap_number`,
  `flag_state`, `elapsed_time`, `time_of_day_os`, `comment` and `beneficiary`. Only cautions
  (`flag_state` 2) have a `comment`, e.g. `"#38 Spin Turn 4"`, `"Debris Pit Entry"`,
  `"Stage 1 Conclusion"`, `"Competition caution"`, `"#54, 6 incident turn 4"`. `beneficiary` is
  the free-pass car number padded with spaces (`"21   "`), or `""` / `null`. It updated live, with
  the same `Last-Modified` as the timing feed. Also seen: `flag_state` **8** on the lap-0 entry
  (warm-up, see `flag_state` above), which the event log shows as a Warm-up row.
- **`cacher/{year}/{series}/{race_id}/lap-notes.json`**: `{ laps: { "<lap>": [{ FlagState,
Note, NoteID, DriverIDs }] } }`. Written commentary, current to the
  live lap. Caution notes start with `"Caution: "` and give more detail than the flag feed, e.g.
  `"Caution: #38 spins in turn 4 from 28 with a flat right rear tire."`. They also cover
  restarts, who pitted, lead battles and penalties ("To the rear: #4 (unapproved adjustments)").
  Lap 0 holds pre-race notes. `cacher/live/series_1/{race_id}/lap-notes.json` 403s.
- **`weekend-feed.json` `caution_segments`**: `start_lap`, `end_lap`, `reason` (`Spin`,
  `Competition`, `Debris`, …), `comment` (same text as the flag feed) and
  `beneficiary_car_number`. Its laps are about 2 later than the flag feed's (5630: 45 vs 43,
  82 vs 80). Also has `infractions` (empty for 5630). Updates during the race, but less often
  (`Last-Modified` ~3 min behind).
- **`live/feeds/live-pit-data.json`**: one row per stop, with lap, flag status at pit in/out,
  pit road and box times, `pit_stop_type` and which tyres were changed. No caution information.

### 2026-10-11 — `status` 6 (live, Cup Charlotte 5629, lap ~96)

- #48 (Bowman) had `status: 6` after the lap-76 crash with #23 and #24 ("#23, 48, 24 incident
  turn 2" in the flag feed). All three cars showed `is_on_track: false`, `is_on_dvp: true` and
  `laps_completed` stuck at 76, but #23 and #24 were `status: 3`. So 6 is believed to mean
  damaged and behind the wall, not yet retired. The board shows it as GAR.
- By lap 102 #48 had changed to `status: 3` with nothing else different, so 6 → 3 when the team
  retires the car. **To confirm:** that a status-6 car goes back to 1 if it returns to the track.
- **Per-series feed timestamp:** at the same time, `series_1/5629/live_feed.json` sent
  `time_of_day_os: "0001-01-01T00:00:00+00:00"` on every request, while `live-feed.json` (same
  race and lap) had the real time. The parser treats anything before 2000 as missing.
- **`is_on_dvp` stays true after retiring:** #23, #24 and #48 kept `is_on_dvp: true` once they were
  `status: 3`. At Kansas, #4 retired (likely mechanical) with `is_on_dvp: false`. The board hides
  the DVP tag once a car is out.

### 2026-11-07 — Manufacturer logos and team names

- **Logos:** `drivers.json` links each driver to `Manufacturer` (large) and `Manufacturer_Small`
  logo images on `www.nascar.com/wp-content/uploads/sites/7/<date>/...png`. Small sizes seen:
  Chevrolet 70×30, Ford 70×26, Toyota 35×35 (square), Ram 70×24. The file names carry a date and
  change when NASCAR updates a logo, so the app reads the URLs from the list (the most-linked
  one per make) instead of hard-coding them. They return 403 to plain `curl` but load in a browser.
- **`Team` in `drivers.json` isn't usable:** of 336 Cup entries most are bare numbers (`"2215"`),
  23 are blank, and some names are stale ("Stewart-Haas Racing") or have trailing spaces.
- **Team names come from `cacher/{year}/{series}/{race_id}/weekend-feed.json`** (~50 KB):
  `weekend_race[0].results[]` has `driver_id`, `team_id` and `team_name` for every entered car.
  It's filled from the entry list before the race (Cup championship 5601 had all 40 cars the day
  before), then becomes the results. One weekend covered 39 of the 53 Cup drivers in the
  standings, so the season tab reads earlier weekends until every driver has a team.
- **Team logos: `cacher/{year}/teams.json`** (~4 KB; 2026 and 2025 exist, 2024 is 403) lists the
  15 full-time Cup teams as `{ id, name, mfr, imageUrl, linkUrl }`. `imageUrl` has a literal
  `{ui_theme}` placeholder: `cf.nascar.com/data/images/teams/<Name>_{light|dark}.png`, mostly
  180×80 (Spire and Trackhouse are larger and a different shape). The dark version is white on
  transparent. Its ids don't match the weekend feed's `team_id` (Hendrick is 4 here, 1717 there),
  and names differ slightly ("Trackhouse" vs "Trackhouse Racing"), so the app matches on the
  name, ignoring case, punctuation and a trailing "Racing". No O'Reilly or Truck teams, and no
  short names: the shorthands (HMS, JGR…) are kept in `src/data/feeds/teams.ts`.

### 2026-11-07 — Feeds for the analysis page

- **`race_list_basic.json`** also has `race_type_id` (1 = points race; 2 = exhibitions such as the
  Clash and the Duels) and `winner_driver_id` (null until the race is run). The analysis page uses
  them to pick the season's points races that have been run.
- **`weekend-feed.json` results** carry `starting_position`, `finishing_position` (0 before the
  race, while the list is still the entry list), `laps_led`, `finishing_status`, `points_earned`
  and `points_position` (place in the standings after the race). The race also has
  `stage_N_laps` (per stage, not cumulative), `stage_results`, `race_leaders` (lap 0 is the pole
  sitter "leading" before the start, dropped), `number_of_lead_changes`, `margin_of_victory` and
  `average_speed`.
- **`cacher/{year}/{series}/{race_id}/lap-times.json`** (~630 KB, CORS `*`): `laps[]` per car
  (`Number`, `FullName` with marks like `" (C)"`, `" (i)"` and a rookie `" #"`, `Manufacturer`
  code, `NASCARDriverID`, `Laps[]` of `{ Lap, LapTime, LapSpeed, RunningPos }`; lap 0 is the grid)
  and `flags[]` of `{ LapsCompleted, FlagState }`, the flag at the end of each lap. Its caution
  laps are about 2 laps earlier than the weekend feed's `caution_segments`.
- **`cacher/{year}/{series}/{race_id}/live-pit-data.json`** (~170 KB, CORS `*`): one row per stop
  (Cup Kansas 5628: 267 rows for 36 cars). Each car has a lap-0 placeholder with `-1` times,
  dropped. `total_duration` is pit road entry to exit, `pit_stop_duration` the stationary time,
  `positions_gained_lost` the change from `pit_in_rank` to `pit_out_rank` (negative = lost).
  Green-flag stops always lose many places, so the page sums places gained under caution only.
- **Owner and manufacturer standings** (found from nascar.com's standings page, CORS `*`, all three
  series, 2025 and 2026): `cacher/{year}/{series}/final/{series}-owners-points.json` (~15 KB; one
  row per car entry: `owner_name`, `vehicle_number`, `points`, `delta_leader`, `wins`, `top_5`,
  `dnf`, …) and `cacher/{year}/{series}/final/{series}-manufacturer-points.json` (~1 KB:
  `manufacturer`, `points`, `wins`, `delta_leader`; `position` is a string). Owner points are per
  car, not per team, which is how NASCAR scores the owners' championship. Parsed in
  `src/data/feeds/standings.ts`: the analysis page ranks teams by their best owner car, shows
  manufacturer points and lists the owner standings. Only today's standings are published, not
  race by race.
- **Official standings after each race:** `live/feeds/series_{series}/{race_id}/live_points.json`
  stays up after the race, frozen at its final state, and its `points` is the official season
  total then. Checked across all 35 run Cup races of 2026: the playoff reset shows at race 27
  (Larson 724 → 2086) and race 35's totals equal today's `points-feed.json`. A penalty given
  after a race only shows in the next race's file, so for the latest race the page takes today's
  season standings instead, as long as only a few drivers' totals differ (a feed that hasn't
  caught up with the race yet differs for nearly everyone).
- **Past seasons** (checked 2026-11-07, Cup in full, O'Reilly and Truck sampled): the race list,
  weekend feed and each race's `live_points.json` are all served back to **2017**; 2016 and
  earlier are 403. Lap times and pit data start in **2020** (2019 and earlier are 403), and the
  weekend feed has no `stage_results` before 2020. Old per-race standings are correct: Cup 2024's
  leader goes 51 → 220 → 561 → 860, jumps to 2071 at the playoff reset and ends on 5040.
  Quirks: the 2022 Cup race list leaves `winner_driver_id` null for its last 12 races, so for a
  past season the page counts every race whose weekend has started; the owners' file is an empty
  list for some seasons (Cup 2022 and 2025) and 403 before 2019; the manufacturers' file is 403
  before 2019; `teams.json` (logos) only exists for 2025 on, so older seasons borrow 2025's.

### 2026-11-08 — Per-race files during a live race

Checked during the Cup Championship Race (5601, around lap 40): **`lap-times.json`** and
**`live-pit-data.json`** update while the race runs (lap times kept pace with `live-feed.json`'s
lap within a lap), but the **weekend feed's results** stay the entry list (`finishing_position` 0)
with no `race_leaders` or `stage_results` until NASCAR posts the official results, and the race
list's `winner_driver_id` stays null until then. The analysis page lists the race in progress,
re-reads its three files every 30 s, and fills in the running order, leaders and cautions from
the lap times until official results appear. Its lead changes and leaders matched
`live-feed.json` exactly.
