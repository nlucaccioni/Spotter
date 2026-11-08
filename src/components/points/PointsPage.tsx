import { useEffect, useMemo, useState } from 'react';
import { parseLivePoints, parseSeasonPoints, seasonPointsUrl } from '../../data/feeds/points.ts';
import { SERIES_IDS, SERIES_SHORT } from '../../data/feeds/schedule.ts';
import { seriesFromId } from '../../data/model/lookups.ts';
import type { Manufacturer, Session } from '../../data/model/types.ts';
import { useCarBadges } from '../../hooks/useCarBadges.ts';
import { useMfrLogos } from '../../hooks/useMfrLogos.ts';
import { useTeamLogos } from '../../hooks/useTeamLogos.ts';
import { useTeamNames } from '../../hooks/useTeamNames.ts';
import { usePolledFeed, type PolledFeed } from '../../hooks/usePolledFeed.ts';
import { usePreferences } from '../../hooks/usePreferences.ts';
import { teamDisplayFor } from '../../prefs/preferences.ts';
import { LivePointsTable } from './LivePointsTable.tsx';
import { SeasonStandingsTable } from './SeasonStandingsTable.tsx';
import { Segmented } from '../Segmented.tsx';

type Tab = 'live' | 'season';

interface Props {
  /** The newest live session, if any. Nothing here is delayed: the TV delay only applies to the
   * live timing. */
  session: Session | null;
  /** Live points for the race the board is following; null while that's being worked out. */
  livePointsUrl: string | null;
  /** Told which series the page is showing, so settings can offer that series' options. */
  onSeriesShown?: (seriesId: number) => void;
}

/** Live race points and season standings (PROJECT_BRIEF.md "Later milestones"). */
export function PointsPage({ session, livePointsUrl, onSeriesShown }: Props) {
  const [prefs] = usePreferences();
  const [tab, setTab] = useState<Tab>('live');
  const liveSeries = session?.series.id ?? 1;
  const [pickedSeries, setPickedSeries] = useState<number | null>(null);
  const seasonSeries = tab === 'season' ? (pickedSeries ?? liveSeries) : liveSeries;
  const [currentYear] = useState(() => new Date().getFullYear());
  const year = session?.updatedAtMs ? new Date(session.updatedAtMs).getFullYear() : currentYear;

  const live = usePolledFeed(tab === 'live' ? livePointsUrl : null, parseLivePoints, {
    intervalMs: 15_000,
  });
  const season = usePolledFeed(
    tab === 'season' ? seasonPointsUrl(year, seasonSeries) : null,
    parseSeasonPoints,
    { intervalMs: 120_000 },
  );

  const favorites = useMemo(() => new Set(prefs.favorites), [prefs.favorites]);
  const badgeFor = useCarBadges(prefs.showCarBadges, tab === 'live' ? liveSeries : seasonSeries);
  // The live points feed has no manufacturer; take it from the live feed.
  const manufacturers = useMemo(
    () =>
      new Map<number, Manufacturer>(
        session?.cars.flatMap((c) => (c.driverId === null ? [] : [[c.driverId, c.manufacturer]])),
      ),
    [session],
  );
  const inRace = useMemo(
    () => new Set(session?.cars.flatMap((c) => (c.driverId === null ? [] : [c.driverId]))),
    [session],
  );
  const mfrLogoFor = useMfrLogos(prefs.showMfrLogos);

  // Drivers the tables show (see their row filters), so the team search knows when to stop.
  const shownDriverIds = useMemo(() => {
    const rows =
      tab === 'live'
        ? (live.data ?? []).filter(
            (e) => e.points > 0 || (e.driverId !== null && inRace.has(e.driverId)),
          )
        : (season.data ?? []).filter((s) => s.points > 0 || s.starts > 0);
    return rows.flatMap((r) => (r.driverId === null ? [] : [r.driverId]));
  }, [tab, live.data, season.data, inRace]);
  const teams = useTeamNames({
    year,
    seriesId: tab === 'live' ? liveSeries : seasonSeries,
    // The live tab starts from the race on the board; the season tab from the latest weekend.
    raceId: tab === 'live' ? (session?.raceId ?? null) : null,
    driverIds: shownDriverIds,
    enabled: (tab === 'live' ? live.data : season.data) !== null,
  });
  const shownSeries = tab === 'live' ? liveSeries : seasonSeries;
  useEffect(() => onSeriesShown?.(shownSeries), [onSeriesShown, shownSeries]);
  const teamDisplay = teamDisplayFor(prefs, shownSeries);
  const teamLogoFor = useTeamLogos(teamDisplay === 'logo', year, prefs.theme);

  const feed = tab === 'live' ? live : season;
  const subtitle =
    tab === 'live'
      ? session
        ? `${session.series.name} · ${session.runName}${session.track.name ? ` · ${session.track.name}` : ''}`
        : 'Live race'
      : `${year} ${seriesFromId(seasonSeries).name}`;

  return (
    <main className="points">
      <header className="points__header">
        <div className="points__title">
          <h1>Points</h1>
          <span className="muted">{subtitle}</span>
        </div>
        {/* The view tabs always sit at the far right; the series picker goes to their left. */}
        <div className="points__controls">
          {tab === 'season' && (
            <Segmented
              label="Series"
              options={SERIES_IDS.map((id) => [id, SERIES_SHORT[id]] as const)}
              value={seasonSeries}
              onChange={setPickedSeries}
            />
          )}
          <Segmented
            label="View"
            options={[
              ['live', 'Live race'],
              ['season', 'Season'],
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </header>

      <FeedState feed={feed} />

      <div className="points__body">
        {tab === 'live' && live.data && (
          <LivePointsTable
            entries={live.data}
            inRace={inRace}
            favorites={favorites}
            manufacturers={manufacturers}
            teams={teams}
            teamDisplay={teamDisplay}
            teamLogoFor={teamLogoFor}
            badgeFor={badgeFor}
            mfrLogoFor={mfrLogoFor}
          />
        )}
        {tab === 'season' && season.data && (
          <SeasonStandingsTable
            standings={season.data}
            favorites={favorites}
            teams={teams}
            teamDisplay={teamDisplay}
            teamLogoFor={teamLogoFor}
            badgeFor={badgeFor}
            mfrLogoFor={mfrLogoFor}
          />
        )}
      </div>
    </main>
  );
}

/** Loading, error and empty messages for a points feed. */
function FeedState({ feed }: { feed: PolledFeed<unknown[]> }) {
  if (feed.status === 'error') {
    return (
      <div className="points__message" role="alert">
        {feed.data
          ? 'Connection issue — showing the last points received.'
          : 'Can’t reach NASCAR’s points feed.'}{' '}
        <button type="button" className="drawer__link" onClick={feed.retry}>
          Retry
        </button>
      </div>
    );
  }
  if (!feed.data) return <p className="points__message">Loading points…</p>;
  if (feed.data.length === 0) return <p className="points__message">No points available yet.</p>;
  return null;
}
