import { z } from 'zod';
import { flagFromCode } from '../model/flags.ts';
import type { TimedEvent } from '../sessionHistory.ts';

// Caution reasons and lap-by-lap notes (CORS: *, see docs/feed-notes.md, 2026-10-11). Only
// fetched while the event log is open. Parsed tolerantly: bad rows are dropped individually.

/** One entry per flag change; cautions carry a short reason and the free-pass car. */
export function flagDataUrl(seriesId: number, raceId: number): string {
  return `https://cf.nascar.com/live/feeds/series_${seriesId}/${raceId}/live-flag-data.json`;
}

/** Written commentary, keyed by lap. */
export function lapNotesUrl(year: number, seriesId: number, raceId: number): string {
  return `https://cf.nascar.com/cacher/${year}/${seriesId}/${raceId}/lap-notes.json`;
}

const YELLOW = 2;

export interface FlagChange {
  lap: number;
  /** Raw `flag_state`. */
  code: number;
  /** Epoch ms parsed from `time_of_day_os`. */
  at: number | null;
  /** Cautions only, e.g. "#38 Spin Turn 4", "Stage 1 Conclusion"; otherwise empty. */
  reason: string;
  /** Car number given the free pass, once known. */
  freePass: string | null;
}

export interface LapNote {
  id: number;
  lap: number;
  /** Raw `FlagState` at the time of the note. */
  flagCode: number | null;
  text: string;
}

const optionalText = z
  .string()
  .nullable()
  .catch(null)
  .transform((s) => s?.trim() || null);

const flagSchema = z.object({
  lap_number: z.number().int().nonnegative(),
  flag_state: z.number().int(),
  comment: optionalText,
  beneficiary: optionalText,
  time_of_day_os: optionalText,
});

/** Every flag change, in race order. */
export function parseFlagData(raw: unknown): FlagChange[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const result = flagSchema.safeParse(item);
    if (!result.success) return [];
    const { lap_number, flag_state, comment, beneficiary, time_of_day_os } = result.data;
    const at = time_of_day_os ? Date.parse(time_of_day_os) : NaN;
    return [
      {
        lap: lap_number,
        code: flag_state,
        at: Number.isNaN(at) ? null : at,
        reason: flag_state === YELLOW ? (comment ?? '') : '',
        freePass: flag_state === YELLOW ? beneficiary : null,
      },
    ];
  });
}

const noteSchema = z.object({
  NoteID: z.number().int(),
  FlagState: z.number().int().nullable().catch(null),
  Note: z.string().transform((s) => s.trim()),
});

/** Newest first; notes on the same lap keep the feed's order. */
export function parseLapNotes(raw: unknown): LapNote[] {
  const laps = z.object({ laps: z.record(z.string(), z.unknown()) }).safeParse(raw);
  if (!laps.success) return [];
  const notes = Object.entries(laps.data.laps).flatMap(([key, items]) => {
    const lap = Number(key);
    if (!Number.isInteger(lap) || lap < 0 || !Array.isArray(items)) return [];
    return items.flatMap((item) => {
      const result = noteSchema.safeParse(item);
      if (!result.success || !result.data.Note) return [];
      const { NoteID, FlagState, Note } = result.data;
      return [{ id: NoteID, lap, flagCode: FlagState, text: Note }];
    });
  });
  return notes.sort((a, b) => b.lap - a.lap);
}

/** The flag feed and the board can disagree on a flag change's lap by a lap or two. */
const LAP_SLACK = 3;

/**
 * The caution reported in the flag feed for a caution event seen on `lap`: the nearest one
 * within a few laps.
 */
export function cautionNear(changes: readonly FlagChange[], lap: number): FlagChange | null {
  let best: FlagChange | null = null;
  for (const change of changes) {
    if (change.code !== YELLOW) continue;
    const distance = Math.abs(change.lap - lap);
    if (distance <= LAP_SLACK && (!best || distance < Math.abs(best.lap - lap))) best = change;
  }
  return best;
}

/**
 * Flag events from before the app started watching (e.g. the page was opened mid-race), built
 * from the flag feed, newest first. A change counts as seen when the history has the same flag
 * within a few laps, and nothing after the history's first event is filled in. Ids are
 * negative so they never collide with the history's.
 */
export function earlierFlagEvents(
  changes: readonly FlagChange[],
  events: readonly TimedEvent[],
): TimedEvent[] {
  const seen = events.flatMap(({ event }) => (event.kind === 'flag' ? [event] : []));
  const firstLap = events.at(-1)?.event.lap ?? Infinity;
  return changes
    .flatMap((change, index) => {
      const flag = flagFromCode(change.code);
      if (flag.kind === 'unknown' || change.lap > firstLap) return [];
      const matched = seen.some(
        (e) => e.flag.kind === flag.kind && Math.abs(e.lap - change.lap) <= LAP_SLACK,
      );
      if (matched) return [];
      return [
        {
          id: -(index + 1),
          at: change.at ?? 0,
          event: { kind: 'flag' as const, lap: change.lap, flag },
        },
      ];
    })
    .reverse();
}
