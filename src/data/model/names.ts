import type { Badge, DriverName } from './types.ts';

// Status markers NASCAR appends to names, with or without a leading space:
// "Kyle Larson (C)", "Austin Hill(i)", "Connor Zilisch #".
const SUFFIXES: [RegExp, Badge][] = [
  [/\s*\(C\)\s*$/, 'contender'],
  [/\s*\(i\)\s*$/, 'ineligible'],
  [/\s*#\s*$/, 'rookie'],
];

const BADGE_ORDER: Badge[] = ['contender', 'ineligible', 'rookie'];

/** Removes trailing status markers, repeatedly, and reports which ones were found. */
export function stripSuffixes(raw: string): { name: string; badges: Set<Badge> } {
  let name = raw.trim();
  const badges = new Set<Badge>();
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const [pattern, badge] of SUFFIXES) {
      if (pattern.test(name)) {
        name = name.replace(pattern, '');
        badges.add(badge);
        stripped = true;
      }
    }
  }
  return { name: name.trim(), badges };
}

export interface RawDriverName {
  full_name: string;
  first_name: string;
  last_name: string;
  is_in_chase: boolean;
}

export function parseDriverName(driver: RawDriverName): DriverName {
  const full = stripSuffixes(driver.full_name);
  const last = stripSuffixes(driver.last_name);
  const first = stripSuffixes(driver.first_name);

  const badges = new Set([...full.badges, ...last.badges, ...first.badges]);
  if (driver.is_in_chase) badges.add('contender');

  const fullName = full.name || [first.name, last.name].filter(Boolean).join(' ');
  const lastName = last.name || fullName.split(/\s+/).at(-1) || '';
  const firstName =
    first.name || (fullName.endsWith(lastName) ? fullName.slice(0, -lastName.length).trim() : '');

  return {
    full: fullName || 'Unknown driver',
    initial: initialed(firstName, lastName) || fullName || 'Unknown driver',
    last: lastName || fullName || 'Unknown driver',
    badges: BADGE_ORDER.filter((b) => badges.has(b)),
  };
}

function initialed(first: string, last: string): string {
  if (!first) return last;
  // Names that are already initials ("AJ") read better as-is than as "A. Allmendinger".
  if (/^[A-Z]{2,3}$/.test(first)) return `${first} ${last}`;
  const initials = first
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}.`)
    .join('');
  return `${initials} ${last}`;
}
