# Feed notes

Confirmed observations about NASCAR's undocumented feeds, recorded during live sessions.
See `PROJECT_BRIEF.md` §3 for the baseline. Add a dated entry whenever something is confirmed or changes.

## `flag_state`

| Value | Meaning   | Confirmed |
| ----- | --------- | --------- |
| 1     | Green     | Yes       |
| 2     | Yellow    | Believed  |
| 3     | Red       | Believed  |
| 4     | White     | Believed  |
| 9     | Checkered | Yes       |

## `vehicles[].status`

| Value | Meaning     | Confirmed                       |
| ----- | ----------- | ------------------------------- |
| 1     | Running     | Observed                        |
| 3     | Out of race | Observed (`is_on_track: false`) |

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

| Feed                        | CORS OK?                                         | Date checked |
| --------------------------- | ------------------------------------------------ | ------------ |
| `live/feeds/live-feed.json` | Yes (`Access-Control-Allow-Origin: *`, GET/HEAD) | 2026-09-27   |

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
  - Still to confirm during a live race: what an in-progress stop looks like (expected: a pit-in
    time and a zero pit-out time).
  - Also to confirm live: whether `is_on_track` goes false while a car is on pit road. The board
    dims rows with `is_on_track: false`, so if it does, rows would dim during stops.
