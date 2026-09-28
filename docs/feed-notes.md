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
