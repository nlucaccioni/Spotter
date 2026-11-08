import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { useElementSize } from '../../hooks/useElementSize.ts';
import {
  CHART_MARGIN,
  clampView,
  integerTicks,
  linear,
  linePath,
  niceTicks,
  type XView,
} from './scale.ts';

export interface ChartSeries {
  id: string;
  /** Shown in the tooltip and end labels. */
  label: string;
  /** One value per x position (index); null = no value there. */
  values: readonly (number | null)[];
  /** The series colour (a CSS colour), or null for a muted context line left out of the tooltip. */
  color: string | null;
}

export interface ChartBand {
  from: number;
  to: number;
}

interface Props {
  series: readonly ChartSeries[];
  /** Number of x positions; x is the index. */
  length: number;
  /** First x index drawn (e.g. 1 to skip lap 0). */
  start?: number;
  xTickLabel: (index: number) => string;
  /** Heading of the tooltip at an x position. */
  xTooltipLabel: (index: number) => string;
  yFormat: (value: number) => string;
  /** Smaller values at the top (running order, standings). */
  invertY?: boolean;
  yDomain?: [number, number] | undefined;
  /** Whole-number y ticks (positions). */
  integerY?: boolean;
  /** Shaded x ranges, e.g. cautions. */
  bands?: readonly ChartBand[];
  /** Thin vertical rules at these x positions, e.g. stage ends. */
  rules?: readonly { at: number; label: string }[];
  /** Dots at every point (for charts with few x positions). */
  markers?: boolean;
  /** Lines aren't joined into these x positions (e.g. after a points reset). */
  breaks?: readonly number[];
  height: number;
  /** Plot area padding; the left one leaves room for the y ticks. */
  margin?: { top: number; right: number; bottom: number; left: number };
  ariaLabel: string;
  /** The x range shown (zoomed in); the whole chart when left out. */
  view?: XView | null | undefined;
  /**
   * Lets the reader zoom: drag across the plot with a mouse or pen, or pinch and pan with two
   * fingers on a touch screen. Null = back to the whole chart (also on a double click).
   */
  onViewChange?: ((view: XView | null) => void) | undefined;
  /**
   * Positions in the tooltip: each series' place at an x (e.g. its
   * official standing), or false for none. By default, the rank by value (ties share a place).
   */
  tooltipRank?: false | ((id: string, index: number) => number | null) | undefined;
  /**
   * Called with a line's id when it's clicked (or tapped twice on a touch screen). Turns on
   * finding the line under the pointer: it's drawn on top, with its name beside it.
   */
  onSeriesClick?: ((id: string) => void) | undefined;
}

/** How close (px, up or down) the pointer has to be to a line to pick it out. */
const HOT_DISTANCE = 14;
/** Movement (px) still counted as a click or tap rather than a drag. */
const CLICK_SLOP = 5;
/** On touch, holding this long (ms) without moving starts scrubbing; moving sooner scrolls. */
const HOLD_MS = 300;
/** How far (px) a finger can drift during the hold and still start scrubbing. */
const HOLD_SLOP = 10;

/** Rows per tooltip column, and the most rows shown when it lists the whole field. */
const TOOLTIP_COLUMN_ROWS = 15;
const TOOLTIP_FIELD_ROWS = 30;

/** Narrowest zoom, in x positions. */
const MIN_SPAN = 3;

/** An in-progress touch gesture: where it started, so moves are measured from there. */
interface Gesture {
  view: XView;
  /** The plot's left edge on screen. */
  left: number;
  /** Touch x positions when the gesture started (two fingers pinch and pan). */
  xs: number[];
}

