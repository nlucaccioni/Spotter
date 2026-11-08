import { useMemo, useState } from 'react';
import type { DriverSeason } from '../../data/analysis/season.ts';
import { useElementSize } from '../../hooks/useElementSize.ts';
import type { RaceSummary } from '../../data/feeds/race.ts';
import { Segmented } from '../Segmented.tsx';
import { Card } from './Card.tsx';
import { FullScreenButton, ZoomBar } from './ChartZoom.tsx';
import { DataTable, type Column } from './DataTable.tsx';
import { DriverPicker } from './DriverPicker.tsx';
import { initialed } from './format.ts';
import { LineChart, type ChartSeries } from './LineChart.tsx';
import { seriesColor, usePicked } from './picked.ts';
import { FULL_SCREEN_CLASS, useFullScreen } from './fullScreen.ts';
import { extent, type XView } from './scale.ts';

/** Official points, all points earned in races added up, or place in the standings. */
type Measure = 'official' | 'earned' | 'standing';

function valuesFor(d: DriverSeason, measure: Measure): readonly (number | null)[] {
  if (measure === 'official') return d.officialAfter;
  if (measure === 'earned') return d.pointsAfter;
  return d.standingAfter;
}

const NOTES: Record<Measure, string> = {
  official: 'Official points after each race, with penalties and playoff resets.',
  earned:
    'Every point earned in each race, added up over the season. Penalties and playoff resets aren’t included.',
  standing: 'Place in the standings after each race, as NASCAR scored it.',
};

/** Races after which the leader's total jumped far beyond a race's worth: playoff resets. */
function resetRaces(drivers: readonly DriverSeason[], races: number): number[] {
  const top = Array.from({ length: races }, (_, i) =>
    Math.max(0, ...drivers.map((d) => d.officialAfter[i] ?? 0)),
  );
  return top.flatMap((points, i) => (i > 0 && points - top[i - 1]! > 300 ? [i] : []));
}

/** Quick race ranges for zooming the chart; 'custom' is a range dragged or pinched. */
type Range = 'season' | 'regular' | 'playoffs' | 'last10' | 'custom';

/** The races each quick range covers, or null where it doesn't apply this season. */
function rangeViews(length: number, playoffStart: number | undefined): Record<Range, XView | null> {
  const last = length - 1;
  return {
    season: null,
    regular: playoffStart !== undefined ? [0, playoffStart - 1] : null,
    playoffs: playoffStart !== undefined ? [playoffStart, last] : null,
    last10: length > 12 ? [length - 10, last] : null,
    custom: null,
  };
}

const DEFAULT_COUNT = 5;
const CHART_HEIGHT = 340;
const MIN_FULL_HEIGHT = 160;

interface Props {
  seasonKey: string;
  races: readonly RaceSummary[];
  drivers: readonly DriverSeason[];
  hasOfficial: boolean;
  favorites: ReadonlySet<string>;
}

