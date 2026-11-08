import { useMemo, useState } from 'react';
import {
  cautionRanges,
  labelCautions,
  pitSummary,
  racePace,
  tireFalloff,
  type CarPitSummary,
} from '../../data/analysis/race.ts';
import { isDnf } from '../../data/analysis/season.ts';
import type { RaceResult, RaceSummary } from '../../data/feeds/race.ts';
import type { RaceDetail } from '../../hooks/useAnalysisData.ts';
import { useElementSize } from '../../hooks/useElementSize.ts';
import { Segmented } from '../Segmented.tsx';
import { Card } from './Card.tsx';
import { FullScreenButton, ZoomBar } from './ChartZoom.tsx';
import { FULL_SCREEN_CLASS, useFullScreen } from './fullScreen.ts';
import { DataTable, type Column } from './DataTable.tsx';
import { DriverPicker } from './DriverPicker.tsx';
import { seriesColor, usePicked } from './picked.ts';
import { fixed1, initialed, signed } from './format.ts';
import { LineChart, type ChartSeries } from './LineChart.tsx';
import { PaceBars, RaceStrips, STRIP_HEIGHT } from './RaceStrips.tsx';
import { extent, type XView } from './scale.ts';

interface Props {
  raceKey: string;
  detail: RaceDetail;
  favorites: ReadonlySet<string>;
}

const DEFAULT_COUNT = 5;
const CHART_HEIGHT = 380;
const MIN_FULL_HEIGHT = 160;
/** Room under the chart for the leader and caution strips (and their 4px gap). */
const STRIP_SPACE = STRIP_HEIGHT + 4;

/** Quick lap ranges for zooming: the whole race, or one stage ('s0' is stage 1). */
function stageViews(stageEnds: readonly number[]): [string, string, XView | null][] {
  const stages: [string, string, XView | null][] =
    stageEnds.length > 1
      ? stageEnds.map((end, i) => [
          `s${i}`,
          `Stage ${i + 1}`,
          [i === 0 ? 0 : stageEnds[i - 1]!, end],
        ])
      : [];
  return [['race', 'Race', null], ...stages];
}

