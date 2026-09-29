import { useLayoutEffect, useRef, type RefObject } from 'react';

const DURATION_MS = 600;
const EASING = 'cubic-bezier(0.2, 0, 0, 1)';

export interface Point {
  x: number;
  y: number;
}

/**
 * Where each row should start its slide from, relative to its new layout position. Positions
 * are on-screen (rows can move between the two tables of a split layout). `visualOffset` is any
 * transform still applied from an interrupted slide, so a row that is mid-animation continues
 * from where it is on screen instead of jumping.
 */
export function slideOffsets(
  previous: ReadonlyMap<string, Point>,
  rows: readonly { key: string; layout: Point; visualOffset: Point }[],
): Map<string, Point> {
  const offsets = new Map<string, Point>();
  for (const { key, layout, visualOffset } of rows) {
    const before = previous.get(key);
    if (before === undefined) continue;
    const dx = before.x + visualOffset.x - layout.x;
    const dy = before.y + visualOffset.y - layout.y;
    if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) offsets.set(key, { x: dx, y: dy });
  }
  return offsets;
}

/**
 * Slides table rows (`tr[data-row-key]` inside `container`) from their previous position to
 * their new one whenever `order` changes. Skipped when the layout changes (a resize or a
 * switch between single and split tables, not a reorder) and for users who prefer reduced
 * motion.
 */
export function useRowReorderAnimation(
  container: RefObject<HTMLElement | null>,
  order: string,
  layoutKey: string | undefined,
) {
  const previous = useRef(new Map<string, Point>());
  const previousLayoutKey = useRef(layoutKey);

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const origin = root.getBoundingClientRect();
    const rows = [...root.querySelectorAll<HTMLTableRowElement>('tr[data-row-key]')];

    const measured = rows.map((row) => {
      const rect = row.getBoundingClientRect();
      const visualOffset = currentTranslate(row);
      return {
        row,
        key: row.dataset.rowKey!,
        // Layout position = where it's drawn minus any in-flight transform.
        layout: {
          x: rect.left - origin.left - visualOffset.x,
          y: rect.top - origin.top - visualOffset.y,
        },
        visualOffset,
      };
    });

    const relayout = previousLayoutKey.current !== layoutKey;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!relayout && !reduceMotion) {
      const offsets = slideOffsets(previous.current, measured);
      for (const { row, key } of measured) {
        const offset = offsets.get(key);
        if (offset === undefined) continue;
        for (const animation of row.getAnimations()) {
          if (animation.id === 'reorder') animation.cancel();
        }
        const slide = row.animate(
          // Lifted above the rows it passes while it slides.
          [
            { transform: `translate(${offset.x}px, ${offset.y}px)`, zIndex: 1 },
            { transform: 'translate(0, 0)', zIndex: 1 },
          ],
          { duration: DURATION_MS, easing: EASING },
        );
        slide.id = 'reorder';
      }
    }

    previous.current = new Map(measured.map(({ key, layout }) => [key, layout]));
    previousLayoutKey.current = layoutKey;
  }, [container, order, layoutKey]);
}

function currentTranslate(row: HTMLElement): Point {
  const transform = getComputedStyle(row).transform;
  if (!transform || transform === 'none') return { x: 0, y: 0 };
  const matrix = new DOMMatrixReadOnly(transform);
  return { x: matrix.m41, y: matrix.m42 };
}
