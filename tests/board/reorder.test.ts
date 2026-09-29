import { describe, expect, it } from 'vitest';
import { slideOffsets, type Point } from '../../src/hooks/useRowReorderAnimation.ts';

const at = (entries: [string, number, number][]) =>
  new Map<string, Point>(entries.map(([k, x, y]) => [k, { x, y }]));
const row = (key: string, x: number, y: number, vx = 0, vy = 0) => ({
  key,
  layout: { x, y },
  visualOffset: { x: vx, y: vy },
});

describe('slideOffsets', () => {
  it('starts each moved row from its old position', () => {
    // #5 and #2 swap P1/P2 (30 px rows).
    const offsets = slideOffsets(
      at([
        ['5', 0, 0],
        ['2', 0, 30],
        ['11', 0, 60],
      ]),
      [row('2', 0, 0), row('5', 0, 30), row('11', 0, 60)],
    );
    expect(offsets).toEqual(
      new Map([
        ['2', { x: 0, y: 30 }],
        ['5', { x: 0, y: -30 }],
      ]),
    );
  });

  it('slides across the two tables of a split layout', () => {
    // P20 (bottom of the left table) drops to P21 (top of the right table).
    const offsets = slideOffsets(at([['9', 0, 600]]), [row('9', 700, 30)]);
    expect(offsets.get('9')).toEqual({ x: -700, y: 570 });
  });

  it('continues an interrupted slide from where the row is on screen', () => {
    // #2 was sliding up from P3 and is still drawn 20 px low when it moves again.
    const offsets = slideOffsets(at([['2', 0, 30]]), [row('2', 0, 0, 0, 20)]);
    expect(offsets.get('2')).toEqual({ x: 0, y: 50 });
  });

  it('ignores new rows and sub-pixel moves', () => {
    const offsets = slideOffsets(at([['5', 0, 0]]), [row('5', 0.3, 0.4), row('99', 0, 30)]);
    expect(offsets.size).toBe(0);
  });
});
