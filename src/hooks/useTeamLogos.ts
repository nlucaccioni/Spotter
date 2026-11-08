import { useCallback, useEffect, useState } from 'react';
import { parseTeams, teamLogoUrl, teamsUrl, type TeamLogoIndex } from '../data/feeds/teams.ts';
import { createBrowserFetcher } from '../data/sources/browserFetcher.ts';
import type { Theme } from '../prefs/preferences.ts';

// NASCAR's team list is tiny and changes a few times a season at most: fetched once per year
// per page, and only while team logos are chosen.
const loading = new Map<number, Promise<TeamLogoIndex>>();
const EMPTY: TeamLogoIndex = new Map();

function loadTeams(year: number): Promise<TeamLogoIndex> {
  let entry = loading.get(year);
  if (!entry) {
    entry = createBrowserFetcher(20_000)
      .fetchJson(teamsUrl(year))
      .then(parseTeams)
      .catch(() => {
        loading.delete(year); // allow a retry later; names show meanwhile
        return EMPTY;
      });
    loading.set(year, entry);
  }
  return entry;
}

/**
 * Returns a team-logo lookup (by team name, in the theme's version), or null when logos aren't
 * chosen. The lookup gives null for teams NASCAR's list doesn't have.
 */
export function useTeamLogos(
  enabled: boolean,
  year: number,
  theme: Theme,
): ((teamName: string) => string | null) | null {
  const [found, setFound] = useState<{ year: number; index: TeamLogoIndex }>({
    year: 0,
    index: EMPTY,
  });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadTeams(year).then((index) => {
      if (active) setFound({ year, index });
    });
    return () => {
      active = false;
    };
  }, [enabled, year]);

  const index = found.year === year ? found.index : EMPTY;
  const lookup = useCallback(
    (teamName: string) => teamLogoUrl(index, teamName, theme),
    [index, theme],
  );
  return enabled ? lookup : null;
}
