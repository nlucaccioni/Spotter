import { CloudOff, LoaderCircle, RefreshCw } from 'lucide-react';
import type { PollStatus } from '../data/polling/poller.ts';
import { useNow } from '../hooks/useNow.ts';
import { formatDuration } from './board/format.ts';

interface Props {
  status: PollStatus;
  error: Error | null;
  nextPollAt: number | null;
  onRetry: () => void;
}

/** Full-screen state before any data has arrived: connecting, or the feed can't be reached. */
export function FeedStatusScreen({ status, error, nextPollAt, onRetry }: Props) {
  const now = useNow();
  const failed = status === 'error';

  if (!failed) {
    return (
      <main className="feed-status" aria-busy="true">
        <LoaderCircle className="feed-status__icon feed-status__icon--spin" aria-hidden="true" />
        <h1>Connecting to NASCAR live timing…</h1>
      </main>
    );
  }

  const retryIn = nextPollAt === null ? null : Math.max(0, nextPollAt - now);
  return (
    <main className="feed-status" role="alert">
      <CloudOff className="feed-status__icon" aria-hidden="true" />
      <h1>Can’t reach NASCAR’s live timing feed</h1>
      <p className="feed-status__text">
        You may be offline, NASCAR’s servers may be having trouble, or the feed may have changed.
        The board keeps trying on its own
        {retryIn === null ? '.' : ` — next try in ${formatDuration(retryIn)}.`}
      </p>
      <button type="button" className="feed-status__retry" onClick={onRetry}>
        <RefreshCw size="1em" aria-hidden="true" />
        Retry now
      </button>
      {error && <p className="feed-status__detail">{error.message}</p>}
    </main>
  );
}
