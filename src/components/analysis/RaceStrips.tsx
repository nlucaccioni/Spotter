import { useId, useState, type ReactNode } from 'react';
import type { CarPace } from '../../data/analysis/race.ts';
import type { LeaderSpell } from '../../data/feeds/race.ts';
import { useElementSize } from '../../hooks/useElementSize.ts';
import { initialed, seconds } from './format.ts';
import { CHART_MARGIN, linear, type XView } from './scale.ts';

// The leader and caution strips under the running-order chart (lined up with its laps), and
// the green-flag pace bars.

interface StripProps {
  laps: number;
  leaders: readonly LeaderSpell[];
  cautions: readonly { from: number; to: number; label: string }[];
  nameOf: (carNumber: string) => string;
  colorOf: (carNumber: string) => string | null;
  /** The laps shown, matching a zoomed chart above; all of them when left out. */
  view?: XView | null | undefined;
}

/** The strips' height: a 22px leader row and a caution row under it. */
export const STRIP_HEIGHT = 54;

type Hovered = { left: number; text: string } | null;

export function RaceStrips({ laps, leaders, cautions, nameOf, colorOf, view }: StripProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<Hovered>(null);
  const clipId = `strip-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const width = size?.width ?? 0;
  const plotW = Math.max(0, width - CHART_MARGIN.left - CHART_MARGIN.right);
  const x = linear(view ? [view[0], view[1]] : [0, Math.max(1, laps)], [0, plotW]);
  const span = (from: number, to: number) => {
    const left = x(from - 0.5);
    // A 2px surface gap between touching segments.
    return { left, width: Math.max(1, x(to + 0.5) - left - 2) };
  };
  const show = (from: number, to: number, text: string) =>
    setHover({ left: CHART_MARGIN.left + x((from + to) / 2), text });

  const row = (label: string, y: number, children: ReactNode) => (
    <g transform={`translate(0,${y})`}>
      <text className="chart__tick" x={CHART_MARGIN.left - 8} y={11} dy="0.32em" textAnchor="end">
        {label}
      </text>
      <g transform={`translate(${CHART_MARGIN.left},0)`} clipPath={`url(#${clipId})`}>
        {children}
      </g>
    </g>
  );

  return (
    <div className="chart chart--strip" ref={ref} onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg
          width={width}
          height={STRIP_HEIGHT}
          role="img"
          aria-label="Race leaders and cautions by lap"
        >
          {/* Segments outside a zoomed range are cut at the plot's edges. */}
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={plotW} height={STRIP_HEIGHT} />
            </clipPath>
          </defs>
          {row(
            'Leader',
            0,
            leaders.map((spell, i) => {
              const { left, width: w } = span(spell.startLap, spell.endLap);
              const color = colorOf(spell.carNumber);
              const count = spell.endLap - spell.startLap + 1;
              const text = `#${spell.carNumber} ${nameOf(spell.carNumber)} led ${
                count === 1 ? `lap ${spell.startLap}` : `laps ${spell.startLap}–${spell.endLap}`
              }`;
              return (
                <g
                  key={i}
                  onPointerEnter={() => show(spell.startLap, spell.endLap, text)}
                  className="chart__segment"
                >
                  <rect
                    x={left}
                    y={0}
                    width={w}
                    height={22}
                    rx={2}
                    className={color ? undefined : 'chart__segment--context'}
                    style={color ? { fill: color } : undefined}
                  />
                  {!color && w >= 24 && (
                    <text className="chart__segment-label" x={left + w / 2} y={11} dy="0.32em">
                      {spell.carNumber}
                    </text>
                  )}
                  <title>{text}</title>
                </g>
              );
            }),
          )}
          {row(
            'Caution',
            30,
            cautions.map((c, i) => {
              const { left, width: w } = span(c.from, c.to);
              const text = `Laps ${c.from}–${c.to}${c.label ? ` · ${c.label}` : ''}`;
              return (
                <g
                  key={i}
                  onPointerEnter={() => show(c.from, c.to, text)}
                  className="chart__segment"
                >
                  <rect x={left} y={5} width={w} height={12} rx={2} className="chart__caution" />
                  <title>{text}</title>
                </g>
              );
            }),
          )}
        </svg>
      )}
      {hover && (
        <div
          className="chart__tooltip chart__tooltip--strip"
          role="status"
          style={
            hover.left > width / 2
              ? { right: width - hover.left + 8, top: 54 }
              : { left: hover.left + 8, top: 54 }
          }
        >
          {hover.text}
        </div>
      )}
    </div>
  );
}

interface PaceProps {
  pace: readonly CarPace[];
  colorOf: (carNumber: string) => string | null;
  isFavorite: (carNumber: string) => boolean;
}

/** Each car's median green-flag lap, as time off the fastest car. */
export function PaceBars({ pace, colorOf, isFavorite }: PaceProps) {
  const ranked = pace.filter((p) => p.median !== null);
  const fastest = ranked[0]?.median ?? 0;
  const slowest = (ranked[ranked.length - 1]?.median ?? fastest) - fastest || 1;
  return (
    <ol className="pace-bars" aria-label="Median green-flag lap, time off the fastest car">
      {ranked.map((p) => {
        const gap = p.median! - fastest;
        const color = colorOf(p.carNumber);
        return (
          <li
            key={p.carNumber}
            className={`pace-bars__row${isFavorite(p.carNumber) ? ' pace-bars__row--favorite' : ''}`}
            title={`Median green-flag lap ${seconds(p.median)} s · fastest lap ${seconds(p.best)} s · ${p.greenLaps} clean laps`}
          >
            <span className="pace-bars__name">
              <span className="muted">#{p.carNumber}</span> {initialed(p.name)}
            </span>
            <span className="pace-bars__track">
              <span
                className={`pace-bars__bar${color ? '' : ' pace-bars__bar--context'}`}
                style={{ width: `${(gap / slowest) * 100}%`, background: color ?? undefined }}
              />
              <span className="pace-bars__value">
                {gap === 0 ? seconds(p.median) : `+${gap.toFixed(3)}`}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
