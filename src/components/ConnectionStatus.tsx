import type { PollStatus } from '../data/polling/poller.ts';
import { useNow } from '../hooks/useNow.ts';

interface Props {
  status: PollStatus;
  hasData: boolean;
  lastChanged: number | null;
  nextPollAt: number | null;
}

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
    <div className={`connection connection--${status}`} role="status">
      <span className="connection__dot" aria-hidden="true" />
      {label}
    </div>
  );
}

function formatAgo(ms: number): string {
  return ms < 5_000 ? 'just now' : `${formatDuration(ms)} ago`;
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
