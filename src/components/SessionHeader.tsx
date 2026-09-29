import { Timer } from 'lucide-react';
import type { Session } from '../data/model/types.ts';
import type { PollStatus } from '../data/polling/poller.ts';
import { ConnectionStatus } from './ConnectionStatus.tsx';

interface Props {
  session: Session;
  status: PollStatus;
  lastChanged: number | null;
  nextPollAt: number | null;
  /** Dev replay indicator, so a recording is never mistaken for live timing. */
  replayLabel?: string | null;
  /** TV delay in seconds; shown as a tag when non-zero. */
  delaySeconds?: number;
}

export function SessionHeader({
  session,
  status,
  lastChanged,
  nextPollAt,
  replayLabel,
  delaySeconds = 0,
}: Props) {
  const { stage, cautions } = session;
  return (
    <header className="session-header">
      <div className="session-header__title">
        <span className="session-header__series">{session.series.name}</span>
        <h1 className="session-header__race">{session.runName || 'Unnamed session'}</h1>
        {session.track.name && <span className="session-header__track">{session.track.name}</span>}
      </div>
      <div className="session-header__stats">
        {stage?.number != null && (
          <Stat
            label="Stage"
            value={`${stage.number}${stage.endLap ? ` · ends L${stage.endLap}` : ''}`}
          />
        )}
        <Stat label="Cautions" value={`${cautions.segments} (${cautions.laps} laps)`} />
        <Stat label="Lead changes" value={`${session.leadChanges} (${session.leaders} leaders)`} />
        {replayLabel && <span className="replay-badge">{replayLabel}</span>}
        {delaySeconds > 0 && (
          <span
            className="delay-badge"
            title="TV delay: the board is held back to match your broadcast"
          >
            <Timer size="1em" aria-hidden="true" />
            Delayed {delaySeconds}s
          </span>
        )}
        <ConnectionStatus
          status={status}
          hasData
          lastChanged={lastChanged}
          nextPollAt={nextPollAt}
        />
      </div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="stat">
      <span className="stat__label">{label}</span> {value}
    </span>
  );
}