export function ChampionshipCard({ seasonKey, races, drivers, hasOfficial, favorites }: Props) {
  const [chosen, setMeasure] = useState<Measure | null>(null);
  // Official points by default; all earned when NASCAR's standings files are missing.
  const measure: Measure =
    chosen === 'official' && !hasOfficial
      ? 'earned'
      : (chosen ?? (hasOfficial ? 'official' : 'earned'));
  const isPoints = measure !== 'standing';
  const resets = useMemo(
    () => (measure === 'official' ? resetRaces(drivers, races.length) : []),
    [drivers, measure, races.length],
  );
  const [asTable, setAsTable] = useState(false);

  // Zoom: a quick range, or one dragged or pinched on the chart (cleared for another season).
  const [zoom, setZoom] = useState<{ key: string; view: XView | null }>({
    key: seasonKey,
    view: null,
  });
  const view = zoom.key === seasonKey ? zoom.view : null;
  const setView = (next: XView | null) => setZoom({ key: seasonKey, view: next });
  const [fit, setFit] = useState(false);
  const playoffStart = useMemo(
    () => (hasOfficial ? resetRaces(drivers, races.length)[0] : undefined),
    [drivers, hasOfficial, races.length],
  );
  const views = rangeViews(races.length, playoffStart);
  const range: Range = !view
    ? 'season'
    : ((['regular', 'playoffs', 'last10'] as const).find(
        (r) => views[r]?.[0] === view[0] && views[r]?.[1] === view[1],
      ) ?? 'custom');
  const { ref: fullRef, active: isFull, toggle: toggleFull } = useFullScreen();
  // Full screen, the chart takes whatever height is left under the controls.
  const [fillRef, fillSize] = useElementSize<HTMLDivElement>();
  const chartHeight =
    isFull && fillSize ? Math.max(MIN_FULL_HEIGHT, Math.floor(fillSize.height)) : CHART_HEIGHT;

  // Favourites first (up to 3), then the top of the standings, 5 in all.
  const defaults = useMemo(() => {
    const favs = drivers.filter((d) => favorites.has(`id:${d.driverId}`)).slice(0, 3);
    const rest = drivers.filter((d) => !favs.includes(d)).slice(0, DEFAULT_COUNT - favs.length);
    return [...favs, ...rest].map((d) => String(d.driverId));
  }, [drivers, favorites]);
  const picked = usePicked(defaults, seasonKey);

  const series = useMemo(
    (): ChartSeries[] =>
      drivers.map((d) => {
        const slot = picked.slotOf(String(d.driverId));
        return {
          id: String(d.driverId),
          label: d.name,
          values: valuesFor(d, measure),
          color: slot === null ? null : seriesColor(slot),
        };
      }),
    [drivers, measure, picked],
  );
  // The y range: the whole field in view, or only the picked drivers ("Fit to picked").
  // Standings always run from P1 unless fitted.
  const from = Math.ceil(view?.[0] ?? 0);
  const to = Math.floor(view?.[1] ?? races.length - 1);
  const pickedSpan = extent(
    series.filter((s) => s.color !== null),
    from,
    to,
  );
  let yDomain: [number, number] | undefined;
  if (measure === 'standing') {
    const deepest = Math.max(fit ? 2 : 10, pickedSpan?.[1] ?? 10);
    const top = fit && pickedSpan ? pickedSpan[0] : 1;
    yDomain = [top, Math.max(top + 1, deepest)];
  } else if (fit && pickedSpan) {
    const pad = (pickedSpan[1] - pickedSpan[0]) * 0.05 || 10;
    yDomain = [pickedSpan[0] - pad, pickedSpan[1] + pad];
  }

  const byId = new Map(drivers.map((d) => [String(d.driverId), d]));

  const raceLabel = (i: number) => {
    const race = races[i];
    return race ? `Race ${i + 1} · ${race.trackName || race.name}` : '';
  };

  return (
    <Card
      ref={fullRef}
      className={isFull ? FULL_SCREEN_CLASS : undefined}
      title="Championship"
      note={NOTES[measure]}
      controls={
        <>
          <Segmented
            label="Measure"
            options={[
              ...(hasOfficial ? [['official', 'Official', NOTES.official] as const] : []),
              ['earned', 'All earned', NOTES.earned] as const,
              ['standing', 'Standings', NOTES.standing] as const,
            ]}
            value={measure}
            onChange={setMeasure}
          />
          <Segmented
            label="Show as"
            options={[
              ['chart', 'Chart'],
              ['table', 'Table'],
            ]}
            value={asTable ? 'table' : 'chart'}
            onChange={(v) => setAsTable(v === 'table')}
          />
          <FullScreenButton active={isFull} onToggle={toggleFull} />
        </>
      }
    >
      <DriverPicker
        options={drivers.map((d) => ({ id: String(d.driverId), label: initialed(d.name) }))}
        picked={picked}
      />
      {!asTable && (
        <ZoomBar
          label="Races shown"
          options={[
            ['season', 'Season'] as const,
            ...(views.regular ? [['regular', 'Regular season'] as const] : []),
            ...(views.playoffs ? [['playoffs', 'Playoffs'] as const] : []),
            ...(views.last10 ? [['last10', 'Last 10'] as const] : []),
          ]}
          value={range}
          onChange={(r) => setView(views[r])}
          fit={fit}
          onFitChange={setFit}
          zoomed={view !== null}
        />
      )}
      <div ref={fillRef} className="analysis-card__fill">
        {asTable ? (
          <ProgressTable drivers={drivers} races={races} measure={measure} favorites={favorites} />
        ) : (
          <LineChart
            series={series}
            length={races.length}
            xTickLabel={(i) => `${i + 1}`}
            xTooltipLabel={raceLabel}
            yFormat={(v) => (isPoints ? `${Math.round(v)}` : `P${Math.round(v)}`)}
            invertY={measure === 'standing'}
            integerY={measure === 'standing'}
            yDomain={yDomain}
            view={view}
            onViewChange={setView}
            onSeriesClick={(id) =>
              picked.slotOf(id) === null ? picked.add(id) : picked.remove(id)
            }
            tooltipRank={
              measure === 'standing'
                ? false
                : measure === 'official'
                  ? (id, i) => byId.get(id)?.standingAfter[i] ?? null
                  : undefined
            }
            markers={races.length <= 40}
            rules={resets.map((at) => ({ at: at - 0.5, label: 'Reset' }))}
            breaks={resets}
            height={chartHeight}
            ariaLabel={
              measure === 'official'
                ? 'Official points after each race'
                : measure === 'earned'
                  ? 'All points earned through the season, by race'
                  : 'Standings position after each race'
            }
          />
        )}
      </div>
    </Card>
  );
}

/** The championship chart as a table: every driver, every race. */
function ProgressTable({
  drivers,
  races,
  measure,
  favorites,
}: {
  drivers: readonly DriverSeason[];
  races: readonly RaceSummary[];
  measure: Measure;
  favorites: ReadonlySet<string>;
}) {
  const columns: Column<DriverSeason>[] = [
    {
      id: 'driver',
      label: 'Driver',
      value: (d) => d.name,
      render: (d) => <span className="points-driver">{d.name}</span>,
      className: 'col-driver',
    },
    ...races.map((race, i): Column<DriverSeason> => ({
      id: `r${i}`,
      label: `${i + 1}`,
      title: `Race ${i + 1} · ${race.trackName || race.name}`,
      numeric: true,
      descending: measure !== 'standing',
      value: (d) => valuesFor(d, measure)[i] ?? null,
      render: (d) => valuesFor(d, measure)[i] ?? '—',
    })),
  ];
  return (
    <div className="analysis-table--wide">
      <DataTable
        caption={measure === 'standing' ? 'Standings after each race' : 'Points after each race'}
        rows={drivers}
        rowKey={(d) => String(d.driverId)}
        rowClass={(d) => (favorites.has(`id:${d.driverId}`) ? 'timing-row--favorite' : undefined)}
        columns={columns}
      />
    </div>
  );
}
