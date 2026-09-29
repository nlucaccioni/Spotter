import type { PollStatus } from '../data/polling/poller.ts';
import { useNow } from '../hooks/useNow.ts';
import { formatAgo, formatDuration } from './board/format.ts';

interface Props {
  status: PollStatus;
  hasData: boolean;
  lastChanged: number | null;
  nextPollAt: number | null;
}

/** Short label announced to screen readers; only changes when the status itself changes. */
const ANNOUNCED: Record<PollStatus, string> = {
  connecting: 'Connecting',
  live: 'Live',
  idle: 'Not live, showing last session',
  error: 'Connection issue',
  paused: 'Paused',
};

export function ConnectionStatus({ status, hasData, lastChanged, nextPollAt }: Props) {
  const now = useNow();
  const retryIn = nextPollAt === null ? null : Math.max(0, nextPollAt - now);

  let label: string;
  switch (status) {
    case 'connecting':
      label = 'Connecting…';
      break;
    case 'live':
      label = lastChanged === null ? 'Live' : `Live · updated ${formatAgo(now - lastChanged)}`;
      break;
    case 'idle':
      label = 'Not live — showing last session';
      break;
    case 'error':
      label = `${hasData ? 'Connection issue' : 'Can’t reach the NASCAR feed'}${
        retryIn === null ? '' : ` · retrying in ${formatDuration(retryIn)}`
      }`;
      break;
    case 'paused':
      label = 'Paused';
      break;
  }

  return (
    <div className={`connection connection--${status}`}>
      <span className="connection__dot" aria-hidden="true" />
      {/* The visible text ticks every second; screen readers only hear status changes. */}
      <span aria-hidden="true">{label}</span>
      <span className="visually-hidden" role="status">
        {ANNOUNCED[status]}
      </span>
    </div>
  );
}
