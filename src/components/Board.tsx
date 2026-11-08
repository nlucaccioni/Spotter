import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import type { Session } from '../data/model/types.ts';
import type { PollStatus } from '../data/polling/poller.ts';
import { useElementSize } from '../hooks/useElementSize.ts';
import { useCarBadges } from '../hooks/useCarBadges.ts';
import { useMfrLogos } from '../hooks/useMfrLogos.ts';
import { useTeamLogos } from '../hooks/useTeamLogos.ts';
import { useTeamNames } from '../hooks/useTeamNames.ts';
import { usePreferences } from '../hooks/usePreferences.ts';
import { teamDisplayFor, toggleInList } from '../prefs/preferences.ts';
import { computeBoardLayout, TEAM_WIDTH_EM } from './board/layout.ts';
import { FlagBanner } from './FlagBanner.tsx';
import { SessionHeader } from './SessionHeader.tsx';
import { StaleNotice } from './StaleNotice.tsx';
import { TimingTable } from './TimingTable.tsx';

interface Props {
  session: Session;
  status: PollStatus;
  lastChanged: number | null;
  nextPollAt: number | null;
  replayLabel: string | null;
  positionChanges: Map<string, number> | null;
  updateId: number;
  outLaps: ReadonlySet<string>;
  lastUpdated: number | null;
  onRetry: () => void;
}

/**
 * Flag banner, session header and timing table. The banner is sized as one more table row, so
 * rows are fitted to the height shared by the banner and the table (the header's height doesn't
 * depend on row size, so there's no feedback loop).
 */
export function Board({
  session,
  replayLabel,
  positionChanges,
  updateId,
  outLaps,
  lastUpdated,
  onRetry,
  ...status
}: Props) {
  const [prefs, updatePrefs] = usePreferences();
  // The Team column is opt-in, separate from the hide-a-column switches.
  const hidden = useMemo(
    () => new Set([...prefs.hiddenColumns, ...(prefs.showTeamColumn ? [] : ['team' as const])]),
    [prefs.hiddenColumns, prefs.showTeamColumn],
  );
  const teamDisplay = teamDisplayFor(prefs, session.series.id);
  const widths = useMemo(() => ({ team: TEAM_WIDTH_EM[teamDisplay] }), [teamDisplay]);
  const favorites = useMemo(() => new Set(prefs.favorites), [prefs.favorites]);
  const toggleFavorite = useCallback(
    (key: string) => updatePrefs((p) => ({ favorites: toggleInList(p.favorites, key) })),
    [updatePrefs],
  );

  const badgeFor = useCarBadges(prefs.showCarBadges, session.series.id);
  const mfrLogoFor = useMfrLogos(prefs.showMfrLogos);
  const driverIds = useMemo(
    () => session.cars.flatMap((c) => (c.driverId === null ? [] : [c.driverId])),
    [session.cars],
  );
  const [currentYear] = useState(() => new Date().getFullYear());
  const year = session.updatedAtMs ? new Date(session.updatedAtMs).getFullYear() : currentYear;
  const teams = useTeamNames({
    year,
    seriesId: session.series.id ?? 0,
    raceId: session.raceId,
    driverIds,
    enabled: prefs.showTeamColumn,
  });
  const teamLogoFor = useTeamLogos(
    prefs.showTeamColumn && teamDisplay === 'logo',
    year,
    prefs.theme,
  );

  const [boardRef, board] = useElementSize<HTMLDivElement>();
  const [headerRef, header] = useElementSize<HTMLDivElement>();

  const carCount = session.cars.length;
  const layout = useMemo(
    () =>
      board && header
        ? computeBoardLayout(board.width, board.height - header.height, carCount, {
            extraRows: 1,
            hidden,
            widths,
          })
        : null,
    [board, header, carCount, hidden, widths],
  );

  const style = layout
    ? ({
        '--row-h': `${layout.rowHeightPx}px`,
        '--row-font': `${layout.fontSizePx}px`,
      } as CSSProperties)
    : undefined;

  return (
    <div ref={boardRef} className="board" style={style}>
      <FlagBanner
        flag={session.flag}
        lap={session.lap}
        lapsInRace={session.lapsInRace}
        lapsToGo={session.lapsToGo}
      />
      <div ref={headerRef}>
        <SessionHeader session={session} replayLabel={replayLabel} {...status} />
        {status.status === 'error' && (
          <StaleNotice lastUpdated={lastUpdated} nextPollAt={status.nextPollAt} onRetry={onRetry} />
        )}
      </div>
      <main className="app__main">
        <TimingTable
          session={session}
          positionChanges={positionChanges}
          updateId={updateId}
          layout={layout}
          favorites={favorites}
          pinFavorites={prefs.pinFavorites}
          onToggleFavorite={toggleFavorite}
          outLaps={outLaps}
          badgeFor={badgeFor}
          mfrLogoFor={mfrLogoFor}
          teams={teams}
          teamDisplay={teamDisplay}
          teamLogoFor={teamLogoFor}
        />
      </main>
    </div>
  );
}
