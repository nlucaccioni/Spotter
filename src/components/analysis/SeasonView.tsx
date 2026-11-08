import { useMemo, type ReactNode } from 'react';
import {
  type OfficialStandings,
  seasonByDriver,
  seasonByManufacturer,
  seasonByTeam,
  type DriverSeason,
  type GroupSeason,
} from '../../data/analysis/season.ts';
import type { RaceSummary } from '../../data/feeds/race.ts';
import {
  bestOwnerCarByTeam,
  ownerCarFor,
  type ManufacturerStanding,
  type OwnerStanding,
} from '../../data/feeds/standings.ts';
import { teamKey } from '../../data/feeds/teams.ts';
import type { Manufacturer } from '../../data/model/types.ts';
import type { OfficialGroupStandings } from '../../hooks/useAnalysisData.ts';
import type { TeamDisplay } from '../../prefs/preferences.ts';
import { MfrChip } from '../points/MfrChip.tsx';
import { TeamName } from '../TeamName.tsx';
import { Card } from './Card.tsx';
import { ChampionshipCard } from './ChampionshipCard.tsx';
import { DataTable, type Column } from './DataTable.tsx';
import { fixed1, signed } from './format.ts';

interface Props {
  seasonKey: string;
  races: readonly RaceSummary[];
  /** Official standings after each race (null where unknown). */
  official: readonly (OfficialStandings | null)[];
  /** Today's official owner and manufacturer standings. */
  groups: OfficialGroupStandings;
  favorites: ReadonlySet<string>;
  teamDisplay: TeamDisplay;
  teamLogoFor: ((teamName: string) => string | null) | null;
  mfrLogoFor: ((manufacturer: Manufacturer) => string | null) | null;
}

export function SeasonView({
  seasonKey,
  races,
  official,
  groups,
  favorites,
  teamDisplay,
  teamLogoFor,
  mfrLogoFor,
}: Props) {
  const drivers = useMemo(() => seasonByDriver(races, official), [races, official]);
  const hasOfficial = official.some((o) => o !== null);
  const last = races.length - 1;

  // Teams: linked to their best-placed car in the owners' standings, and ranked by it.
  const bestCars = useMemo(() => bestOwnerCarByTeam(groups.owners ?? []), [groups.owners]);
  const teams = useMemo(() => {
    const rows = seasonByTeam(races);
    if (!groups.owners) return rows;
    const place = (g: GroupSeason) => ownerCarFor(bestCars, g.name)?.position ?? Infinity;
    return [...rows].sort((a, b) => place(a) - place(b));
  }, [races, groups.owners, bestCars]);
  // There's no official team championship, so a team's place is its rank by its best car.
  const teamPlaces = useMemo(() => {
    const places = new Map<string, number>();
    for (const g of teams) {
      if (ownerCarFor(bestCars, g.name)) places.set(g.key, places.size + 1);
    }
    return places;
  }, [teams, bestCars]);

  // Manufacturers: with NASCAR's manufacturer points, and ranked by them.
  const makeStandings = useMemo(
    () => new Map((groups.makes ?? []).map((m) => [m.manufacturer.code || m.manufacturer.name, m])),
    [groups.makes],
  );
  const makes = useMemo(() => {
    const rows = seasonByManufacturer(races);
    if (!groups.makes) return rows;
    const place = (g: GroupSeason) => makeStandings.get(g.key)?.position ?? Infinity;
    return [...rows].sort((a, b) => place(a) - place(b));
  }, [races, groups.makes, makeStandings]);

  // Who last drove each owner's car, for the owners' table.
  const carDrivers = useMemo(() => {
    const names = new Map<string, { name: string; driverId: number }>();
    for (const race of races) {
      for (const r of race.results) {
        if (r.team) {
          names.set(`${teamKey(r.team)}|${r.carNumber}`, { name: r.name, driverId: r.driverId });
        }
      }
    }
    return names;
  }, [races]);

  const teamCell = (name: string | undefined) => (
    <span className="points-team">
      <TeamName name={name} display={teamDisplay} logoFor={teamLogoFor} />
    </span>
  );

  return (
    <div className="analysis__grid">
      <ChampionshipCard
        seasonKey={seasonKey}
        races={races}
        drivers={drivers}
        hasOfficial={hasOfficial}
        favorites={favorites}
      />

      <Card
        title="Drivers"
        note="Standings and points are NASCAR’s official ones. Places gained = average start minus average finish."
      >
        <DataTable
          caption="Driver standings and season averages"
          rows={drivers}
          rowKey={(d) => String(d.driverId)}
          rowClass={(d) => (favorites.has(`id:${d.driverId}`) ? 'timing-row--favorite' : undefined)}
          columns={driverColumns(last, hasOfficial, teamDisplay, teamCell, mfrLogoFor)}
        />
      </Card>

      <div className="analysis__pair">
        <Card
          title="Teams"
          note={
            groups.owners
              ? 'Ranked by each team’s best car in the owners’ standings (owner points are per car).'
              : undefined
          }
        >
          <DataTable
            caption="Team results this season"
            rows={teams}
            rowKey={(g) => g.key}
            columns={groupColumns(
              (g) => teamCell(g.name),
              teamDisplay === 'logo',
              groups.owners ? teamStandingColumns(bestCars, teamPlaces) : [],
            )}
          />
        </Card>
        <Card title="Manufacturers">
          <DataTable
            caption="Manufacturer results this season"
            rows={makes}
            rowKey={(g) => g.key}
            columns={groupColumns(
              (g) => (
                <MfrChip manufacturer={g.manufacturer} logoFor={mfrLogoFor} />
              ),
              false,
              groups.makes ? makeStandingColumns(makeStandings) : [],
            )}
          />
        </Card>
      </div>

      {groups.owners && (
        <Card
          title="Owner standings"
          note="NASCAR’s owners’ championship, scored per car. The driver is whoever raced the car last."
        >
          <DataTable
            caption="Owner standings"
            rows={groups.owners}
            rowKey={(o) => `${o.position}-${o.carNumber}`}
            rowClass={(o) => {
              const d = carDrivers.get(`${teamKey(o.owner)}|${o.carNumber}`);
              return d && favorites.has(`id:${d.driverId}`) ? 'timing-row--favorite' : undefined;
            }}
            columns={ownerColumns(teamDisplay, teamCell, carDrivers)}
          />
        </Card>
      )}
    </div>
  );
}

