import { z } from 'zod';

// Raw shape of https://cf.nascar.com/live/feeds/live-feed.json.
// The feed is undocumented, so almost every field degrades to a default (via `.catch`) instead
// of failing the parse. Unknown fields are stripped. Only what a row can't exist without
// (running_position, vehicle_number) is required, and that failure drops just that row.

const num = (fallback: number) => z.number().catch(fallback);
const optNum = z.number().nullable().catch(null);
const str = z.string().catch('');
const bool = (fallback: boolean) => z.boolean().catch(fallback);

/** An array whose invalid items are dropped individually; a non-array becomes []. */
function tolerantArray<T extends z.ZodType>(item: T) {
  return z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      items.flatMap((value) => {
        const result = item.safeParse(value);
        return result.success ? [result.data as z.output<T>] : [];
      }),
    );
}

export const rawLapRangeSchema = z.object({
  start_lap: z.number(),
  end_lap: z.number(),
});

export const rawPitStopSchema = z.object({
  pit_in_lap_count: num(0),
  pit_in_leader_lap: optNum,
  pit_in_elapsed_time: optNum,
  pit_out_elapsed_time: optNum,
  pit_in_rank: optNum,
  pit_out_rank: optNum,
  positions_gained_lossed: optNum,
});

const rawDriverSchema = z.object({
  driver_id: optNum,
  full_name: str,
  first_name: str,
  last_name: str,
  is_in_chase: bool(false),
});

export const rawVehicleSchema = z.object({
  running_position: z.number().int().positive(),
  vehicle_number: z.union([z.string().trim().min(1), z.number()]).transform(String),
  driver: rawDriverSchema.catch({
    driver_id: null,
    full_name: '',
    first_name: '',
    last_name: '',
    is_in_chase: false,
  }),
  vehicle_manufacturer: str,
  sponsor_name: str,
  delta: optNum,
  laps_completed: num(0),
  last_lap_time: optNum,
  last_lap_speed: optNum,
  best_lap: optNum,
  best_lap_time: optNum,
  best_lap_speed: optNum,
  laps_led: tolerantArray(rawLapRangeSchema),
  pit_stops: tolerantArray(rawPitStopSchema),
  status: optNum,
  is_on_track: bool(true),
  is_on_dvp: bool(false),
  starting_position: optNum,
  average_running_position: optNum,
  average_speed: optNum,
  average_restart_speed: optNum,
  passes_made: optNum,
  times_passed: optNum,
  quality_passes: optNum,
  passing_differential: optNum,
  fastest_laps_run: optNum,
  laps_position_improved: optNum,
  position_differential_last_10_percent: optNum,
});

export const rawLiveFeedSchema = z.object({
  lap_number: num(0),
  laps_in_race: num(0),
  laps_to_go: num(0),
  elapsed_time: num(0),
  flag_state: optNum,
  race_id: optNum,
  run_id: optNum,
  run_name: str,
  run_type: optNum,
  series_id: optNum,
  track_id: optNum,
  track_name: str,
  track_length: optNum,
  time_of_day_os: z.string().nullable().catch(null),
  number_of_caution_segments: num(0),
  number_of_caution_laps: num(0),
  number_of_lead_changes: num(0),
  number_of_leaders: num(0),
  stage: z
    .object({ stage_num: optNum, finish_at_lap: optNum, laps_in_stage: optNum })
    .nullable()
    .catch(null),
  // Vehicles are validated one by one in the parser, so one bad row can't blank the board.
  vehicles: z.array(z.unknown()),
});

export type RawLapRange = z.output<typeof rawLapRangeSchema>;
export type RawPitStop = z.output<typeof rawPitStopSchema>;
export type RawVehicle = z.output<typeof rawVehicleSchema>;
export type RawLiveFeed = z.output<typeof rawLiveFeedSchema>;
