import { useMemo } from 'react';
import { standingsMoves, type LivePointsEntry } from '../../data/feeds/points.ts';
import { BADGE_LABELS, formatChange } from '../board/format.ts';
import { formatBehind } from './format.ts';

interface Props {
  entries: LivePointsEntry[];
  /** Driver ids in the session on the board; others are dimmed. */
  inRace: ReadonlySet<number>;
  favorites: ReadonlySet<string>;
}

export function LivePointsTable({ entries, inRace, favorites }: Props) {
  const moves = useMemo(() => standingsMoves(entries), [entries]);
  const moveOf = new Map(entries.map((e, i) => [e, moves[i]!]));
  // Drivers with points or in today's race; the feed also lists everyone with a license.
  const rows = entries.filter(
    (e) => e.points > 0 || (e.driverId !== null && inRace.has(e.driverId)),
  );
  const hasBonus = rows.some((e) => e.bonusPoints !== 0);

  return (
    <div className="points-table-wrap">
      <table className="points-table">
        <caption className="visually-hidden">Live race points</caption>
        <thead>
          <tr>
            <th scope="col" className="num">
              Pos
            </th>
            <th scope="col" className="num p2" title="Places gained in the standings this race">
              ±
            </th>
            <th scope="col" className="num">
              #
            </th>
            <th scope="col">Driver</th>
            <th scope="col" className="num">
              Points
            </th>
            <th scope="col" className="num" title="Behind the leader">
              Leader
            </th>
            <th scope="col" className="num p2" title="Behind the driver ahead">
              Next
            </th>
            <th scope="col" className="num" title="Points earned in this race">
              Race
            </th>
            {[1, 2, 3].map((n) => (
              <th key={n} scope="col" className="num p3" title={`Stage ${n} points`}>
                S{n}
              </th>
            ))}
            {hasBonus && (
              <th scope="col" className="num p3" title="Bonus points">
                Bonus
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const racing = e.driverId !== null && inRace.has(e.driverId);
            const favorite = e.driverId !== null && favorites.has(`id:${e.driverId}`);
            const change = moveOf.get(e) ?? null;
            return (
              <tr
                key={`${e.position}-${e.driverId}`}
                className={`${racing || inRace.size === 0 ? '' : 'points-row--absent'}${favorite ? ' timing-row--favorite' : ''}`}
              >
                <td className="num strong">{e.position}</td>
                <td
                  className={`num mono p2${change && change > 0 ? ' cell--up' : change && change < 0 ? ' cell--down' : ''}`}
                >
                  {formatChange(change)}
                </td>
                <td className="num muted">{e.carNumber || '—'}</td>
                <td className="points-driver">
                  {e.name.full}
                  {e.name.badges.map((b) => (
                    <span
                      key={b}
                      className={`badge badge--${b}`}
                      title={BADGE_LABELS[b].title}
                      aria-label={BADGE_LABELS[b].title}
                    >
                      {BADGE_LABELS[b].short}
                    </span>
                  ))}
                </td>
                <td className="num mono strong">{e.points}</td>
                <td className="num mono">{formatBehind(e.behindLeader, e.position === 1)}</td>
                <td className="num mono p2">{formatBehind(e.behindNext, e.position === 1, '—')}</td>
                <td className="num mono">{e.earnedThisRace || ''}</td>
                {e.stages.map((stage, i) => (
                  <td
                    key={i}
                    className={`num mono p3${stage.won ? ' stage-won' : ''}`}
                    title={stage.won ? `Won stage ${i + 1}` : undefined}
                  >
                    {stage.points || ''}
                    {stage.won && <span className="visually-hidden"> (stage winner)</span>}
                  </td>
                ))}
                {hasBonus && <td className="num mono p3">{e.bonusPoints || ''}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
