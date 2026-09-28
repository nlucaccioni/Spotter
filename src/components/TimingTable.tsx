import { useMemo, useState, type CSSProperties } from 'react';
import type { Session } from '../data/model/types.ts';
import { useElementSize } from '../hooks/useElementSize.ts';
import { computeBoardLayout } from './board/layout.ts';
import { DEFAULT_SORT, nextSort, sortCars, type SortState } from './board/sort.ts';
import { TimingRow } from './TimingRow.tsx';

interface Props {
  session: Session;
}

export function TimingTable({ session }: Props) {
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const { cars } = session;
  const layout = useMemo(
    () => size && computeBoardLayout(size.width, size.height, cars.length),
    [size, cars.length],
  );
  const sorted = useMemo(() => sortCars(cars, sort), [cars, sort]);

  const sessionBest = session.fastestLap?.seconds ?? null;
  const sessionFinished = session.flag.kind === 'checkered';

  return (
    <div
      ref={containerRef}
      className={`timing${layout?.scroll ? ' timing--scroll' : ''}`}
      style={
        layout
          ? ({
              '--row-h': `${layout.rowHeightPx}px`,
              fontSize: `${layout.fontSizePx}px`,
            } as CSSProperties)
          : undefined
      }
    >
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
          <tbody>
            {sorted.map((car) => (
              <TimingRow
                key={car.carNumber}
                car={car}
                columns={layout.columns}
                nameFormat={layout.nameFormat}
                sessionBest={sessionBest}
                sessionFinished={sessionFinished}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