/** Line chart with a crosshair and a tooltip listing every coloured series at that x. */
export function LineChart({
  series,
  length,
  start = 0,
  xTickLabel,
  xTooltipLabel,
  yFormat,
  invertY = false,
  yDomain,
  integerY = false,
  bands = [],
  rules = [],
  markers = false,
  breaks = [],
  height,
  margin = CHART_MARGIN,
  ariaLabel,
  view,
  onViewChange,
  tooltipRank,
  onSeriesClick,
}: Props) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const clipId = `clip-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const width = size?.width ?? 0;
  const plotW = Math.max(0, width - margin.left - margin.right);
  const plotH = Math.max(0, height - margin.top - margin.bottom);
  const last = Math.max(start + 1, length - 1);
  const [v0, v1] = view ? clampView(view, [start, last], MIN_SPAN) : [start, last];
  const zoomed = v0 > start || v1 < last;
  // Whole x positions in view.
  const first = Math.ceil(v0 - 1e-9);
  const final = Math.floor(v1 + 1e-9);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const touches = useRef(new Map<number, number>());
  const gesture = useRef<Gesture | null>(null);
  // The pointer's height in the plot, for finding the line under it.
  const [pointerY, setPointerY] = useState<number | null>(null);
  const pressedAt = useRef<{ x: number; y: number } | null>(null);
  /** On touch, the line tapped once: a second tap on it highlights it. */
  const tapped = useRef<string | null>(null);
  // Touch scrubbing: a finger held still takes over the chart (the tooltip and the line nearest
  // the finger follow it); a finger that moves first is left to scroll the page.
  // State, not a ref: the svg only appears once the chart has a width.
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const scrubbing = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelHold = () => clearTimeout(holdTimer.current);
  useEffect(() => {
    if (!svg) return;
    // Once scrubbing (or pinching), the page mustn't scroll. Needs a non-passive listener.
    const block = (event: TouchEvent) => {
      if (scrubbing.current || event.touches.length > 1) event.preventDefault();
    };
    svg.addEventListener('touchmove', block, { passive: false });
    return () => {
      svg.removeEventListener('touchmove', block);
      clearTimeout(holdTimer.current);
    };
  }, [svg]);

  const [y0, y1] = useMemo((): [number, number] => {
    if (yDomain) return yDomain;
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of series) {
      for (let i = first; i <= final; i++) {
        const v = s.values[i];
        if (v === null || v === undefined) continue;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    if (!Number.isFinite(lo)) return [0, 1];
    const pad = (hi - lo) * 0.05 || 1;
    return [lo - pad, hi + pad];
  }, [series, yDomain, first, final]);

  const x = linear([v0, v1], [0, plotW]);
  const y = linear(invertY ? [y0, y1] : [y1, y0], [0, plotH]);
  const yTickCount = Math.max(2, Math.floor(plotH / 40));
  const yTicks = integerY ? integerTicks(y0, y1, yTickCount) : niceTicks(y0, y1, yTickCount);
  const xTicks = integerTicks(v0, v1, Math.max(2, Math.floor(plotW / 70)));

  // Dots only while points are far enough apart to read.
  const dots = markers && plotW / Math.max(1, v1 - v0) >= 12;
  const colored = series.filter((s) => s.color !== null);
  const context = series.filter((s) => s.color === null);
  const path = (s: ChartSeries) =>
    linePath(
      s.values.flatMap((v, i) => {
        const point = v === null || i < start ? null : ([x(i), y(v)] as const);
        return breaks.includes(i) ? [null, point] : [point];
      }),
    );

  // The line nearest the pointer at the hovered x, if one is close enough. Highlighted lines win
  // a tie, so they stay easy to pick out of the gray field.
  const nearestLine = (index: number, py: number) => {
    let found: { s: ChartSeries; v: number } | null = null;
    let best = HOT_DISTANCE;
    for (const s of series) {
      const v = s.values[index];
      if (v === null || v === undefined) continue;
      const d = Math.abs(y(v) - py) - (s.color ? 0.5 : 0);
      if (d <= best) {
        best = d;
        found = { s, v };
      }
    }
    return found;
  };
  const hot =
    onSeriesClick && hover !== null && pointerY !== null ? nearestLine(hover, pointerY) : null;

  const plotLeft = (target: Element) => target.getBoundingClientRect().left + margin.left;
  const trackPointer = (event: PointerEvent<SVGSVGElement>) => {
    setPointerY(event.clientY - event.currentTarget.getBoundingClientRect().top - margin.top);
  };
  const indexAt = (clientX: number, target: Element) =>
    Math.min(final, Math.max(first, Math.round(x.invert(clientX - plotLeft(target)))));

  // Touch: a held finger scrubs (like hovering: the tooltip and the line nearest the finger
  // follow it, up and down the order too); two fingers pinch and pan.
  const startGesture = (target: Element) => {
    gesture.current =
      touches.current.size > 0
        ? { view: [v0, v1], left: plotLeft(target), xs: [...touches.current.values()] }
        : null;
  };
  const moveGesture = () => {
    const g = gesture.current;
    const xs = [...touches.current.values()];
    if (!g || !onViewChange || plotW <= 0 || xs.length !== 2 || g.xs.length !== 2) return false;
    const span0 = g.view[1] - g.view[0];
    const perPx = span0 / plotW;
    const [a0, b0] = g.xs as [number, number];
    const [a1, b1] = xs as [number, number];
    const mid0 = (a0 + b0) / 2 - g.left;
    const mid1 = (a1 + b1) / 2 - g.left;
    const anchor = g.view[0] + mid0 * perPx;
    const span = Math.min(
      last - start,
      Math.max(MIN_SPAN, (span0 * Math.abs(b0 - a0)) / Math.max(1, Math.abs(b1 - a1))),
    );
    const lo = anchor - (mid1 / plotW) * span;
    onViewChange(
      span >= last - start - 1e-6 ? null : clampView([lo, lo + span], [start, last], MIN_SPAN),
    );
    return true;
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    pressedAt.current = { x: event.clientX, y: event.clientY };
    trackPointer(event);
    if (event.pointerType === 'touch') {
      touches.current.set(event.pointerId, event.clientX);
      startGesture(event.currentTarget);
      cancelHold();
      if (touches.current.size === 1) {
        const target = event.currentTarget;
        const { clientX, clientY } = event;
        holdTimer.current = setTimeout(() => {
          scrubbing.current = true;
          setPointerY(clientY - target.getBoundingClientRect().top - margin.top);
          setHover(indexAt(clientX, target));
          navigator.vibrate?.(10);
        }, HOLD_MS);
      }
      return;
    }
    if (event.button !== 0 || !onViewChange) return;
    const i = indexAt(event.clientX, event.currentTarget);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ from: i, to: i });
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'touch' && touches.current.has(event.pointerId)) {
      touches.current.set(event.pointerId, event.clientX);
      if (moveGesture()) {
        setHover(null);
        return;
      }
      if (!scrubbing.current) {
        // Moving before the hold is up is a scroll or swipe, not a scrub.
        const from = pressedAt.current;
        if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > HOLD_SLOP) {
          cancelHold();
        }
        return;
      }
    }
    trackPointer(event);
    const i = indexAt(event.clientX, event.currentTarget);
    setHover(i);
    if (drag) setDrag({ ...drag, to: i });
  };
  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    const from = pressedAt.current;
    pressedAt.current = null;
    const click =
      event.type === 'pointerup' &&
      from !== null &&
      Math.hypot(event.clientX - from.x, event.clientY - from.y) <= CLICK_SLOP;
    // The line where the click or tap landed, worked out from the event itself.
    const box = event.currentTarget.getBoundingClientRect();
    const target =
      click && onSeriesClick
        ? nearestLine(
            indexAt(event.clientX, event.currentTarget),
            event.clientY - box.top - margin.top,
          )
        : null;
    if (event.pointerType === 'touch') {
      touches.current.delete(event.pointerId);
      startGesture(event.currentTarget);
      cancelHold();
      const wasScrubbing = scrubbing.current;
      if (touches.current.size === 0) scrubbing.current = false;
      if (wasScrubbing) return;
      // A tap shows the tooltip at that lap.
      if (click) {
        trackPointer(event);
        setHover(indexAt(event.clientX, event.currentTarget));
      }
      // First tap on a line names it; a second tap on the same line highlights it.
      if (target && touches.current.size === 0) {
        if (tapped.current === target.s.id) {
          onSeriesClick?.(target.s.id);
          tapped.current = null;
        } else {
          tapped.current = target.s.id;
        }
      }
      return;
    }
    if (target && event.button === 0) onSeriesClick?.(target.s.id);
    if (drag && onViewChange && Math.abs(drag.to - drag.from) >= 1) {
      onViewChange([Math.min(drag.from, drag.to), Math.max(drag.from, drag.to)]);
    }
    setDrag(null);
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const step = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowRight') setHover((h) => Math.min(final, (h ?? first - step) + step));
    else if (event.key === 'ArrowLeft')
      setHover((h) => Math.max(first, (h ?? final + step) - step));
    else if (event.key === 'Escape') setHover(null);
    else return;
    event.preventDefault();
  };

  // The tooltip lists the coloured series, or the whole field when none is picked.
  // (only its top rows: a season can have 90+ drivers).
  const tooltipAll =
    hover === null
      ? []
      : (colored.length > 0 ? colored : series)
          .flatMap((s) => {
            const v = s.values[hover];
            return v === null || v === undefined ? [] : [{ s, v }];
          })
          .sort((a, b) => (invertY ? a.v - b.v : b.v - a.v));
  const wholeField = colored.length === 0;
  // Each row's place in the whole field (not just among the highlighted): given, or by value.
  const ranked = tooltipRank !== false;
  const rankOf = (id: string, v: number) => {
    if (hover === null) return null;
    if (tooltipRank) return tooltipRank(id, hover);
    let ahead = 0;
    for (const other of series) {
      const o = other.values[hover];
      if (o !== null && o !== undefined && (invertY ? o < v : o > v)) ahead++;
    }
    return ahead + 1;
  };
  const tooltipRows = wholeField ? tooltipAll.slice(0, TOOLTIP_FIELD_ROWS) : tooltipAll;
  const tooltipMore = tooltipAll.length - tooltipRows.length;
  const hoverLeft = hover === null ? 0 : margin.left + x(hover);
  const flip = hoverLeft > width / 2;

  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg
          ref={setSvg}
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          className={onViewChange ? 'chart--zoomable' : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => {
            setHover(null);
            setPointerY(null);
          }}
          style={hot ? { cursor: 'pointer' } : undefined}
          onDoubleClick={onViewChange && zoomed ? () => onViewChange(null) : undefined}
          onKeyDown={onKeyDown}
          onBlur={() => setHover(null)}
        >
          {/* Lines outside a zoomed y range are cut at the plot's edge (with room for dots). */}
          <defs>
            <clipPath id={clipId}>
              <rect x={-6} y={-6} width={plotW + 12} height={plotH + 12} />
            </clipPath>
          </defs>
          <g transform={`translate(${margin.left},${margin.top})`}>
            {bands.map((band, i) => {
              const left = x(Math.max(v0, band.from - 0.5));
              const right = x(Math.min(v1, band.to + 0.5));
              if (right <= left) return null;
              return (
                <rect
                  key={i}
                  className="chart__band"
                  x={left}
                  y={0}
                  width={Math.max(1, right - left)}
                  height={plotH}
                />
              );
            })}
            {yTicks.map((t) => (
              <g key={t} transform={`translate(0,${y(t).toFixed(1)})`}>
                <line className="chart__grid" x1={0} x2={plotW} />
                <text className="chart__tick" x={-8} dy="0.32em" textAnchor="end">
                  {yFormat(t)}
                </text>
              </g>
            ))}
            {rules
              .filter((rule) => rule.at > v0 && rule.at <= v1)
              .map((rule) => (
                <g key={rule.at} transform={`translate(${x(rule.at).toFixed(1)},0)`}>
                  <line className="chart__rule" y1={0} y2={plotH} />
                  <text className="chart__rule-label" x={-4} y={10} textAnchor="end">
                    {rule.label}
                  </text>
                </g>
              ))}
            <line className="chart__axis" x1={0} x2={plotW} y1={plotH} y2={plotH} />
            {xTicks.map((t) => (
              <text
                key={t}
                className="chart__tick"
                x={x(t)}
                y={plotH + 19}
                textAnchor={x(t) < 12 ? 'start' : x(t) > plotW - 12 ? 'end' : 'middle'}
              >
                {xTickLabel(t)}
              </text>
            ))}
            <g
              clipPath={`url(#${clipId})`}
              className={hot ? 'chart__lines chart__lines--dim' : 'chart__lines'}
            >
              {context.map((s) => (
                <path key={s.id} className="chart__line chart__line--context" d={path(s)} />
              ))}
              {colored.map((s) => (
                <path key={s.id} className="chart__line" d={path(s)} style={{ stroke: s.color! }} />
              ))}
              {dots &&
                colored.map((s) =>
                  s.values.map((v, i) =>
                    v === null || i < first || i > final ? null : (
                      <circle
                        key={`${s.id}-${i}`}
                        className="chart__dot"
                        cx={x(i)}
                        cy={y(v)}
                        r={hover === i ? 5 : 4}
                        style={{ fill: s.color! }}
                      />
                    ),
                  ),
                )}
              {/* The line under the pointer, drawn again on top so it can be followed. */}
              {hot && (
                <path
                  className="chart__line chart__line--hot"
                  d={path(hot.s)}
                  style={{ stroke: hot.s.color ?? 'var(--text)' }}
                />
              )}
            </g>
            {hover !== null && (
              <g>
                <line className="chart__crosshair" x1={x(hover)} x2={x(hover)} y1={0} y2={plotH} />
                {!dots &&
                  tooltipRows.map(({ s, v }) =>
                    s.color === null ? null : (
                      <circle
                        key={s.id}
                        className="chart__dot"
                        cx={x(hover)}
                        cy={y(v)}
                        r={4}
                        style={{ fill: s.color }}
                      />
                    ),
                  )}
              </g>
            )}
            {drag && drag.to !== drag.from && (
              <rect
                className="chart__selection"
                x={x(Math.min(drag.from, drag.to))}
                y={0}
                width={Math.abs(x(drag.to) - x(drag.from))}
                height={plotH}
              />
            )}
            {/* Hit area over the whole plot, so the pointer only has to find the x. */}
            <rect className="chart__hit" x={0} y={0} width={plotW} height={plotH} />
          </g>
        </svg>
      )}
      {hover !== null && tooltipRows.length > 0 && (
        <div
          className="chart__tooltip"
          role="status"
          style={
            flip
              ? { right: width - hoverLeft + 12, top: margin.top }
              : { left: hoverLeft + 12, top: margin.top }
          }
        >
          <div className="chart__tooltip-title">{xTooltipLabel(hover)}</div>
          <div
            className="chart__tooltip-rows"
            style={{ columnCount: Math.ceil(tooltipRows.length / TOOLTIP_COLUMN_ROWS) }}
          >
            {tooltipRows.map(({ s, v }) => (
              <div
                key={s.id}
                className={
                  hot?.s.id === s.id
                    ? 'chart__tooltip-row chart__tooltip-row--hot'
                    : 'chart__tooltip-row'
                }
              >
                {s.color && (
                  <span className="chart__key" style={{ background: s.color }} aria-hidden="true" />
                )}
                {ranked && <span className="chart__tooltip-rank">{rankOf(s.id, v) ?? '—'}</span>}
                <span className="chart__tooltip-value">{yFormat(v)}</span>
                <span className="chart__tooltip-label">{s.label}</span>
              </div>
            ))}
          </div>
          {tooltipMore > 0 && <div className="chart__tooltip-more">+ {tooltipMore} more</div>}
        </div>
      )}
      {/* The name of the line under the pointer, on the side away from the tooltip. */}
      {hot && hover !== null && (
        <div
          className="chart__line-label"
          aria-hidden="true"
          style={{
            top: margin.top + y(hot.v),
            ...(flip ? { left: hoverLeft + 10 } : { right: width - hoverLeft + 10 }),
          }}
        >
          {hot.s.color && <span className="chart__key" style={{ background: hot.s.color }} />}
          <span>{hot.s.label}</span>
        </div>
      )}
    </div>
  );
}
