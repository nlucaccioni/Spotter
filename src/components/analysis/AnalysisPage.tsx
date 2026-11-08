import { ChevronsUpDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { SERIES_IDS, SERIES_SHORT } from '../../data/feeds/schedule.ts';
import { seriesFromId } from '../../data/model/lookups.ts';
import type { Session } from '../../data/model/types.ts';
import {
  useFinishedRaces,
  useGroupStandings,
  useRaceDetail,
  useSeasonResults,
  type Load,
} from '../../hooks/useAnalysisData.ts';
import { useMfrLogos } from '../../hooks/useMfrLogos.ts';
import { usePreferences } from '../../hooks/usePreferences.ts';
import { useTeamLogos } from '../../hooks/useTeamLogos.ts';
import { teamDisplayFor } from '../../prefs/preferences.ts';
import { Segmented } from '../Segmented.tsx';
import { RaceView } from './RaceView.tsx';
import { SeasonView } from './SeasonView.tsx';

type View = 'season' | 'race';

/** Oldest season NASCAR still serves race results and per-race standings for. */
const FIRST_SEASON = 2017;
/** Lap times and pit stops start in 2020. */
const FIRST_LAP_DATA_SEASON = 2020;
/** Oldest season with NASCAR's team logo list; earlier seasons borrow it. */
const FIRST_TEAM_LOGO_SEASON = 2025;
/** run_type of a race session (1 practice, 2 qualifying). */
const RACE_RUN = 3;

interface Props {
  /** The newest live session, if any: picks the starting series and year. */
  session: Session | null;
  /** Told which series the page is showing, so settings can offer that series' options. */
  onSeriesShown?: (seriesId: number) => void;
}

/** Season trends and single-race breakdowns, from NASCAR's per-race files. */
export function AnalysisPage({ session, onSeriesShown }: Props) {
  const [prefs] = usePreferences();
  const [view, setView] = useState<View>('season');
  const [pickedSeries, setPickedSeries] = useState<number | null>(null);
  const seriesId = pickedSeries ?? session?.series.id ?? 1;
  const [currentYear] = useState(() => new Date().getFullYear());
  const liveYear = session?.updatedAtMs ? new Date(session.updatedAtMs).getFullYear() : currentYear;
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const year = pickedYear ?? liveYear;
  const years = useMemo(
    () =>
      Array.from(
        { length: Math.max(currentYear, liveYear) - FIRST_SEASON + 1 },
        (_, i) => Math.max(currentYear, liveYear) - i,
      ),
    [currentYear, liveYear],
  );
  const thisSeason = year === liveYear ? 'this season' : `in ${year}`;
  useEffect(() => onSeriesShown?.(seriesId), [onSeriesShown, seriesId]);

  // The race on track now (or just finished, until its official results are out).
  const liveRaceId =
    session?.runType === RACE_RUN && session.series.id === seriesId && year === liveYear
      ? session.raceId
      : null;
  const races = useFinishedRaces(year, seriesId, liveRaceId);
  // The season view sticks to official results, so it leaves out the race in progress.
  const pointsRaces = useMemo(
    () => races.data?.filter((r) => r.pointsRace && r.raceId !== liveRaceId) ?? null,
    [races.data, liveRaceId],
  );
  const groups = useGroupStandings(year, seriesId);
  const season = useSeasonResults(year, seriesId, view === 'season' ? pointsRaces : null);

  // Newest race first in the picker; defaults to the latest.
  const raceOptions = useMemo(() => [...(races.data ?? [])].reverse(), [races.data]);
  const [pickedRace, setPickedRace] = useState<{ season: string; raceId: number } | null>(null);
  const seasonKey = `${year}/${seriesId}`;
  const raceId =
    (pickedRace?.season === seasonKey ? pickedRace.raceId : null) ?? raceOptions[0]?.raceId ?? null;
  const detail = useRaceDetail(
    year,
    seriesId,
    view === 'race' ? raceId : null,
    raceId !== null && raceId === liveRaceId,
  );

  const favorites = useMemo(() => new Set(prefs.favorites), [prefs.favorites]);
  const teamDisplay = teamDisplayFor(prefs, seriesId);
  const teamLogoFor = useTeamLogos(
    teamDisplay === 'logo',
    Math.max(year, FIRST_TEAM_LOGO_SEASON),
    prefs.theme,
  );
  const mfrLogoFor = useMfrLogos(prefs.showMfrLogos);

  return (
    <main className="points analysis">
      <header className="points__header">
        <div className="points__title">
          <h1>Analysis</h1>
          <span className="muted">
            {year} {seriesFromId(seriesId).name}
          </span>
        </div>
        <div className="points__controls">
          {view === 'race' && raceOptions.length > 0 && (
            <span className="series-select analysis__race-select">
              <select
                className="series-select__input"
                value={raceId ?? ''}
                aria-label="Race"
                onChange={(event) =>
                  setPickedRace({ season: seasonKey, raceId: Number(event.target.value) })
                }
              >
                {raceOptions.map((r) => (
                  <option key={r.raceId} value={r.raceId}>
                    {r.trackName ? `${r.trackName} · ${r.name}` : r.name}
                    {r.raceId === liveRaceId ? ' (live)' : ''}
                  </option>
                ))}
              </select>
              <ChevronsUpDown className="series-select__icon" size={12} aria-hidden="true" />
            </span>
          )}
          <span className="series-select analysis__year-select">
            <select
              className="series-select__input"
              value={year}
              aria-label="Season"
              onChange={(event) => setPickedYear(Number(event.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <ChevronsUpDown className="series-select__icon" size={12} aria-hidden="true" />
          </span>
          <Segmented
            label="Series"
            options={SERIES_IDS.map((id) => [id, SERIES_SHORT[id]] as const)}
            value={seriesId}
            onChange={setPickedSeries}
            className="analysis__series"
          />
          <Segmented
            label="View"
            options={[
              ['season', 'Season'],
              ['race', 'Race'],
            ]}
            value={view}
            onChange={setView}
            className="analysis__view"
          />
        </div>
      </header>

      <div className="points__body analysis__body">
        {races.status !== 'ready' ? (
          <LoadState load={races} what="the schedule" />
        ) : races.data.length === 0 ? (
          <p className="points__message">No races have been run {thisSeason} yet.</p>
        ) : view === 'season' ? (
          season.status === 'ready' ? (
            season.data.races.length ? (
              <SeasonView
                seasonKey={seasonKey}
                races={season.data.races}
                official={season.data.official}
                groups={groups}
                favorites={favorites}
                teamDisplay={teamDisplay}
                teamLogoFor={teamLogoFor}
                mfrLogoFor={mfrLogoFor}
              />
            ) : (
              <p className="points__message">No points races have been run {thisSeason} yet.</p>
            )
          ) : (
            <LoadState load={season} what="race results" />
          )
        ) : detail.status === 'ready' ? (
          <>
            {year < FIRST_LAP_DATA_SEASON && (
              <p className="analysis__notice">
                NASCAR’s lap times and pit stops start in {FIRST_LAP_DATA_SEASON}, so races before
                then show results only.
              </p>
            )}
            <RaceView
              raceKey={`${seasonKey}/${raceId}`}
              detail={detail.data}
              favorites={favorites}
            />
          </>
        ) : (
          <LoadState load={detail} what="this race" />
        )}
      </div>
    </main>
  );
}

function LoadState({ load, what }: { load: Load<unknown>; what: string }) {
  if (load.status === 'error') {
    return (
      <div className="points__message" role="alert">
        Can’t reach NASCAR for {what}.{' '}
        <button type="button" className="drawer__link" onClick={load.retry}>
          Retry
        </button>
      </div>
    );
  }
  if (load.status !== 'loading') return null;
  const [done, total] = load.progress ?? [0, 0];
  return (
    <p className="points__message">
      Loading {what}
      {total > 0 ? ` (${done} of ${total} races)` : ''}…
    </p>
  );
}
