import type { SeasonStanding } from '../../data/feeds/points.ts';
import type { Manufacturer } from '../../data/model/types.ts';
import type { BadgeCar } from '../../hooks/useCarBadges.ts';
import { CarNumber } from '../CarNumber.tsx';
import { DriverName } from './DriverName.tsx';
import { MfrChip } from './MfrChip.tsx';
import { TeamName } from '../TeamName.tsx';
import type { TeamDisplay } from '../../prefs/preferences.ts';
import { formatBehind } from './format.ts';

interface Props {
  standings: SeasonStanding[];
  favorites: ReadonlySet<string>;
  /** Team name by driver id, from race weekend feeds; filled in as they arrive. */
  teams: ReadonlyMap<number, string>;
  /** How teams are shown (settings), and the logo lookup when logos are chosen. */
  teamDisplay: TeamDisplay;
  teamLogoFor: ((teamName: string) => string | null) | null;
  /** Car-number graphic lookup when the opt-in is on, otherwise null. */
  badgeFor: ((car: BadgeCar) => string | null) | null;
  /** Manufacturer logo lookup when the opt-in is on, otherwise null. */
  mfrLogoFor: ((manufacturer: Manufacturer) => string | null) | null;
}

export function SeasonStandingsTable({
  standings,
  favorites,
  teams,
  teamDisplay,
  teamLogoFor,
  badgeFor,
  mfrLogoFor,
}: Props) {
  // The feed lists everyone with a license; show drivers who have raced.
  const rows = standings.filter((s) => s.points > 0 || s.starts > 0);
  return (
    <div className="points-table-wrap">
      <table className="points-table points-table--season">
        <caption className="visually-hidden">Season standings</caption>
        <thead>
          <tr>
            <th scope="col" className="num" title="Position in the standings">
              Pos
            </th>
            <th scope="col" className="num" title="Car number">
              #
            </th>
            <th scope="col" className="col-driver">
              Driver
            </th>
            <th scope="col" className="p2" title="Manufacturer">
              Mfr
            </th>
            <th scope="col" className="p3" title="Team">
              Team
            </th>
            <th scope="col" className="num" title="Championship points">
              Points
            </th>
            <th scope="col" className="num" title="Behind the leader">
              Leader
            </th>
            <th scope="col" className="num p2" title="Behind the driver ahead">
              Next
            </th>
            <th scope="col" className="num" title="Race wins">
              Wins
            </th>
            <th scope="col" className="num p2" title="Top-5 finishes">
              Top 5
            </th>
            <th scope="col" className="num p2" title="Top-10 finishes">
              Top 10
            </th>
            <th scope="col" className="num p3" title="Stage wins">
              Stages
            </th>
            <th scope="col" className="num p3" title="Laps led">
              Led
            </th>
            <th scope="col" className="num p3" title="Did not finish">
              DNF
            </th>
            <th scope="col" className="num p3" title="Races started">
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
                <td className="num muted">
                  <CarNumber number={s.carNumber || '—'} badgeUrl={badgeFor?.(s) ?? null} />
                </td>
                <td className="points-driver col-driver">
                  <DriverName name={s.name} />
                </td>
                <td className="p2">
                  <MfrChip manufacturer={s.manufacturer} logoFor={mfrLogoFor} />
                </td>
                <td className="p3 points-team">
                  <TeamName
                    name={s.driverId === null ? undefined : teams.get(s.driverId)}
                    display={teamDisplay}
                    logoFor={teamLogoFor}
                  />
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
