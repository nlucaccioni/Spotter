// Small scale helpers for the hand-drawn SVG charts.

/** Maps a domain onto a pixel range (linear). */
export function linear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const scale = (value: number) => r0 + ((value - d0) / span) * (r1 - r0);
  scale.invert = (pixel: number) => d0 + ((pixel - r0) / (r1 - r0 || 1)) * span;
  return scale;
}

/** About `count` round tick values covering [min, max] (1, 2, 2.5 or 5 × a power of ten). */
export function niceTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const raw = (max - min) / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * power >= raw) ?? 10) * power;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks;
}

/** Whole-number ticks (laps, positions, races), at least `minStep` apart. */
export function integerTicks(min: number, max: number, count: number, minStep = 1): number[] {
  const ticks = niceTicks(min, max, count).filter((t) => Number.isInteger(t));
  if (ticks.length >= 2 && ticks[1]! - ticks[0]! >= minStep) return ticks;
  const out: number[] = [];
  for (let v = Math.ceil(min); v <= max; v += minStep) out.push(v);
  return out;
}

/** SVG path for a line with gaps where values are missing. */
export function linePath(points: readonly (readonly [number, number] | null)[]): string {
  let d = '';
  let drawing = false;
  for (const point of points) {
    if (!point) {
      drawing = false;
      continue;
    }
    d += `${drawing ? 'L' : 'M'}${point[0].toFixed(1)},${point[1].toFixed(1)}`;
    drawing = true;
  }
  return d;
}

/** Plot padding shared by charts that line up with each other; the left leaves room for y ticks. */
export const CHART_MARGIN = { top: 12, right: 16, bottom: 28, left: 54 };

/** An x range shown on a zoomed chart: [from, to] in x positions (may be fractional). */
export type XView = readonly [number, number];

/** Keeps a zoomed range inside the chart and at least `minSpan` wide, keeping its width. */
export function clampView(view: XView, bounds: XView, minSpan: number): [number, number] {
  const [lo, hi] = bounds;
  const span = Math.min(hi - lo, Math.max(minSpan, view[1] - view[0]));
  const from = Math.min(hi - span, Math.max(lo, view[0]));
  return [from, from + span];
}

/** Lowest and highest value of these series between two x positions, or null if none. */
export function extent(
  series: readonly { values: readonly (number | null)[] }[],
  from: number,
  to: number,
): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) {
    for (let i = Math.max(0, from); i <= to; i++) {
      const v = s.values[i];
      if (v === null || v === undefined) continue;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  return Number.isFinite(lo) ? [lo, hi] : null;
}