function driverColumns(
  last: number,
  hasOfficial: boolean,
  teamDisplay: TeamDisplay,
  teamCell: (name: string | undefined) => ReactNode,
  mfrLogoFor: Props['mfrLogoFor'],
): Column<DriverSeason>[] {
  const points = (d: DriverSeason) =>
    hasOfficial ? (d.officialAfter[last] ?? null) : (d.pointsAfter[last] ?? null);
  return [
    {
      id: 'pos',
      label: 'Pos',
      title: 'Place in the standings',
      numeric: true,
      value: (d) => d.standingAfter[last] ?? null,
      render: (d) => <strong>{d.standingAfter[last] ?? '—'}</strong>,
    },
    {
      id: 'driver',
      label: 'Driver',
      value: (d) => d.name,
      render: (d) => <span className="points-driver">{d.name}</span>,
      className: 'col-driver',
    },
    {
      id: 'mfr',
      label: 'Mfr',
      title: 'Manufacturer',
      render: (d) => <MfrChip manufacturer={d.manufacturer} logoFor={mfrLogoFor} />,
      className: 'p2',
    },
    {
      id: 'team',
      label: 'Team',
      value: (d) => d.team,
      render: (d) => teamCell(d.team ?? undefined),
      className: 'p3',
      headerClassName: teamDisplay === 'logo' ? 'th--centered' : undefined,
    },
    {
      id: 'points',
      label: 'Points',
      title: hasOfficial ? 'Official points' : 'Points earned in races',
      numeric: true,
      descending: true,
      value: points,
      render: (d) => <strong>{points(d) ?? '—'}</strong>,
    },
    {
      id: 'starts',
      label: 'Starts',
      numeric: true,
      descending: true,
      value: (d) => d.starts,
      render: (d) => d.starts,
      className: 'p2',
    },
    {
      id: 'start',
      label: 'Avg st',
      title: 'Average start',
      numeric: true,
      value: (d) => d.avgStart,
      render: (d) => fixed1(d.avgStart),
    },
    {
      id: 'finish',
      label: 'Avg fin',
      title: 'Average finish',
      numeric: true,
      value: (d) => d.avgFinish,
      render: (d) => fixed1(d.avgFinish),
    },
    {
      id: 'gained',
      label: '+/−',
      title: 'Average places gained from start to finish',
      numeric: true,
      descending: true,
      value: (d) => d.avgGained,
      render: (d) => <Delta value={d.avgGained} />,
    },
    {
      id: 'wins',
      label: 'Wins',
      numeric: true,
      descending: true,
      value: (d) => d.wins,
      render: (d) => d.wins || '',
    },
    {
      id: 'top5',
      label: 'Top 5',
      numeric: true,
      descending: true,
      value: (d) => d.top5,
      render: (d) => d.top5 || '',
      className: 'p2',
    },
    {
      id: 'top10',
      label: 'Top 10',
      numeric: true,
      descending: true,
      value: (d) => d.top10,
      render: (d) => d.top10 || '',
      className: 'p2',
    },
    {
      id: 'poles',
      label: 'Poles',
      numeric: true,
      descending: true,
      value: (d) => d.poles,
      render: (d) => d.poles || '',
      className: 'p3',
    },
    {
      id: 'led',
      label: 'Led',
      title: 'Laps led',
      numeric: true,
      descending: true,
      value: (d) => d.lapsLed,
      render: (d) => d.lapsLed || '',
      className: 'p3',
    },
    {
      id: 'dnf',
      label: 'DNF',
      title: 'Did not finish',
      numeric: true,
      descending: true,
      value: (d) => d.dnfs,
      render: (d) => d.dnfs || '',
      className: 'p3',
    },
  ];
}

