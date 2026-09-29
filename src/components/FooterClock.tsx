import { Clock, RefreshCw } from 'lucide-react';
import { useNow } from '../hooks/useNow.ts';

interface Props {
  /** Epoch ms of the last successful feed update, if any. */
  lastUpdated: number | null;
}

const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit' };
const ICON = { size: '1.1em', strokeWidth: 2, 'aria-hidden': true } as const;

/** Current local time and when the feed last updated, for the footer. */
export function FooterClock({ lastUpdated }: Props) {
  const now = useNow(1000);
  return (
    <span className="footer-clock">
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