export function RaceView({ raceKey, detail, favorites }: Props) {
  const { summary, laps, stops } = detail;
  const results = useMemo(() => summary?.results ?? [], [summary]);
  const [asTable, setAsTable] = useState(false);

  // Picks are by car number: it's what every race file shares.
  const nameOf = useMemo(() => {
    const names = new Map<string, string>();
    for (const car of laps?.cars ?? []) names.set(car.carNumber, car.name);
    for (const r of results) names.set(r.carNumber, r.name);
    return (car: string) => names.get(car) ?? '';
  }, [laps, results]);
  const carOrder = useMemo(() => {
    const order = results.map((r) => r.carNumber);
    for (const car of laps?.cars ?? [])
      if (!order.includes(car.carNumber)) order.push(car.carNumber);
    return order;
  }, [results, laps]);
  const defaults = useMemo(() => {
    const favs = results.filter((r) => favorites.has(`id:${r.driverId}`)).slice(0, 3);
    const rest = results.filter((r) => !favs.includes(r)).slice(0, DEFAULT_COUNT - favs.length);
    return [...favs, ...rest].map((r) => r.carNumber);
  }, [results, favorites]);
  const picked = usePicked(defaults, raceKey);
  // Favorites are by driver; the race files' tables are mostly by car.
  const isFavorite = (driverId: number | null) =>
    driverId !== null && favorites.has(`id:${driverId}`);
  const driverOfCar = useMemo(
    () => new Map(results.map((r) => [r.carNumber, r.driverId])),
    [results],
  );
  const favoriteCar = (car: string) => isFavorite(driverOfCar.get(car) ?? null);

  // Zoom: a stage, or laps dragged or pinched on the chart (cleared for another race).
  const [zoom, setZoom] = useState<{ key: string; view: XView | null }>({
    key: raceKey,
    view: null,
  });
  const view = zoom.key === raceKey ? zoom.view : null;
  const setView = (next: XView | null) => setZoom({ key: raceKey, view: next });
  const [fit, setFit] = useState(false);
  const { ref: fullRef, active: isFull, toggle: toggleFull } = useFullScreen();
  // Full screen, the chart takes the height left under the controls, less the strips.
  const [fillRef, fillSize] = useElementSize<HTMLDivElement>();
  const chartHeight =
    isFull && fillSize
      ? Math.max(MIN_FULL_HEIGHT, Math.floor(fillSize.height) - STRIP_SPACE)
      : CHART_HEIGHT;
  const colorOf = (car: string) => {
    const slot = picked.slotOf(car);
    return slot === null ? null : seriesColor(slot);
  };

  const cautions = useMemo(
    () =>
      laps
        ? labelCautions(cautionRanges(laps.flags), summary?.cautionSegments ?? [])
        : (summary?.cautionSegments ?? []).map((c) => ({
            from: c.startLap,
            to: c.endLap,
            label: c.comment || c.reason,
          })),
    [laps, summary],
  );
  const totalLaps = laps?.laps || summary?.actualLaps || 0;
  const stageRules = (summary?.stageEnds ?? [])
    .slice(0, -1)
    .map((at, i) => ({ at, label: `S${i + 1}` }));

  const positionSeries = useMemo(
    (): ChartSeries[] =>
      (laps?.cars ?? []).map((car) => ({
        id: car.carNumber,
        label: `#${car.carNumber} ${initialed(car.name)}`,
        values: car.positions,
        color: colorOf(car.carNumber),
      })),
    // colorOf changes with picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [laps, picked.slots],
  );

  const ranges = stageViews(summary?.stageEnds ?? []);
  const range =
    (view ? ranges.find(([, , v]) => v && v[0] === view[0] && v[1] === view[1])?.[0] : 'race') ??
    'custom';
  // Positions run P1 to the back of the field, or just the picked cars' places when fitted.
  const pickedSpan = extent(
    positionSeries.filter((s) => s.color !== null),
    Math.ceil(view?.[0] ?? 0),
    Math.floor(view?.[1] ?? totalLaps),
  );
  const yDomain: [number, number] =
    fit && pickedSpan
      ? [pickedSpan[0], Math.max(pickedSpan[0] + 1, pickedSpan[1])]
      : [1, Math.max(10, laps?.cars.length ?? 10)];

  const pace = useMemo(() => (laps ? racePace(laps, stops ?? []) : []), [laps, stops]);
  const falloff = useMemo((): ChartSeries[] => {
    if (!laps) return [];
    return picked.slots.flatMap((car, slot) => {
      if (car === null) return [];
      const values = tireFalloff(laps, stops ?? [], car);
      return values.length
        ? [
            {
              id: car,
              label: `#${car} ${initialed(nameOf(car))}`,
              values,
              color: seriesColor(slot),
            },
          ]
        : [];
    });
  }, [laps, stops, picked.slots, nameOf]);
  const falloffLength = Math.max(0, ...falloff.map((s) => s.values.length));
  const pits = useMemo(() => (stops ? pitSummary(stops) : []), [stops]);

  if (!summary || results.length === 0) {
    return <p className="points__message">No results for this race yet.</p>;
  }

  return (
    <div className="analysis__grid">
      <RaceFacts summary={summary} />

      <Card
        ref={fullRef}
        className={isFull ? FULL_SCREEN_CLASS : undefined}
        title="Running order"
        note={
          laps
            ? 'Position on every lap. Shaded laps were run under caution; S marks the end of each stage.'
            : 'NASCAR hasn’t published lap-by-lap data for this race.'
        }
        controls={
          laps && (
            <>
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
          )
        }
      >
        <DriverPicker
          options={carOrder.map((car) => ({ id: car, label: `#${car} ${initialed(nameOf(car))}` }))}
          picked={picked}
        />
        {laps && !asTable && (
          <ZoomBar
            label="Laps shown"
            options={ranges.map(([id, label]) => [id, label] as const)}
            value={range}
            onChange={(id) => setView(ranges.find(([r]) => r === id)?.[2] ?? null)}
            fit={fit}
            onFitChange={setFit}
            zoomed={view !== null}
          />
        )}
        <div ref={fillRef} className="analysis-card__fill">
          {laps && !asTable && (
            <>
              <LineChart
                series={positionSeries}
                length={totalLaps + 1}
                xTickLabel={(i) => `${i}`}
                xTooltipLabel={(i) => (i === 0 ? 'Start' : `Lap ${i}`)}
                yFormat={(v) => `P${Math.round(v)}`}
                invertY
                integerY
                yDomain={yDomain}
                view={view}
                onViewChange={setView}
                onSeriesClick={(car) =>
                  picked.slotOf(car) === null ? picked.add(car) : picked.remove(car)
                }
                bands={cautions}
                rules={stageRules}
                height={chartHeight}
                ariaLabel="Running position of each car on every lap"
                tooltipRank={false}
              />
              <RaceStrips
                laps={totalLaps}
                leaders={summary.leaderSpells}
                cautions={cautions}
                nameOf={nameOf}
                colorOf={colorOf}
                view={view}
              />
            </>
          )}
          {(asTable || !laps) && (
            <RunningOrderTable summary={summary} detail={detail} isFavorite={isFavorite} />
          )}
        </div>
      </Card>

      {summary.stages.length > 0 && (
        <Card title="Stage results" note="Top 10 in each stage and the points they scored.">
          <div className="analysis__stages">
            {summary.stages.map((stage) => (
              <section key={stage.stage} className="analysis__stage">
                <h3 className="analysis__stage-title">Stage {stage.stage}</h3>
                <DataTable
                  caption={`Stage ${stage.stage} top 10`}
                  rows={stage.results.slice(0, 10)}
                  rowKey={(r) => `${r.driverId}`}
                  rowClass={(r) => (isFavorite(r.driverId) ? 'timing-row--favorite' : undefined)}
                  columns={[
                    {
                      id: 'pos',
                      label: 'Pos',
                      numeric: true,
                      render: (r) => r.position,
                    },
                    {
                      id: 'car',
                      label: '#',
                      numeric: true,
                      render: (r) => <span className="muted">{r.carNumber}</span>,
                    },
                    {
                      id: 'driver',
                      label: 'Driver',
                      render: (r) => <span className="points-driver">{initialed(r.name)}</span>,
                      className: 'col-fill',
                    },
                    { id: 'pts', label: 'Pts', numeric: true, render: (r) => r.points },
                  ]}
                />
              </section>
            ))}
          </div>
        </Card>
      )}

      {laps && (
        <div className="analysis__pair">
          <Card
            title="Green-flag pace"
            note="Median lap under green, leaving out restarts, pit laps and slow-downs. Bars show time off the fastest car."
          >
            <PaceBars pace={pace} colorOf={colorOf} isFavorite={favoriteCar} />
          </Card>
          <Card
            title="Tire falloff"
            note="Average green-flag lap by laps on tires, for the drivers picked above. Higher is slower."
          >
            {falloffLength > 1 ? (
              <LineChart
                series={falloff}
                length={falloffLength}
                start={1}
                xTickLabel={(i) => `${i}`}
                xTooltipLabel={(i) => `${i} ${i === 1 ? 'lap' : 'laps'} on tires`}
                yFormat={(v) => v.toFixed(2)}
                height={300}
                ariaLabel="Average lap time by tire age for the picked drivers"
                tooltipRank={false}
              />
            ) : (
              <p className="points__message">Not enough green-flag running to compare.</p>
            )}
          </Card>
        </div>
      )}

      {pits.length > 0 && (
        <Card
          title="Pit stops"
          note="Pit-road time is entry to exit. Places gained count caution stops only, where everyone pits together."
        >
          <DataTable
            caption="Pit stops by car"
            rows={pits}
            rowKey={(p) => p.carNumber}
            rowClass={(p) =>
              [
                picked.slotOf(p.carNumber) !== null ? 'analysis-row--picked' : '',
                favoriteCar(p.carNumber) ? 'timing-row--favorite' : '',
              ]
                .join(' ')
                .trim() || undefined
            }
            columns={pitColumns}
            initialSort={{ id: 'gained', desc: true }}
          />
        </Card>
      )}
    </div>
  );
}

