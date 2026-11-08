import { describe, expect, it } from 'vitest';
import {
  bestOwnerCarByTeam,
  manufacturerPointsUrl,
  ownerCarFor,
  ownerPointsUrl,
  parseManufacturerPoints,
  parseOwnerPoints,
} from '../../src/data/feeds/standings.ts';

// Trimmed from cacher/2026/1/final/1-owners-points.json and 1-manufacturer-points.json.

const owner = (over: Record<string, unknown>) => ({
  position: 1,
  owner_name: 'Hendrick Motorsports',
  vehicle_number: '5',
  points: 5040,
  delta_leader: 0,
  starts: 36,
  wins: 4,
  top_5: 15,
  top_10: 22,
  dnf: 2,
  ...over,
});

describe('standings feed URLs', () => {
  it('points at the final standings files', () => {
    expect(ownerPointsUrl(2026, 1)).toBe(
      'https://cf.nascar.com/cacher/2026/1/final/1-owners-points.json',
    );
    expect(manufacturerPointsUrl(2026, 3)).toBe(
      'https://cf.nascar.com/cacher/2026/3/final/3-manufacturer-points.json',
    );
  });
});

describe('parseOwnerPoints', () => {
  it('reads each car, sorted by position, with the gap as a positive number', () => {
    const rows = parseOwnerPoints([
      owner({ position: 2, vehicle_number: 24, points: 5030, delta_leader: -10 }),
      owner({ owner_name: '  Hendrick   Motorsports ' }),
    ]);
    expect(rows.map((r) => [r.position, r.owner, r.carNumber, r.behind])).toEqual([
      [1, 'Hendrick Motorsports', '5', 0],
      [2, 'Hendrick Motorsports', '24', 10],
    ]);
    expect(rows[0]).toMatchObject({ starts: 36, wins: 4, top5: 15, top10: 22, dnf: 2 });
  });

  it('keeps a car with a blank owner and drops rows without a position', () => {
    const rows = parseOwnerPoints([owner({ owner_name: '' }), owner({ position: 0 }), 'junk']);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.owner).toBe('');
  });

  it('returns nothing for a non-list', () => {
    expect(parseOwnerPoints({ error: 'nope' })).toEqual([]);
  });
});

describe('parseManufacturerPoints', () => {
  it('maps names to manufacturers and works the gap out from the points', () => {
    const rows = parseManufacturerPoints([
      { position: '2', manufacturer: 'Toyota', points: 1290, wins: 10, delta_leader: '-60' },
      { position: '1', manufacturer: 'Chevrolet', points: 1350, wins: 19, delta_leader: 'LEADER' },
      { position: '3', manufacturer: 'RAM', points: 400, wins: 0, delta_leader: '-950' },
    ]);
    expect(rows.map((r) => [r.position, r.manufacturer.code, r.points, r.behind])).toEqual([
      [1, 'Chv', 1350, 0],
      [2, 'Tyt', 1290, 60],
      [3, 'Ram', 400, 950],
    ]);
  });
});

describe('bestOwnerCarByTeam', () => {
  const owners = parseOwnerPoints([
    owner({ position: 3, owner_name: 'Joe Gibbs Racing', vehicle_number: '11' }),
    owner({ position: 1, owner_name: 'Joe Gibbs Racing', vehicle_number: '20' }),
    owner({ position: 2, owner_name: 'Hendrick Motorsports', vehicle_number: '5' }),
  ]);
  const best = bestOwnerCarByTeam(owners);

  it('finds the best-placed car of a team', () => {
    expect(ownerCarFor(best, 'Joe Gibbs Racing')?.carNumber).toBe('20');
    expect(ownerCarFor(best, 'Hendrick Motorsports')?.position).toBe(2);
  });

  it('matches result names with or without a trailing "Racing" and in any case', () => {
    expect(ownerCarFor(best, 'Joe Gibbs')?.carNumber).toBe('20');
    expect(ownerCarFor(best, 'JOE GIBBS RACING')?.carNumber).toBe('20');
  });

  it('finds nothing for a team without owner points', () => {
    expect(ownerCarFor(best, 'Some Other Team')).toBeUndefined();
  });
});
