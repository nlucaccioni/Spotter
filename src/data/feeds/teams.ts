import { z } from 'zod';

// Team names for display, and NASCAR's team list (cf.nascar.com/cacher/{year}/teams.json, ~4 KB,
// CORS: *). The list only covers the full-time Cup teams; each links to a logo in a light and a
// dark version (`imageUrl` has a literal `{ui_theme}` placeholder). There's no official list of
// short names, so the well-known ones are kept here.

export function teamsUrl(year: number): string {
  return `https://cf.nascar.com/cacher/${year}/teams.json`;
}

/** Matching key: letters and digits only, lower case ("HYAK Motorsports" = "Hyak Motorsports"). */
export function teamKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Shorthands used on broadcasts, by teamKey(). Teams not listed fall back to shortTeamName's rule. */
const SHORT_NAMES: Record<string, string> = {
  hendrickmotorsports: 'HMS',
  joegibbsracing: 'JGR',
  richardchildressracing: 'RCR',
  frontrowmotorsports: 'FRM',
  legacymotorclub: 'LMC',
  rickwareracing: 'RWR',
  woodbrothersracing: 'WBR',
  jrmotorsports: 'JRM',
  jordanandersonracingbommaritoautosport: 'JAR',
  mcanallyhilgemannracing: 'MHR',
  motorsportsbusinessmanagement: 'MBM',
  '23xiracing': '23XI',
  teampenske: 'Penske',
  trackhouse: 'Trackhouse',
  trackhouseracing: 'Trackhouse',
  haasfactoryteam: 'Haas',
  hyakmotorsports: 'Hyak',
  tricongarage: 'Tricon',
  dgmracingxjim: 'DGM',
  teamreaume: 'Reaume',
};

const GENERIC_SUFFIX = /\s+(?:racing|motorsports|inc\.?|llc)$/i;

/**
 * A team's broadcast shorthand ("Hendrick Motorsports" → "HMS"), or for teams without one the
 * name minus trailing "Racing"/"Motorsports" ("Sam Hunt Racing" → "Sam Hunt").
 */
export function shortTeamName(name: string): string {
  const known = SHORT_NAMES[teamKey(name)];
  if (known) return known;
  let short = name.trim();
  // Repeated for stacked suffixes ("Pardus Racing Inc"), but never down to nothing.
  for (;;) {
    const next = short.replace(GENERIC_SUFFIX, '');
    if (!next || next === short) return short;
    short = next;
  }
}

const LOGO_URL = /^https:\/\/cf\.nascar\.com\/data\/images\/teams\/[\w.-]+_\{ui_theme\}\.png$/;

const teamSchema = z.object({
  name: z.string(),
  imageUrl: z.string().catch(''),
});

/** Logo URL templates (with `{ui_theme}`) by team key; also keyed without a trailing "racing". */
export type TeamLogoIndex = ReadonlyMap<string, string>;

export function parseTeams(raw: unknown): TeamLogoIndex {
  const index = new Map<string, string>();
  const list = z.object({ teams: z.array(z.unknown()) }).safeParse(raw);
  if (!list.success) return index;
  for (const item of list.data.teams) {
    const team = teamSchema.safeParse(item);
    // Only NASCAR's own team images; never render an arbitrary URL from a feed.
    if (!team.success || !LOGO_URL.test(team.data.imageUrl)) continue;
    for (const key of matchKeys(team.data.name)) {
      if (!index.has(key)) index.set(key, team.data.imageUrl);
    }
  }
  return index;
}

/** The team's logo for the theme, or null if NASCAR's list doesn't have the team. */
export function teamLogoUrl(index: TeamLogoIndex, name: string, theme: 'dark' | 'light') {
  for (const key of matchKeys(name)) {
    const template = index.get(key);
    if (template) return template.replace('{ui_theme}', theme);
  }
  return null;
}

// "Trackhouse" in the team list is "Trackhouse Racing" in race results.
function matchKeys(name: string): string[] {
  const key = teamKey(name);
  const bare = key.replace(/racing$/, '');
  return bare && bare !== key ? [key, bare] : [key];
}