const pitColumns: Column<CarPitSummary>[] = [
  {
    id: 'car',
    label: '#',
    numeric: true,
    value: (p) => Number(p.carNumber) || 0,
    render: (p) => <span className="muted">{p.carNumber}</span>,
  },
  {
    id: 'driver',
    label: 'Driver',
    value: (p) => p.name,
    render: (p) => <span className="points-driver">{p.name}</span>,
    className: 'col-driver',
  },
  {
    id: 'stops',
    label: 'Stops',
    numeric: true,
    descending: true,
    value: (p) => p.stops,
    render: (p) => p.stops,
  },
  {
    id: 'green',
    label: 'Green',
    title: 'Stops under green',
    numeric: true,
    descending: true,
    value: (p) => p.greenStops,
    render: (p) => p.greenStops || '',
    className: 'p2',
  },
  {
    id: 'avg',
    label: 'Avg pit',
    title: 'Average time on pit road, entry to exit (s)',
    numeric: true,
    value: (p) => p.avgPitRoad,
    render: (p) => fixed1(p.avgPitRoad),
  },
  {
    id: 'best',
    label: 'Best pit',
    title: 'Fastest time on pit road, entry to exit (s)',
    numeric: true,
    value: (p) => p.bestPitRoad,
    render: (p) => fixed1(p.bestPitRoad),
    className: 'p2',
  },
  {
    id: 'box',
    label: 'Avg stop',
    title: 'Average time stopped in the box (s)',
    numeric: true,
    value: (p) => p.avgBox,
    render: (p) => fixed1(p.avgBox),
  },
  {
    id: 'gained',
    label: '+/−',
    title: 'Places gained on pit road under caution',
    numeric: true,
    descending: true,
    value: (p) => p.cautionPositionsGained,
    render: (p) => {
      const v = p.cautionPositionsGained;
      return <span className={v > 0 ? 'up' : v < 0 ? 'down' : undefined}>{signed(v, 0)}</span>;
    },
  },
];

