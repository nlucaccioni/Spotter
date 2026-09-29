import { describe, expect, it } from 'vitest';
import {
  COLUMNS,
  computeBoardLayout,
  LIMITS,
  type ColumnId,
} from '../../src/components/board/layout.ts';

// Single-table layout, so column behaviour can be checked across any width.
const ids = (width: number, height: number, cars = 40) =>
  computeBoardLayout(width, height, cars, { allowSplit: false }).columns.map((c) => c.id);

const ALWAYS = ['pos', 'car', 'driver', 'gap', 'interval', 'last'];

describe('computeBoardLayout — fitting the field', () => {
  it('sizes rows so the whole field plus the header row fits', () => {
    const layout = computeBoardLayout(1080, 1700, 40);
    expect(layout.rowHeightPx).toBe(Math.floor(1700 / 41));
    expect(layout.rowHeightPx * 41).toBeLessThanOrEqual(1700);
    expect(layout.scroll).toBe(false);
  });

  it('grows rows for a small field, up to a cap', () => {
    expect(computeBoardLayout(1080, 1700, 10).rowHeightPx).toBe(LIMITS.maxRowPx);
    expect(computeBoardLayout(1080, 1700, 30).rowHeightPx).toBe(Math.floor(1700 / 31));
  });

  it('falls back to scrolling instead of shrinking below the minimum readable size', () => {
    const layout = computeBoardLayout(1080, 500, 40, { allowSplit: false });
    expect(layout).toMatchObject({ scroll: true, rowHeightPx: LIMITS.minRowPx });
    expect(layout.fontSizePx).toBeGreaterThanOrEqual(LIMITS.minFontPx);
  });

  it('keeps the font within its limits', () => {
    expect(computeBoardLayout(1440, 2400, 36).fontSizePx).toBe(LIMITS.maxFontPx);
    expect(computeBoardLayout(720, 500, 40).fontSizePx).toBe(LIMITS.minFontPx);
  });
});

describe('computeBoardLayout — column priority', () => {
  it('always shows the priority-1 columns, even on a phone', () => {
    const phone = ids(360, 600);
    for (const id of ALWAYS) expect(phone).toContain(id);
  });

  it('adds columns in priority order as width grows, never skipping ahead', () => {
    const order: ColumnId[] = ['best', 'change', 'led', 'pits', 'mfr', 'laps', 'status'];
    let previous = 0;
    for (let width = 360; width <= 2000; width += 20) {
      const shown = ids(width, 1700).filter((id) => order.includes(id));
      // Whatever is shown is always a prefix of the priority order.
      const expected = order.filter((id) => shown.includes(id));
      expect(shown.sort()).toEqual(order.slice(0, expected.length).sort());
      expect(shown.length).toBeGreaterThanOrEqual(previous);
      previous = shown.length;
    }
    expect(previous).toBe(order.length);
  });

  it.each([
    // Portrait targets from the brief, full 40-car field; heights allow for banner + header.
    [720, 1150],
    [864, 1400],
    [1080, 1750],
    [1440, 2400],
  ])('shows every priority-2 column at %i×%i', (width, height) => {
    const shown = ids(width, height);
    for (const id of ['best', 'change', 'led', 'pits']) expect(shown).toContain(id);
  });

  it('shows every column on a wide screen', () => {
    expect(ids(1440, 2400)).toHaveLength(COLUMNS.length);
  });

  it('keeps columns in display order', () => {
    const order = COLUMNS.map((c) => c.id);
    const shown = ids(1080, 1750);
    expect(shown).toEqual(order.filter((id) => shown.includes(id)));
  });
});

describe('computeBoardLayout — driver name length', () => {
  it('shortens names as the driver column narrows', () => {
    expect(computeBoardLayout(1440, 2400, 36).nameFormat).toBe('full');
    expect(computeBoardLayout(360, 600, 40).nameFormat).not.toBe('full');
  });
});

describe('computeBoardLayout — extra rows', () => {
  it('fits extra row-sized elements (the flag banner) alongside the table', () => {
    const withBanner = computeBoardLayout(1080, 1700, 40, { extraRows: 1 });
    expect(withBanner.rowHeightPx).toBe(Math.floor(1700 / 42));
    expect(withBanner.rowHeightPx * 42).toBeLessThanOrEqual(1700);
  });
});

describe('computeBoardLayout — hidden columns', () => {
  it('drops hidden columns, including priority-1 ones', () => {
    const shown = computeBoardLayout(1080, 1750, 40, {
      hidden: new Set<ColumnId>(['interval', 'best']),
    }).columns.map((c) => c.id);
    expect(shown).not.toContain('interval');
    expect(shown).not.toContain('best');
    expect(shown).toContain('gap');
  });

  it('gives the freed width to lower-priority columns', () => {
    const width = 864;
    const before = computeBoardLayout(width, 1400, 36).columns.map((c) => c.id);
    const after = computeBoardLayout(width, 1400, 36, {
      hidden: new Set<ColumnId>(['change', 'led']),
    }).columns.map((c) => c.id);
    expect(before).not.toContain('status');
    expect(after.length).toBeGreaterThanOrEqual(before.length - 2);
    expect(after).toContain('mfr');
  });
});

describe('computeBoardLayout — landscape split', () => {
  it('never splits a portrait screen', () => {
    expect(computeBoardLayout(1080, 1750, 40).split).toBe(false);
  });

  it('splits a landscape screen into two tables with bigger text', () => {
    const single = computeBoardLayout(1920, 950, 40, { allowSplit: false });
    const split = computeBoardLayout(1920, 950, 40);
    expect(split.split).toBe(true);
    expect(split.rowHeightPx).toBe(Math.floor(950 / 21));
    expect(split.fontSizePx).toBeGreaterThan(single.fontSizePx);
    expect(split.nameFormat).not.toBe('last');
  });

  it('avoids scrolling on a short landscape window', () => {
    const layout = computeBoardLayout(1080, 500, 40);
    expect(layout).toMatchObject({ split: true, scroll: false });
  });

  it("stays single when half the width can't fit the essential columns", () => {
    expect(computeBoardLayout(700, 600, 40).split).toBe(false);
  });

  it('can be turned off', () => {
    expect(computeBoardLayout(1920, 950, 40, { allowSplit: false }).split).toBe(false);
  });
});

describe('computeBoardLayout — scrolling', () => {
  it('leaves room for a scrollbar when the table has to scroll', () => {
    // 386px at the 12px minimum font is ~32.2em: enough for Best (needs 31.4em) only if the
    // scrollbar's width is ignored. The table scrolls here, so Best must be left out.
    const layout = computeBoardLayout(386, 600, 40, { allowSplit: false });
    expect(layout).toMatchObject({ scroll: true, fontSizePx: LIMITS.minFontPx });
    expect(layout.columns.map((c) => c.id)).not.toContain('best');
  });
});
