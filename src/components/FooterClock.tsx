import { useNow } from '../hooks/useNow.ts';

interface Props {
  /** Epoch ms of the last successful feed update, if any. */
  lastUpdated: number | null;
}

const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit' };

/** Current local time and when the feed last updated, for the footer. */
export function FooterClock({ lastUpdated }: Props) {
  const now = useNow(1000);
  return (
    <span className="footer-clock">
      <span title="Current time">{new Date(now).toLocaleTimeString([], TIME)}</span>
      <span title="Last successful update from the feed">
        <span className="footer-clock__label">Updated</span>{' '}
        {lastUpdated === null ? '—' : new Date(lastUpdated).toLocaleTimeString([], TIME)}
      </span>
    </span>
  );
}
