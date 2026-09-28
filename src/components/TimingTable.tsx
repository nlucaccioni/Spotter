import { useMemo, useRef, useState } from 'react';
import type { Session } from '../data/model/types.ts';
import { favoriteKey } from '../prefs/preferences.ts';
import { useRowReorderAnimation } from '../hooks/useRowReorderAnimation.ts';
import type { BoardLayout } from './board/layout.ts';
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
}: Props) {
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const { cars } = session;
  const sorted = useMemo(() => {
    const byColumn = sortCars(cars, sort);
    return pinFavorites ? pinToTop(byColumn, (c) => favorites.has(favoriteKey(c))) : byColumn;
  }, [cars, sort, pinFavorites, favorites]);

  // Rows slide to their new place when the order changes (position swaps or re-sorting).
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const order = sorted.map((c) => c.carNumber).join(',');
  useRowReorderAnimation(bodyRef, order, layout?.rowHeightPx);

  const sessionBest = session.fastestLap?.seconds ?? null;
  const sessionFinished = session.flag.kind === 'checkered';

  return (
    <div className={`timing${layout?.scroll ? ' timing--scroll' : ''}`}>
      {layout && (
        <table className="timing-table">
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
                    className={`cell--${c.align}`}
                    aria-sort={
                      active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                  >
                    <button
                      type="button"
                      className="sort-button"
                      title={`${c.title} — click to sort`}
                      onClick={() =>
                        setSort((s) =>
                          c.id === 'pos' && s.column !== 'pos' ? DEFAULT_SORT : nextSort(s, c.id),
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
          <tbody ref={bodyRef}>
            {sorted.map((car) => (
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
                favoriteKey={favoriteKey(car)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