function teamStandingColumns(
  bestCars: ReadonlyMap<string, OwnerStanding>,
  places: ReadonlyMap<string, number>,
): Column<GroupSeason>[] {
  const car = (g: GroupSeason) => ownerCarFor(bestCars, g.name);
  return [
    {
      id: 'pos',
      label: 'Pos',
      title: 'Rank among teams by their best car in the owners’ standings',
      numeric: true,
      value: (g) => places.get(g.key) ?? null,
      render: (g) => <strong>{places.get(g.key) ?? '—'}</strong>,
    },
    {
      id: 'best',
      label: 'Best car',
      title: 'The team’s best-placed car in the owners’ standings',
      numeric: true,
      value: (g) => car(g)?.position ?? null,
      render: (g) => {
        const c = car(g);
        return c ? (
          <>
            <strong>P{c.position}</strong> <span className="muted">#{c.carNumber}</span>
          </>
        ) : (
          '—'
        );
      },
    },
    {
      id: 'owner-points',
      label: 'Points',
      title: 'Owner points of the team’s best car',
      numeric: true,
      descending: true,
      value: (g) => car(g)?.points ?? null,
      render: (g) => car(g)?.points ?? '—',
    },
  ];
}

function makeStandingColumns(
  standings: ReadonlyMap<string, ManufacturerStanding>,
): Column<GroupSeason>[] {
  const of = (g: GroupSeason) => standings.get(g.key);
  return [
    {
      id: 'pos',
      label: 'Pos',
      title: 'Place in the manufacturers’ championship',
      numeric: true,
      value: (g) => of(g)?.position ?? null,
      render: (g) => <strong>{of(g)?.position ?? '—'}</strong>,
    },
    {
      id: 'points',
      label: 'Points',
      title: 'Official manufacturer points',
      numeric: true,
      descending: true,
      value: (g) => of(g)?.points ?? null,
      render: (g) => of(g)?.points ?? '—',
    },
    {
      id: 'behind',
      label: 'Leader',
      title: 'Points behind the leader',
      numeric: true,
      value: (g) => of(g)?.behind ?? null,
      render: (g) => {
        const s = of(g);
        return !s ? '—' : s.position === 1 ? 'Leader' : `−${s.behind}`;
      },
      className: 'p2',
    },
  ];
}

