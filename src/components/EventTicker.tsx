import { describeEvent } from '../data/model/diff.ts';
import type { TimedEvent } from '../data/sessionHistory.ts';

interface Props {
  events: TimedEvent[];
}

/** Compact strip of recent race events, newest first. */
export function EventTicker({ events }: Props) {
  return (
    <div className="ticker" aria-label="Recent events">
      {events.length === 0 ? (
        <span className="muted">No events yet</span>
      ) : (
        <ol className="ticker__list">
          {events.slice(0, 12).map(({ id, event }) => (
            <li key={id} className={`ticker__item ticker__item--${event.kind}`}>
              <span className="ticker__lap">L{event.lap}</span>
              {describeEvent(event)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
