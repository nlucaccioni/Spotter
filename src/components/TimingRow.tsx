import { memo, useEffect, useRef } from 'react';
import { formatGap } from '../data/model/gaps.ts';
import type { CarState } from '../data/model/types.ts';
import {
  BADGE_LABELS,
  formatChange,
  formatLapTime,
  formatManufacturer,
  formatName,
  formatPits,
  formatStatus,
  isOut,
  pitIndicator,
} from './board/format.ts';
import type { ColumnDef, NameFormat } from './board/layout.ts';

interface Props {
  car: CarState;
  columns: ColumnDef[];
  nameFormat: NameFormat;
  /** Session-best lap time, for highlighting. */
  sessionBest: number | null;
  sessionFinished: boolean;
  /** Positions gained (+) or lost (−) on the latest update; 0 = no change. */
  positionChange: number;
  /** Changes on every update, so the flash replays even for repeat moves. */
  updateId: number;
}

export const TimingRow = memo(function TimingRow({
  car,
  columns,
  nameFormat,
  sessionBest,
  sessionFinished,
  positionChange,
  updateId,
}: Props) {
  const out = isOut(car);
  const rowRef = useRef<HTMLTableRowElement>(null);

  // Brief up/down flash when the car changes position. Toggling the class (with a reflow in
  // between) restarts the CSS animation even if the previous flash hasn't finished.
  useEffect(() => {
    const row = rowRef.current;
    if (!row || positionChange === 0) return;
    row.classList.remove('timing-row--flash-up', 'timing-row--flash-down');
    void row.offsetWidth;
    row.classList.add(positionChange > 0 ? 'timing-row--flash-up' : 'timing-row--flash-down');
  }, [positionChange, updateId]);

  return (
    <tr
      ref={rowRef}
      data-row-key={car.carNumber}
      className={`timing-row${out ? ' timing-row--out' : ''}`}
    >
      {columns.map((column) => (
        <Cell
          key={column.id}
          column={column}
          car={car}
          nameFormat={nameFormat}
          sessionBest={sessionBest}
          sessionFinished={sessionFinished}
        />
      ))}
    </tr>
  );
});

function Cell({
  column,
  car,
  nameFormat,
  sessionBest,
  sessionFinished,
}: Omit<Props, 'columns' | 'positionChange' | 'updateId'> & { column: ColumnDef }) {
  const align = `cell--${column.align}`;
  switch (column.id) {
    case 'pos':
      return <td className={`${align} cell--pos`}>{car.position}</td>;

    case 'change': {
      const g = car.positionsGained;
      const tone = g === null || g === 0 ? '' : g > 0 ? ' cell--up' : ' cell--down';
      return <td className={`${align} cell--mono${tone}`}>{formatChange(g)}</td>;
    }

    case 'car':
      return <td className={`${align} cell--car`}>{car.carNumber}</td>;

    case 'driver':
      return (
        <td className={`${align} cell--driver`} title={`${car.name.full} · ${car.sponsor}`}>
          <span className="driver-name">{formatName(car.name, nameFormat)}</span>
          {car.name.badges.map((badge) => (
            <span
              key={badge}
              className={`badge badge--${badge}`}
              title={BADGE_LABELS[badge].title}
              aria-label={BADGE_LABELS[badge].title}
            >
              {BADGE_LABELS[badge].short}
            </span>
          ))}
          {car.isOnDvp && (
            <span className="badge badge--dvp" title="Damaged Vehicle Policy clock active">
              DVP
            </span>
          )}
        </td>
      );

    case 'mfr':
      return (
        <td className={align} title={car.manufacturer.name}>
          {formatManufacturer(car.manufacturer.name)}
        </td>
      );

    case 'gap':
      return <td className={`${align} cell--mono`}>{formatGap(car.gapToLeader)}</td>;

    case 'interval':
      return <td className={`${align} cell--mono`}>{formatGap(car.interval)}</td>;

    case 'last': {
      const last = car.lastLap?.seconds;
      // Personal best on the lap just completed, and whether that's also the session best.
      const personalBest =
        last !== undefined && car.bestLap !== null && car.bestLap.lap === car.lapsCompleted;
      const highlight = personalBest
        ? last === sessionBest
          ? ' cell--session-best'
          : ' cell--personal-best'
        : '';
      return (
        <td
          className={`${align} cell--mono${highlight}`}
          title={
            highlight
              ? last === sessionBest
                ? 'Session best lap'
                : 'Personal best lap'
              : undefined
          }
        >
          {formatLapTime(last)}
        </td>
      );
    }

    case 'best': {
      const best = car.bestLap?.seconds;
      const isSessionBest = best !== undefined && best === sessionBest;
      return (
        <td
          className={`${align} cell--mono${isSessionBest ? ' cell--session-best' : ''}`}
          title={
            car.bestLap?.lap
              ? `Lap ${car.bestLap.lap}${isSessionBest ? ' · session best' : ''}`
              : undefined
          }
        >
          {formatLapTime(best)}
        </td>
      );
    }

    case 'laps':
      return <td className={`${align} cell--mono`}>{car.lapsCompleted}</td>;

    case 'led':
      return <td className={`${align} cell--mono`}>{car.lapsLed || ''}</td>;

    case 'pits': {
      const indicator = pitIndicator(car, sessionFinished);
      return (
        <td className={`${align} cell--mono`}>
          {indicator && (
            <span className={`badge badge--pit badge--pit-${indicator}`}>
              {indicator === 'in-pit' ? 'IN' : 'PIT'}
            </span>
          )}
          {formatPits(car, indicator !== null)}
        </td>
      );
    }

    case 'status':
      return <td className={align}>{formatStatus(car)}</td>;
  }
}