/** Place first, then the name, any other standings columns, then the season's results. */
function groupColumns(
  name: (g: GroupSeason) => ReactNode,
  centerName: boolean,
  standings: Column<GroupSeason>[],
): Column<GroupSeason>[] {
  return [
    ...standings.filter((c) => c.id === 'pos'),
    {
      id: 'name',
      label: 'Name',
      value: (g) => g.name,
      render: name,
      headerClassName: centerName ? 'th--centered' : undefined,
    },
    ...standings.filter((c) => c.id !== 'pos'),
    {
      id: 'drivers',
      label: 'Drivers',
      title: 'Drivers who raced for it',
      numeric: true,
      descending: true,
      value: (g) => g.drivers,
      render: (g) => g.drivers,
      className: 'p3',
    },
    {
      id: 'starts',
      label: 'Starts',
      numeric: true,
      descending: true,
      value: (g) => g.starts,
      render: (g) => g.starts,
      className: 'p3',
    },
    {
      id: 'wins',
      label: 'Wins',
      numeric: true,
      descending: true,
      value: (g) => g.wins,
      render: (g) => g.wins || '',
    },
    {
      id: 'top5',
      label: 'Top 5',
      numeric: true,
      descending: true,
      value: (g) => g.top5,
      render: (g) => g.top5 || '',
      className: 'p2',
    },
    {
      id: 'top10',
      label: 'Top 10',
      numeric: true,
      descending: true,
      value: (g) => g.top10,
      render: (g) => g.top10 || '',
      className: 'p3',
    },
    {
      id: 'led',
      label: 'Led',
      title: 'Laps led',
      numeric: true,
      descending: true,
      value: (g) => g.lapsLed,
      render: (g) => g.lapsLed || '',
      className: 'p3',
    },
    {
      id: 'avg',
      label: 'Avg fin',
      title: 'Average finish',
      numeric: true,
      value: (g) => g.avgFinish,
      render: (g) => fixed1(g.avgFinish),
      className: 'p2',
    },
  ];
}

function ownerColumns(
  teamDisplay: TeamDisplay,
  teamCell: (name: string | undefined) => ReactNode,
  carDrivers: ReadonlyMap<string, { name: string; driverId: number }>,
): Column<OwnerStanding>[] {
  const driver = (o: OwnerStanding) => carDrivers.get(`${teamKey(o.owner)}|${o.carNumber}`)?.name;
  return [
    {
      id: 'pos',
      label: 'Pos',
      numeric: true,
      value: (o) => o.position,
      render: (o) => <strong>{o.position}</strong>,
    },
    {
      id: 'car',
      label: '#',
      title: 'Car number',
      numeric: true,
      value: (o) => Number(o.carNumber) || null,
      render: (o) => <span className="muted">{o.carNumber}</span>,
    },
    {
      id: 'team',
      label: 'Team',
      value: (o) => o.owner,
      render: (o) => (o.owner ? teamCell(o.owner) : '—'),
      headerClassName: teamDisplay === 'logo' ? 'th--centered' : undefined,
    },
    {
      id: 'driver',
      label: 'Driver',
      value: (o) => driver(o) ?? null,
      render: (o) => <span className="points-driver">{driver(o) ?? '—'}</span>,
      className: 'p2',
    },
    {
      id: 'points',
      label: 'Points',
      numeric: true,
      descending: true,
      value: (o) => o.points,
      render: (o) => <strong>{o.points}</strong>,
    },
    {
      id: 'behind',
      label: 'Leader',
      title: 'Points behind the leader',
      numeric: true,
      value: (o) => o.behind,
      render: (o) => (o.position === 1 ? 'Leader' : `−${o.behind}`),
    },
    {
      id: 'wins',
      label: 'Wins',
      numeric: true,
      descending: true,
      value: (o) => o.wins,
      render: (o) => o.wins || '',
    },
    {
      id: 'top5',
      label: 'Top 5',
      numeric: true,
      descending: true,
      value: (o) => o.top5,
      render: (o) => o.top5 || '',
      className: 'p2',
    },
    {
      id: 'top10',
      label: 'Top 10',
      numeric: true,
      descending: true,
      value: (o) => o.top10,
      render: (o) => o.top10 || '',
      className: 'p3',
    },
    {
      id: 'dnf',
      label: 'DNF',
      title: 'Did not finish',
      numeric: true,
      descending: true,
      value: (o) => o.dnf,
      render: (o) => o.dnf || '',
      className: 'p3',
    },
    {
      id: 'starts',
      label: 'Starts',
      numeric: true,
      descending: true,
      value: (o) => o.starts,
      render: (o) => o.starts,
      className: 'p3',
    },
  ];
}

function Delta({ value }: { value: number | null }) {
  const cls = value === null || Math.abs(value) < 0.05 ? undefined : value > 0 ? 'up' : 'down';
  return <span className={cls}>{signed(value)}</span>;
}
