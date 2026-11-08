import { describe, expect, it } from 'vitest';
import { mergeTeams, parseWeekendTeams, weekendFeedUrl } from '../../src/data/feeds/weekend.ts';

const feed = (results: unknown[]) => ({
  weekend_race: [{ race_id: 5601, results }],
  weekend_runs: [],
});

describe('parseWeekendTeams', () => {
  it('maps driver ids to cleaned team names', () => {
    const teams = parseWeekendTeams(
      feed([
        { driver_id: 4030, team_name: 'Hendrick Motorsports' },
        { driver_id: 3859, team_name: ' RFK  Racing ' },
        { driver_id: 1, team_name: '2215' }, // a bare id, not a name
        { driver_id: 2, team_name: '' },
        { driver_id: 3 },
        'garbage',
      ]),
    );
    expect([...teams]).toEqual([
      [4030, 'Hendrick Motorsports'],
      [3859, 'RFK Racing'],
    ]);
  });

  it('returns nothing for an unexpected shape', () => {
    expect(parseWeekendTeams(null).size).toBe(0);
    expect(parseWeekendTeams({ weekend_race: [] }).size).toBe(0);
    expect(parseWeekendTeams({ weekend_race: [{ results: null }] }).size).toBe(0);
  });
});

describe('mergeTeams', () => {
  it("keeps each driver's team from the most recent race they entered", () => {
    const latest = new Map([[1, 'New Team']]);
    const earlier = new Map([
      [1, 'Old Team'],
      [2, 'Part-timer Racing'],
    ]);
    expect([...mergeTeams([latest, earlier])]).toEqual([
      [1, 'New Team'],
      [2, 'Part-timer Racing'],
    ]);
  });
});

it('builds the weekend feed URL', () => {
  expect(weekendFeedUrl(2026, 1, 5601)).toBe(
    'https://cf.nascar.com/cacher/2026/1/5601/weekend-feed.json',
  );
});
