import { describe, expect, it } from 'vitest';
import {
  cautionNear,
  earlierFlagEvents,
  flagDataUrl,
  lapNotesUrl,
  parseFlagData,
  parseLapNotes,
} from '../../src/data/feeds/raceNotes.ts';
import { flagFromCode } from '../../src/data/model/flags.ts';
import type { TimedEvent } from '../../src/data/sessionHistory.ts';

// Rows as served for Cup race 5630 (South Point 400), trimmed.
const flagData = [
  { lap_number: 0, flag_state: 8, elapsed_time: 0, comment: null, beneficiary: null },
  { lap_number: 0, flag_state: 1, elapsed_time: 0, comment: null, beneficiary: null },
  {
    lap_number: 43,
    flag_state: 2,
    comment: '#38 Spin Turn 4',
    beneficiary: '',
    time_of_day_os: '2026-10-04T15:03:38.817-04:00',
  },
  { lap_number: 48, flag_state: 1, comment: null, beneficiary: null },
  { lap_number: 80, flag_state: 2, comment: 'Stage 1 Conclusion', beneficiary: '1    ' },
  { lap_number: 92, flag_state: 2, comment: 'Debris Pit Entry', beneficiary: '21   ' },
  { lap_number: 'x', flag_state: 2, comment: 'bad row' },
];

const lapNotes = {
  laps: {
    '0': [{ FlagState: 1, Note: 'To the rear: #4 and #21', NoteID: 67842, DriverIDs: [4224] }],
    '44': [
      { FlagState: 2, Note: 'Caution: #38 spins in turn 4.', NoteID: 67853, DriverIDs: [4272] },
    ],
    '45': [
      { FlagState: 2, Note: 'All lead lap cars pit ', NoteID: 67854, DriverIDs: [] },
      { FlagState: 2, Note: '', NoteID: 67855, DriverIDs: [] },
      { Note: 'missing id' },
    ],
  },
};

describe('race notes feeds', () => {
  it('builds the feed URLs', () => {
    expect(flagDataUrl(1, 5630)).toBe(
      'https://cf.nascar.com/live/feeds/series_1/5630/live-flag-data.json',
    );
    expect(lapNotesUrl(2026, 1, 5630)).toBe(
      'https://cf.nascar.com/cacher/2026/1/5630/lap-notes.json',
    );
  });

  it('parses every flag change, with reasons and free passes for cautions', () => {
    const changes = parseFlagData(flagData);
    expect(changes.map((c) => [c.lap, c.code])).toEqual([
      [0, 8],
      [0, 1],
      [43, 2],
      [48, 1],
      [80, 2],
      [92, 2],
    ]);
    expect(changes[2]).toEqual({
      lap: 43,
      code: 2,
      at: Date.parse('2026-10-04T19:03:38.817Z'),
      reason: '#38 Spin Turn 4',
      freePass: null,
    });
    expect(changes[4]).toMatchObject({ at: null, reason: 'Stage 1 Conclusion', freePass: '1' });
    expect(changes[5]).toMatchObject({ reason: 'Debris Pit Entry', freePass: '21' });
    expect(parseFlagData({})).toEqual([]);
  });

  it('lists lap notes newest lap first, dropping empty and broken notes', () => {
    expect(parseLapNotes(lapNotes)).toEqual([
      { id: 67854, lap: 45, flagCode: 2, text: 'All lead lap cars pit' },
      { id: 67853, lap: 44, flagCode: 2, text: 'Caution: #38 spins in turn 4.' },
      { id: 67842, lap: 0, flagCode: 1, text: 'To the rear: #4 and #21' },
    ]);
    expect(parseLapNotes(null)).toEqual([]);
  });

  it('matches a caution event to the nearest reported caution', () => {
    const cautions = parseFlagData(flagData);
    expect(cautionNear(cautions, 44)?.reason).toBe('#38 Spin Turn 4');
    expect(cautionNear(cautions, 93)?.reason).toBe('Debris Pit Entry');
    expect(cautionNear(cautions, 120)).toBeNull();
  });

  describe('earlierFlagEvents', () => {
    const changes = parseFlagData(flagData);
    const flagEvent = (id: number, lap: number, code: number): TimedEvent => ({
      id,
      at: 1,
      event: { kind: 'flag', lap, flag: flagFromCode(code) },
    });
    const flagsOf = (events: TimedEvent[]) =>
      events.map(({ event }) => [event.lap, event.kind === 'flag' ? event.flag.kind : event.kind]);

    it('fills in the whole race when nothing was seen', () => {
      expect(flagsOf(earlierFlagEvents(changes, []))).toEqual([
        [92, 'yellow'],
        [80, 'yellow'],
        [48, 'green'],
        [43, 'yellow'],
        [0, 'green'],
        [0, 'warmup'],
      ]);
    });

    it('fills in only what came before the first seen event, skipping flags already seen', () => {
      // Opened under the lap-80 caution: the board saw it on lap 81, then green on 86.
      const seen = [flagEvent(2, 86, 1), flagEvent(1, 81, 2)];
      const earlier = earlierFlagEvents(changes, seen);
      expect(flagsOf(earlier)).toEqual([
        [48, 'green'],
        [43, 'yellow'],
        [0, 'green'],
        [0, 'warmup'],
      ]);
      expect(earlier.every((e) => e.id < 0)).toBe(true);
    });
  });
});
