import { z } from 'zod';

// A race weekend's feed (cf.nascar.com/cacher/{year}/{series}/{race_id}/weekend-feed.json,
// CORS: *). Its `weekend_race[0].results` lists every entered car with its team, from the entry
// list before the race through the official results after it. Used for the points page's team
// names; the driver list's `Team` field is mostly internal ids, so it isn't used for this.

export function weekendFeedUrl(year: number, seriesId: number, raceId: number): string {
  return `https://cf.nascar.com/cacher/${year}/${seriesId}/${raceId}/weekend-feed.json`;
}

const result = z.object({
  driver_id: z.number().int(),
  team_name: z.string().catch(''),
});

/** Team name by driver id for the cars entered in a race weekend. */
export function parseWeekendTeams(raw: unknown): Map<number, string> {
  const teams = new Map<number, string>();
  const feed = z
    .object({ weekend_race: z.array(z.object({ results: z.array(z.unknown()).catch([]) })) })
    .safeParse(raw);
  if (!feed.success) return teams;
  for (const item of feed.data.weekend_race[0]?.results ?? []) {
    const parsed = result.safeParse(item);
    if (!parsed.success) continue;
    const name = cleanTeamName(parsed.data.team_name);
    if (name && !teams.has(parsed.data.driver_id)) teams.set(parsed.data.driver_id, name);
  }
  return teams;
}

/** Trimmed, with blanks and bare ids (e.g. "2215") dropped. */
function cleanTeamName(name: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  return trimmed && !/^\d+$/.test(trimmed) ? trimmed : null;
}

/**
 * Merges per-race team maps, most recent race first: each driver keeps the team from the
 * latest race they entered.
 */
export function mergeTeams(
  newestFirst: readonly ReadonlyMap<number, string>[],
): Map<number, string> {
  const merged = new Map<number, string>();
  for (const teams of newestFirst) {
    for (const [id, name] of teams) if (!merged.has(id)) merged.set(id, name);
  }
  return merged;
}
