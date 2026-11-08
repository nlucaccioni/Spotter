import { describe, expect, it } from 'vitest';
import { parseTeams, shortTeamName, teamLogoUrl, teamsUrl } from '../../src/data/feeds/teams.ts';

describe('shortTeamName', () => {
  it('uses broadcast shorthands, matching names loosely', () => {
    expect(shortTeamName('Hendrick Motorsports')).toBe('HMS');
    expect(shortTeamName('Joe Gibbs Racing')).toBe('JGR');
    expect(shortTeamName('HYAK Motorsports ')).toBe('Hyak');
    expect(shortTeamName('Trackhouse Racing')).toBe('Trackhouse');
    expect(shortTeamName('Jordan Anderson Racing Bommarito Autosport')).toBe('JAR');
    expect(shortTeamName('Team Penske')).toBe('Penske');
  });

  it('otherwise drops trailing Racing / Motorsports / Inc, never down to nothing', () => {
    expect(shortTeamName('Sam Hunt Racing')).toBe('Sam Hunt');
    expect(shortTeamName('Pardus Racing Inc')).toBe('Pardus');
    expect(shortTeamName('Garage 66')).toBe('Garage 66');
    expect(shortTeamName('NY Racing Team')).toBe('NY Racing Team');
    expect(shortTeamName('Racing')).toBe('Racing');
  });
});

describe('parseTeams / teamLogoUrl', () => {
  const T = 'https://cf.nascar.com/data/images/teams';
  const index = parseTeams({
    teams: [
      { id: 4, name: 'Hendrick Motorsports', imageUrl: `${T}/Hendrick_Motorsports_{ui_theme}.png` },
      { id: 17, name: 'Trackhouse', imageUrl: `${T}/Trackhouse_{ui_theme}.png` },
      // Rejected: not NASCAR's team image path.
      { id: 99, name: 'Evil Racing', imageUrl: 'https://evil.example/x_{ui_theme}.png' },
      { id: 98, name: 'No Theme', imageUrl: `${T}/No_Theme.png` },
      'garbage',
    ],
  });

  it("picks the theme's version", () => {
    expect(teamLogoUrl(index, 'Hendrick Motorsports', 'dark')).toBe(
      `${T}/Hendrick_Motorsports_dark.png`,
    );
    expect(teamLogoUrl(index, 'Hendrick Motorsports', 'light')).toBe(
      `${T}/Hendrick_Motorsports_light.png`,
    );
  });

  it('matches race-result names that add "Racing"', () => {
    expect(teamLogoUrl(index, 'Trackhouse Racing', 'dark')).toBe(`${T}/Trackhouse_dark.png`);
  });

  it('returns null for unknown teams and unsafe URLs', () => {
    expect(teamLogoUrl(index, 'Sam Hunt Racing', 'dark')).toBeNull();
    expect(teamLogoUrl(index, 'Evil Racing', 'dark')).toBeNull();
    expect(teamLogoUrl(index, 'No Theme', 'dark')).toBeNull();
    expect(parseTeams({ nope: true }).size).toBe(0);
  });

  it('builds the teams URL', () => {
    expect(teamsUrl(2026)).toBe('https://cf.nascar.com/cacher/2026/teams.json');
  });
});
