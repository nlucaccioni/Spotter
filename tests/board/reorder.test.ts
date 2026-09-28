import { describe, expect, it } from 'vitest';
import { slideOffsets } from '../../src/hooks/useRowReorderAnimation.ts';

const tops = (entries: [string, number][]) => new Map(entries);

describe('slideOffsets', () => {
  it('starts each moved row from its old position', () => {
    // #5 and #2 swap P1/P2 (30 px rows).
    const offsets = slideOffsets(
      tops([
        ['5', 0],
        ['2', 30],
        ['11', 60],
      ]),
      [
        { key: '2', top: 0, visualOffset: 0 },
        { key: '5', top: 30, visualOffset: 0 },
        { key: '11', top: 60, visualOffset: 0 },
      ],
    );
    expect(offsets).toEqual(
      new Map([
        ['2', 30],
        ['5', -30],
      ]),
    );
  });

  it('continues an interrupted slide from where the row is on screen', () => {
    // #2 was sliding up from P3 and is still drawn 20 px low when it moves again.
    const offsets = slideOffsets(tops([['2', 30]]), [{ key: '2', top: 0, visualOffset: 20 }]);
    expect(offsets.get('2')).toBe(50);
  });

  it('ignores new rows and sub-pixel moves', () => {
    const offsets = slideOffsets(tops([['5', 0]]), [
      { key: '5', top: 0.4, visualOffset: 0 },
      { key: '99', top: 30, visualOffset: 0 },
    ]);
    expect(offsets.size).toBe(0);
  });
});
