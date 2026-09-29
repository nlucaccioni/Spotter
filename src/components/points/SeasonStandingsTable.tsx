import type { SeasonStanding } from '../../data/feeds/points.ts';
import { formatManufacturer } from '../board/format.ts';
import { formatBehind } from './format.ts';

interface Props {
  standings: SeasonStanding[];
  favorites: ReadonlySet<string>;
}

export function SeasonStandingsTable({ standings, favorites }: Props) {
  // The feed lists everyone with a license; show drivers who have raced.
  const rows = standings.filter((s) => s.points > 0 || s.starts > 0);
  return (
    <div className="points-table-wrap">
      <table className="points-table points-table--season">
        <caption className="visually-hidden">Season standings</caption>
        <thead>
          <tr>
            <th scope="col" className="num">
              Pos
            </th>
            <th scope="col" className="num">
              #
            </th>
            <th scope="col">Driver</th>
            <th scope="col" className="p3">
              Mfr
            </th>
            <th scope="col" className="num">
              Points
            </th>
            <th scope="col" className="num" title="Behind the leader">
              Leader
            </th>
            <th scope="col" className="num p2" title="Behind the driver ahead">
              Next
            </th>
            <th scope="col" className="num">
              Wins
            </th>
            <th scope="col" className="num p2">
              Top 5
            </th>
            <th scope="col" className="num p2">
              Top 10
            </th>
            <th scope="col" className="num p3" title="Stage wins">
              Stages
            </th>
            <th scope="col" className="num p3">
              Led
            </th>
            <th scope="col" className="num p3" title="Did not finish">
              DNF
            </th>
            <th scope="col" className="num p3">
              Starts
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const favorite = s.driverId !== null && favorites.has(`id:${s.driverId}`);
            return (
              <tr
                key={`${s.position}-${s.driverId}`}
                className={favorite ? 'timing-row--favorite' : undefined}
              >
                <td className="num strong">{s.position}</td>
                <td className="num muted">{s.carNumber || '—'}</td>
                <td className="points-driver">{s.name.full}</td>
                <td className="p3" title={s.manufacturer.name}>
                  {s.manufacturer.code ? (
                    <span className={`mfr-chip mfr-chip--${s.manufacturer.code.toLowerCase()}`}>
                      {formatManufacturer(s.manufacturer.name)}
                    </span>
                  ) : (
                    s.manufacturer.name
                  )}
                </td>
                <td className="num mono strong">{s.points}</td>
                <td className="num mono">{formatBehind(s.behindLeader, s.position === 1)}</td>
                <td className="num mono p2">{formatBehind(s.behindNext, s.position === 1, '—')}</td>
                <td className="num mono">{s.wins || ''}</td>
                <td className="num mono p2">{s.top5 || ''}</td>
                <td className="num mono p2">{s.top10 || ''}</td>
                <td className="num mono p3">{s.stageWins || ''}</td>
                <td className="num mono p3">{s.lapsLed || ''}</td>
                <td className="num mono p3">{s.dnf || ''}</td>
                <td className="num mono p3">{s.starts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
