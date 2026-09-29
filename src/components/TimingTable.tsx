import { useMemo, useRef, useState } from 'react';
import type { CarState, Session } from '../data/model/types.ts';
import { favoriteKey } from '../prefs/preferences.ts';
import { useRowReorderAnimation } from '../hooks/useRowReorderAnimation.ts';
import { COLUMNS, SPLIT_GAP_PX, type BoardLayout } from './board/layout.ts';
import { DEFAULT_SORT, nextSort, pinToTop, sortCars, type SortState } from './board/sort.ts';
import { TimingRow } from './TimingRow.tsx';

interface Props {
  session: Session;
  positionChanges: Map<string, number> | null;
  updateId: number;
  /** Computed by Board, which sizes the flag banner and table rows together. */
  layout: BoardLayout | null;
  favorites: ReadonlySet<string>;
  pinFavorites: boolean;
  onToggleFavorite: (key: string) => void;
  outLaps: ReadonlySet<string>;
  /** Car-number graphic lookup when the opt-in is on, otherwise null. */
  badgeFor: ((car: CarState) => string | null) | null;
}

export function TimingTable({
  session,
  positionChanges,
  updateId,
  layout,
  favorites,
  pinFavorites,
  onToggleFavorite,
  outLaps,
  badgeFor,
}: Props) {
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const { cars } = session;
  const sorted = useMemo(() => {
    const byColumn = sortCars(cars, sort);
    return pinFavorites ? pinToTop(byColumn, (c) => favorites.has(favoriteKey(c))) : byColumn;
  }, [cars, sort, pinFavorites, favorites]);

  // Landscape: two side-by-side tables, first half of the order on the left.
  const groups = useMemo(() => {
    if (!layout?.split) return [sorted];
    const half = Math.ceil(sorted.length / 2);
    return [sorted.slice(0, half), sorted.slice(half)];
  }, [sorted, layout?.split]);

  // Rows slide to their new place when the order changes (position swaps, re-sorting, or
  // crossing between the two tables).
  const containerRef = useRef<HTMLDivElement>(null);
  const order = sorted.map((c) => c.carNumber).join(',');
  useRowReorderAnimation(
    containerRef,
    order,
    layout ? `${layout.rowHeightPx}:${layout.split}` : undefined,
  );

  const sessionBest = session.fastestLap?.seconds ?? null;
  const sessionFinished = session.flag.kind === 'checkered';
  const sortLabel = COLUMNS.find((c) => c.id === sort.column)?.title ?? 'position';

  if (cars.length === 0) {
    return (
      <div className="timing timing--empty">
        <p>No cars in this session yet.</p>
      </div>
    );
  }

  let firstIndex = 0;
  return (
    <div
      ref={containerRef}
      className={`timing${layout?.scroll ? ' timing--scroll' : ''}${layout?.split ? ' timing--split' : ''}`}
      style={layout?.split ? { gap: `${SPLIT_GAP_PX}px` } : undefined}
    >
      {layout &&
        groups.map((group, groupIndex) => {
          const from = firstIndex + 1;
          firstIndex += group.length;
          return (
            <table key={groupIndex} className="timing-table">
              <caption className="visually-hidden">
                Timing board
                {groups.length > 1 ? `, rows ${from} to ${firstIndex}` : ''}, sorted by{' '}
                {sortLabel.toLowerCase()}
                {sort.direction === 'desc' ? ', descending' : ''}
              </caption>
              <colgroup>
                {layout.columns.map((c) => (
                  <col key={c.id} style={c.widthEm ? { width: `${c.widthEm}em` } : undefined} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {layout.columns.map((c) => {
                    const active = sort.column === c.id;
                    return (
                      <th
                        key={c.id}
                        scope="col"
                        className={`cell--${c.align} col-${c.id}`}
                        aria-sort={
                          active
                            ? sort.direction === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : undefined
                        }
                      >
                        <button
                          type="button"
                          className="sort-button"
                          title={`${c.title} — click to sort`}
                          onClick={() =>
                            setSort((s) =>
                              c.id === 'pos' && s.column !== 'pos'
                                ? DEFAULT_SORT
                                : nextSort(s, c.id),
                            )
                          }
                        >
                          {c.label}
                          {active && sort.column !== 'pos' && (
                            <span aria-hidden="true">{sort.direction === 'asc' ? ' ▴' : ' ▾'}</span>
                          )}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {group.map((car) => (
                  <TimingRow
                    key={car.carNumber}
                    car={car}
                    columns={layout.columns}
                    nameFormat={layout.nameFormat}
                    sessionBest={sessionBest}
                    sessionFinished={sessionFinished}
                    positionChange={positionChanges?.get(car.carNumber) ?? 0}
                    updateId={updateId}
                    favorite={favorites.has(favoriteKey(car))}
                    onOutLap={outLaps.has(car.carNumber)}
                    badgeUrl={badgeFor?.(car) ?? null}
                    favoriteKey={favoriteKey(car)}
                    onToggleFavorite={onToggleFavorite}
                  />
                ))}
              </tbody>
            </table>
          );
        })}
    </div>
  );
}
