import { useEffect, useMemo, useRef, useState } from 'react';
import {
  cautionNear,
  earlierFlagEvents,
  flagDataUrl,
  lapNotesUrl,
  parseFlagData,
  parseLapNotes,
  type FlagChange,
} from '../data/feeds/raceNotes.ts';
import { describeEvent, type RaceEvent } from '../data/model/diff.ts';
import type { Session } from '../data/model/types.ts';
import type { TimedEvent } from '../data/sessionHistory.ts';
import { usePolledFeed } from '../hooks/usePolledFeed.ts';

interface Props {
  events: TimedEvent[];
  /** The session on the board (after the TV delay). */
  session: Session | null;
  delaySeconds: number;
  onClose: () => void;
}

type Filter = 'all' | 'flags' | 'leaders' | 'pits' | 'other' | 'notes';

const FILTERS: readonly (readonly [Filter, string])[] = [
  ['all', 'All'],
  ['flags', 'Flags'],
  ['leaders', 'Lead'],
  ['pits', 'Pits'],
  ['other', 'Other'],
  ['notes', 'Notes'],
];

const FILTER_KINDS: Record<Exclude<Filter, 'all' | 'notes'>, readonly RaceEvent['kind'][]> = {
  flags: ['flag'],
  leaders: ['lead-change'],
  pits: ['pit-in', 'pit-out'],
  other: ['out', 'dvp', 'fastest-lap'],
};

const YELLOW = 2;
const POLL = { intervalMs: 15_000 };

const TIME = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});

/**
 * Full, scrollable list of this session's events, newest first. Caution reasons and lap notes
 * come from extra feeds that are only polled while the log is open.
 */
export function EventLog({ events, session, delaySeconds, onClose }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const seriesId = session?.series.id ?? null;
  const raceId = session?.raceId ?? null;
  const [currentYear] = useState(() => new Date().getFullYear());
  const year = session?.updatedAtMs ? new Date(session.updatedAtMs).getFullYear() : currentYear;
  const lap = session?.lap ?? 0;
  const known = seriesId !== null && raceId !== null;

  const flagData = usePolledFeed(known ? flagDataUrl(seriesId, raceId) : null, parseFlagData, {
    ...POLL,
    delaySeconds,
  });
  const lapNotes = usePolledFeed(
    known && filter === 'notes' ? lapNotesUrl(year, seriesId, raceId) : null,
    parseLapNotes,
    { ...POLL, delaySeconds },
  );

  // Never show what the board hasn't reached yet (matters for replays, where the feeds are
  // final). Notes tend to be filed against the lap after the board's, hence the one lap of slack.
  const flagChanges = useMemo(
    () => (flagData.data ?? []).filter((c) => c.lap <= lap),
    [flagData.data, lap],
  );
  const notes = useMemo(
    () => (lapNotes.data ?? []).filter((n) => n.lap <= lap + 1),
    [lapNotes.data, lap],
  );

  // Flags from before the page was opened come from the flag feed.
  const allEvents = useMemo(
    () => [...events, ...earlierFlagEvents(flagChanges, events)],
    [events, flagChanges],
  );

  const shown =
    filter === 'all' || filter === 'notes'
      ? allEvents
      : allEvents.filter((e) => FILTER_KINDS[filter].includes(e.event.kind));

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer event-log"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-log-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="drawer__header">
          <h2 id="event-log-title">Race events</h2>
          <button ref={closeRef} type="button" className="drawer__close" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="segmented-control" role="group" aria-label="Show events">
          {FILTERS.map(([option, text]) => (
            <button
              key={option}
              type="button"
              className="segmented-control__option"
              aria-pressed={option === filter}
              onClick={() => setFilter(option)}
            >
              {text}
            </button>
          ))}
        </div>

        {filter === 'notes' ? (
          notes.length === 0 ? (
            <p className="drawer__hint event-log__empty">
              {!known
                ? 'No notes for this session'
                : lapNotes.error && !lapNotes.data
                  ? "Couldn't load lap notes"
                  : lapNotes.data
                    ? 'No notes yet'
                    : 'Loading notes…'}
            </p>
          ) : (
            <ol className="event-log__list">
              {notes.map((note) => (
                <li
                  key={note.id}
                  className={`event-log__item${note.flagCode === YELLOW ? ' ticker__item--flag' : ''}`}
                >
                  <span className="ticker__lap">L{note.lap}</span>
                  <span className="event-log__text">{note.text}</span>
                </li>
              ))}
            </ol>
          )
        ) : shown.length === 0 ? (
          <p className="drawer__hint event-log__empty">No events yet</p>
        ) : (
          <ol className="event-log__list">
            {shown.map(({ id, at, event }) => (
              <li key={id} className={`event-log__item ticker__item--${event.kind}`}>
                <span className="ticker__lap">L{event.lap}</span>
                <span className="event-log__text">
                  {describeEvent(event)}
                  <CautionDetail event={event} flagChanges={flagChanges} />
                </span>
                {at > 0 && (
                  <time className="event-log__time" dateTime={new Date(at).toISOString()}>
                    {TIME.format(at)}
                  </time>
                )}
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}

function CautionDetail({ event, flagChanges }: { event: RaceEvent; flagChanges: FlagChange[] }) {
  if (event.kind !== 'flag' || event.flag.kind !== 'yellow') return null;
  const caution = cautionNear(flagChanges, event.lap);
  const parts = [caution?.reason, caution?.freePass && `Free pass #${caution.freePass}`];
  const text = parts.filter(Boolean).join(' · ');
  return text ? <span className="event-log__detail">{text}</span> : null;
}
