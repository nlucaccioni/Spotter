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

| Value | Series | Confirmed |
| ----- | ------ | --------- |
| 1     | Cup    | Yes       |

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
  - 4 cars (#1, #22, #34, #77) end with an entry that has a lap number but zero times. The race
    was over, so these are not in-progress stops. **Meaning unconfirmed**; kept as untimed stops.
    Watch during a live race whether an in-progress stop looks like this or has a pit-in time
    and zero pit-out time.
