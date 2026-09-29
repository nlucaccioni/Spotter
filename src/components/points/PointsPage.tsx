import { useMemo, useState } from 'react';
import {
  LIVE_POINTS_URL,
  parseLivePoints,
  parseSeasonPoints,
  seasonPointsUrl,
} from '../../data/feeds/points.ts';
import { seriesFromId } from '../../data/model/lookups.ts';
import type { Manufacturer, Session } from '../../data/model/types.ts';
import { useCarBadges } from '../../hooks/useCarBadges.ts';
import { usePolledFeed, type PolledFeed } from '../../hooks/usePolledFeed.ts';
import { usePreferences } from '../../hooks/usePreferences.ts';
import { formatDuration } from '../board/format.ts';
import { useNow } from '../../hooks/useNow.ts';
import { LivePointsTable } from './LivePointsTable.tsx';
import { SeasonStandingsTable } from './SeasonStandingsTable.tsx';

type Tab = 'live' | 'season';

const SERIES_IDS = [1, 2, 3] as const;
const SERIES_SHORT: Record<number, string> = { 1: 'Cup', 2: "O'Reilly", 3: 'Truck' };

interface Props {
  /** The live session on the board (after the TV delay), if any. */
  session: Session | null;
  delaySeconds: number;
}

/** Live race points and season standings (PROJECT_BRIEF.md "Later milestones"). */
export function PointsPage({ session, delaySeconds }: Props) {
  const [prefs] = usePreferences();
  const [tab, setTab] = useState<Tab>('live');
  const liveSeries = session?.series.id ?? 1;
  const [pickedSeries, setPickedSeries] = useState<number | null>(null);
  const seasonSeries = tab === 'season' ? (pickedSeries ?? liveSeries) : liveSeries;
  const [currentYear] = useState(() => new Date().getFullYear());
  const year = session?.updatedAtMs ? new Date(session.updatedAtMs).getFullYear() : currentYear;

  const live = usePolledFeed(tab === 'live' ? LIVE_POINTS_URL : null, parseLivePoints, {
    intervalMs: 15_000,
    delaySeconds,
  });
  const season = usePolledFeed(
    tab === 'season' ? seasonPointsUrl(year, seasonSeries) : null,
    parseSeasonPoints,
    {
      intervalMs: 120_000,
      delaySeconds,
    },
  );

  const favorites = useMemo(() => new Set(prefs.favorites), [prefs.favorites]);
  const badgeFor = useCarBadges(prefs.showCarBadges, tab === 'live' ? liveSeries : seasonSeries);
  // The live points feed has no manufacturer; take it from the race on the board.
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
              options={SERIES_IDS.map((id) => [id, SERIES_SHORT[id]!] as const)}
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
            badgeFor={badgeFor}
          />
        )}
        {tab === 'season' && season.data && (
          <SeasonStandingsTable standings={season.data} favorites={favorites} badgeFor={badgeFor} />
        )}
      </div>
    </main>
  );
}

/** Loading, holding-for-delay, error and empty messages for a points feed. */
function FeedState({ feed }: { feed: PolledFeed<unknown[]> }) {
  const now = useNow();
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
  if (!feed.data && feed.holdingUntil !== null) {
    return (
      <p className="points__message">
        Holding for your TV delay — first update in{' '}
        {formatDuration(Math.max(0, feed.holdingUntil - now))}.
      </p>
    );
  }
  if (!feed.data) return <p className="points__message">Loading points…</p>;
  if (feed.data.length === 0) return <p className="points__message">No points available yet.</p>;
  return null;
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented-control" role="group" aria-label={label}>
      {options.map(([option, text]) => (
        <button
          key={option}
          type="button"
          className="segmented-control__option"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
