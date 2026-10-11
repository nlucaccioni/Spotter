import { describeEvent } from '../data/model/diff.ts';
import type { TimedEvent } from '../data/sessionHistory.ts';
import { eventClass } from './eventClass.ts';

interface Props {
  events: TimedEvent[];
  onOpenLog: () => void;
}

/** Compact strip of recent race events, newest first. Opens the full log when clicked. */
export function EventTicker({ events, onOpenLog }: Props) {
  return (
    <button
      type="button"
      className="ticker"
      aria-label={`Recent events. Show all ${events.length} events`}
      onClick={onOpenLog}
    >
      <span className="ticker__list">
        {events.length === 0 ? (
          <span className="muted">No events yet</span>
        ) : (
          events.slice(0, 12).map(({ id, event }) => (
            <span key={id} className={`ticker__item ${eventClass(event)}`}>
              <span className="ticker__lap">L{event.lap}</span>
              {describeEvent(event)}
            </span>
          ))
        )}
      </span>
      <span className="ticker__more">All events ›</span>
    </button>
  );
}
