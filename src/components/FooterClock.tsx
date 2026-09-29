import { Clock, RefreshCw, Timer } from 'lucide-react';
import { useNow } from '../hooks/useNow.ts';

interface Props {
  /** Epoch ms of the last successful feed update, if any. */
  lastUpdated: number | null;
  /** TV delay in seconds; shown only when non-zero. */
  delaySeconds: number;
}

const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit' };
const ICON = { size: '1.1em', strokeWidth: 2, 'aria-hidden': true } as const;

/** Current local time, when the feed last updated, and any TV delay, for the footer. */
export function FooterClock({ lastUpdated, delaySeconds }: Props) {
  const now = useNow(1000);
  return (
    <span className="footer-clock">
      {delaySeconds > 0 && (
        <span
          className="footer-clock__item"
          title="TV delay: the board is held back to match your broadcast"
        >
          <Timer {...ICON} />
          <span className="visually-hidden">TV delay </span>
          {delaySeconds}s
        </span>
      )}
      <span className="footer-clock__item" title="Current time">
        <Clock {...ICON} />
        <span className="visually-hidden">Current time </span>
        {new Date(now).toLocaleTimeString([], TIME)}
      </span>
      <span className="footer-clock__item" title="Last successful update from the feed">
        <RefreshCw {...ICON} />
        <span className="visually-hidden">Last updated </span>
        {lastUpdated === null ? '—' : new Date(lastUpdated).toLocaleTimeString([], TIME)}
      </span>
    </span>
  );
}
