import { useState, type ReactNode } from 'react';

// A sortable table in the points page's style. Click a header to sort by it; again to reverse.

export interface Column<T> {
  id: string;
  label: string;
  /** Full meaning, shown as the header's tooltip. */
  title?: string;
  /** Sort value; null sorts last either way. */
  value?: (row: T) => number | string | null;
  render: (row: T) => ReactNode;
  numeric?: boolean;
  /** Higher-is-better columns sort descending first. */
  descending?: boolean;
  /** p2/p3: dropped first on narrow screens (see .points-table). */
  className?: string;
  /** Extra header class, e.g. th--centered over centered logos. */
  headerClassName?: string | undefined;
}

interface Props<T> {
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey: (row: T) => string;
  caption: string;
  rowClass?: (row: T) => string | undefined;
  /** Sorted by this column at first (descending if `desc`); otherwise rows keep their order. */
  initialSort?: { id: string; desc: boolean };
}

export function DataTable<T>({ rows, columns, rowKey, caption, rowClass, initialSort }: Props<T>) {
  const [sort, setSort] = useState<{ id: string; desc: boolean } | null>(initialSort ?? null);
  const column = sort && columns.find((c) => c.id === sort.id);
  const sorted =
    column?.value && sort
      ? [...rows].sort((a, b) => {
          const va = column.value!(a);
          const vb = column.value!(b);
          if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
          const order =
            typeof va === 'number' && typeof vb === 'number'
              ? va - vb
              : String(va).localeCompare(String(vb));
          return sort.desc ? -order : order;
        })
      : rows;

  return (
    <div className="points-table-wrap analysis-table">
      <table className="points-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.id === c.id;
              const cls =
                [c.numeric ? 'num' : '', c.className ?? '', c.headerClassName ?? '']
                  .join(' ')
                  .trim() || undefined;
              return (
                <th
                  key={c.id}
                  scope="col"
                  className={cls}
                  title={c.title}
                  aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : undefined}
                >
                  {c.value ? (
                    <button
                      type="button"
                      className="analysis-table__sort"
                      onClick={() =>
                        setSort(
                          active
                            ? { id: c.id, desc: !sort.desc }
                            : { id: c.id, desc: c.descending ?? false },
                        )
                      }
                    >
                      {c.label}
                      {active && <span aria-hidden="true">{sort.desc ? ' ▾' : ' ▴'}</span>}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)} className={rowClass?.(row)}>
              {columns.map((c) => (
                <td
                  key={c.id}
                  className={
                    [c.numeric ? 'num mono' : '', c.className ?? ''].join(' ').trim() || undefined
                  }
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
