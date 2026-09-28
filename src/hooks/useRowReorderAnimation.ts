import { useLayoutEffect, useRef, type RefObject } from 'react';

const DURATION_MS = 600;
const EASING = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * Where each row should start its slide from, relative to its new layout position.
 * `visualOffset` is any transform still applied from an interrupted slide, so a row that is
 * mid-animation continues from where it is on screen instead of jumping.
 */
export function slideOffsets(
  previousTops: ReadonlyMap<string, number>,
  rows: readonly { key: string; top: number; visualOffset: number }[],
): Map<string, number> {
  const offsets = new Map<string, number>();
  for (const { key, top, visualOffset } of rows) {
    const before = previousTops.get(key);
    if (before === undefined) continue;
    const dy = before + visualOffset - top;
    if (Math.abs(dy) >= 1) offsets.set(key, dy);
  }
  return offsets;
}

/**
 * Slides table rows (`tr[data-row-key]` inside `container`) from their previous position to
 * their new one whenever `order` changes. Skipped when the row height changes (a resize, not a
 * reorder) and for users who prefer reduced motion.
 */
export function useRowReorderAnimation(
  container: RefObject<HTMLElement | null>,
  order: string,
  rowHeight: number | undefined,
) {
  const previousTops = useRef(new Map<string, number>());
  const previousRowHeight = useRef(rowHeight);

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const rows = [...root.querySelectorAll<HTMLTableRowElement>('tr[data-row-key]')];

    const measured = rows.map((row) => ({
      row,
      key: row.dataset.rowKey!,
      top: row.offsetTop,
      visualOffset: currentTranslateY(row),
    }));

    const resized = previousRowHeight.current !== rowHeight;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!resized && !reduceMotion) {
      const offsets = slideOffsets(previousTops.current, measured);
      for (const { row, key } of measured) {
        const dy = offsets.get(key);
        if (dy === undefined) continue;
        for (const animation of row.getAnimations()) {
          if (animation.id === 'reorder') animation.cancel();
        }
        const slide = row.animate(
          // Lifted above the rows it passes while it slides.
          [
            { transform: `translateY(${dy}px)`, zIndex: 1 },
            { transform: 'translateY(0)', zIndex: 1 },
          ],
          { duration: DURATION_MS, easing: EASING },
        );
        slide.id = 'reorder';
      }
    }

    previousTops.current = new Map(measured.map(({ key, top }) => [key, top]));
    previousRowHeight.current = rowHeight;
  }, [container, order, rowHeight]);
}

function currentTranslateY(row: HTMLElement): number {
  const transform = getComputedStyle(row).transform;
  if (!transform || transform === 'none') return 0;
  return new DOMMatrixReadOnly(transform).m42;
}
