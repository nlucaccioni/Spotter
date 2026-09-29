import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useNow } from '../hooks/useNow.ts';
import { formatDuration } from './board/format.ts';

interface Props {
  /** Epoch ms of the last good data on screen. */
  lastUpdated: number | null;
  nextPollAt: number | null;
  onRetry: () => void;
}

const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit' };

/** Shown above the table while the feed is failing, so old data isn't mistaken for live. */
export function StaleNotice({ lastUpdated, nextPollAt, onRetry }: Props) {
  const now = useNow();
  const retryIn = nextPollAt === null ? null : Math.max(0, nextPollAt - now);
  return (
    <div className="stale-notice" role="alert">
      <TriangleAlert size="1.1em" aria-hidden="true" />
      <span className="stale-notice__text">
        Connection issue — showing data from{' '}
        {lastUpdated === null
          ? 'earlier'
          : `${new Date(lastUpdated).toLocaleTimeString([], TIME)} (${formatDuration(now - lastUpdated)} old)`}
        {retryIn !== null && `. Retrying in ${formatDuration(retryIn)}.`}
      </span>
      <button type="button" className="stale-notice__retry" onClick={onRetry}>
        <RefreshCw size="1em" aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}