function RaceFacts({ summary }: { summary: RaceSummary }) {
  const winner = summary.results[0];
  const facts: [label: string, value: string, meaning: string][] = [
    [
      'Winner',
      winner ? `#${winner.carNumber} ${winner.name}` : '—',
      'The car number and driver who won the race.',
    ],
    [
      'Lead changes',
      `${summary.leadChanges} among ${summary.leaders}`,
      'How many times the lead changed hands on track, and how many drivers led at least one lap.',
    ],
    [
      'Cautions',
      `${summary.cautions} for ${summary.cautionLaps} laps`,
      'Caution periods (yellow flags), including stage breaks, and the laps run under them.',
    ],
    [
      'Margin',
      summary.marginOfVictory > 0 ? `${summary.marginOfVictory.toFixed(3)} s` : '—',
      'Margin of victory: how far the winner finished ahead of second place, in seconds.',
    ],
    [
      'Avg speed',
      summary.averageSpeed > 0 ? `${summary.averageSpeed.toFixed(1)} mph` : '—',
      'The winner’s average speed over the whole race, caution laps included.',
    ],
  ];
  return (
    <dl className="race-facts">
      {facts.map(([label, value, meaning]) => (
        <div key={label} className="race-facts__item" title={meaning}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The running-order chart as a table: finishing order with places at each stage end. */
function RunningOrderTable({
  summary,
  detail,
  isFavorite,
}: {
  summary: RaceSummary;
  detail: RaceDetail;
  isFavorite: (driverId: number | null) => boolean;
}) {
  const positions = new Map(detail.laps?.cars.map((c) => [c.carNumber, c.positions]) ?? []);
  const stageEnds = summary.stageEnds.slice(0, -1);
  const columns: Column<RaceResult>[] = [
    {
      id: 'fin',
      label: 'Fin',
      title: 'Finish',
      numeric: true,
      value: (r) => r.finish,
      render: (r) => <strong>{r.finish}</strong>,
    },
    {
      id: 'car',
      label: '#',
      numeric: true,
      render: (r) => <span className="muted">{r.carNumber}</span>,
    },
    {
      id: 'driver',
      label: 'Driver',
      value: (r) => r.name,
      render: (r) => <span className="points-driver">{r.name}</span>,
      className: 'col-driver',
    },
    {
      id: 'start',
      label: 'Start',
      numeric: true,
      value: (r) => r.start || null,
      render: (r) => r.start || '—',
    },
    ...stageEnds.map((lap, i): Column<RaceResult> => ({
      id: `s${i}`,
      label: `S${i + 1}`,
      title: `Running position at the end of stage ${i + 1} (lap ${lap})`,
      numeric: true,
      value: (r) => positions.get(r.carNumber)?.[lap] ?? null,
      render: (r) => positions.get(r.carNumber)?.[lap] ?? '—',
      className: 'p2',
    })),
    {
      id: 'led',
      label: 'Led',
      title: 'Laps led',
      numeric: true,
      descending: true,
      value: (r) => r.lapsLed,
      render: (r) => r.lapsLed || '',
    },
    {
      id: 'laps',
      label: 'Laps',
      numeric: true,
      descending: true,
      value: (r) => r.lapsCompleted,
      render: (r) => r.lapsCompleted,
      className: 'p3',
    },
    {
      id: 'status',
      label: 'Status',
      value: (r) => r.status,
      render: (r) => (isDnf(r.status) ? r.status : <span className="muted">{r.status}</span>),
      className: 'p3',
    },
  ];
  return (
    <DataTable
      caption="Finishing order"
      rows={summary.results}
      rowKey={(r) => `${r.driverId}`}
      rowClass={(r) => (isFavorite(r.driverId) ? 'timing-row--favorite' : undefined)}
      columns={columns}
    />
  );
}
