import { z } from 'zod';

// NASCAR's driver list (https://cf.nascar.com/cacher/drivers.json, ~1.4 MB, CORS: *). Used only
// for the opt-in graphics: each driver links to a team-styled number image at
// cf.nascar.com/data/images/carbadges/<series id>/<badge>.png, and to their manufacturer's logo
// on nascar.com. Images are hotlinked from NASCAR when the user turns an option on; nothing is
// hosted by us.

export const DRIVERS_URL = 'https://cf.nascar.com/cacher/drivers.json';
const BADGE_HOST = 'cf.nascar.com';
const BADGE_PATH = /^\/data\/images\/carbadges\/(\d+)\/[\w-]+\.png$/;
const LOGO_HOST = 'www.nascar.com';
// e.g. /wp-content/uploads/sites/7/2025/03/04/Chevrolet_2025-70x30.png
const LOGO_PATH = /^\/wp-content\/uploads\/sites\/\d+\/\d{4}\/\d\d\/\d\d\/([\w-]+)\.png$/;

/** Manufacturer codes (as in lookups.ts) by how their logo files are named. */
const LOGO_FILE_PREFIXES: readonly (readonly [prefix: string, code: string])[] = [
  ['chevrolet', 'Chv'],
  ['ford', 'Frd'],
  ['toyota', 'Tyt'],
  ['ram', 'Ram'],
];

const driverSchema = z.object({
  Nascar_Driver_ID: z.union([z.string(), z.number()]).transform(Number).catch(NaN),
  Full_Name: z.string().catch(''),
  Badge_Image: z.string().catch(''),
  Manufacturer_Small: z.string().catch(''),
});

export interface DriverIndex {
  /** Car-number badge URLs. */
  byDriverId: Map<number, string>;
  byName: Map<string, string>;
  /** Small manufacturer logo URLs, by manufacturer code ("Chv", "Frd", "Tyt", "Ram"). */
  mfrLogos: Map<string, string>;
}

export const EMPTY_DRIVER_INDEX: DriverIndex = {
  byDriverId: new Map(),
  byName: new Map(),
  mfrLogos: new Map(),
};

export function parseDrivers(raw: unknown): DriverIndex {
  const list = z.object({ response: z.array(z.unknown()) }).safeParse(raw);
  if (!list.success) return EMPTY_DRIVER_INDEX;
  const index: DriverIndex = { byDriverId: new Map(), byName: new Map(), mfrLogos: new Map() };
  // Every driver of a make links to its logo; count them in case old entries link a past one.
  const logoCounts = new Map<string, Map<string, number>>();
  for (const item of list.data.response) {
    const driver = driverSchema.safeParse(item);
    if (!driver.success) continue;
    const { Nascar_Driver_ID: id, Full_Name: name, Badge_Image: url } = driver.data;
    const logo = driver.data.Manufacturer_Small;
    const code = mfrLogoCode(logo);
    if (code) {
      const counts = logoCounts.get(code) ?? new Map<string, number>();
      counts.set(logo, (counts.get(logo) ?? 0) + 1);
      logoCounts.set(code, counts);
    }
    if (!isBadgeUrl(url)) continue;
    if (Number.isFinite(id)) index.byDriverId.set(id, url);
    if (name.trim()) index.byName.set(normalizeName(name), url);
  }
  for (const [code, counts] of logoCounts) {
    const [mostUsed] = [...counts].sort((a, b) => b[1] - a[1])[0]!;
    index.mfrLogos.set(code, mostUsed);
  }
  return index;
}

/**
 * The manufacturer code a logo URL is for, or null if it isn't one of NASCAR's logo images
 * for a known make. Never render an arbitrary URL from a feed.
 */
export function mfrLogoCode(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.host !== LOGO_HOST) return null;
    const file = LOGO_PATH.exec(parsed.pathname)?.[1]?.toLowerCase();
    if (!file) return null;
    return LOGO_FILE_PREFIXES.find(([prefix]) => file.startsWith(prefix))?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Only NASCAR's own badge images; never render an arbitrary URL from a feed. */
export function isBadgeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' && parsed.host === BADGE_HOST && BADGE_PATH.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

/**
 * The badge for a car: the driver's own badge when it's for this series (drivers who race in
 * several series have one entry, for their main series), otherwise NASCAR's by-number path.
 */
export function badgeUrlFor(
  index: DriverIndex,
  car: { driverId: number | null; name: { full: string }; carNumber: string },
  seriesId: number | null,
): string | null {
  const own =
    (car.driverId !== null ? index.byDriverId.get(car.driverId) : undefined) ??
    index.byName.get(normalizeName(car.name.full));
  if (own && (seriesId === null || badgeSeries(own) === seriesId)) return own;
  if (seriesId === null || !/^\d+$/.test(car.carNumber)) return null;
  return `https://${BADGE_HOST}/data/images/carbadges/${seriesId}/${car.carNumber}.png`;
}

function badgeSeries(url: string): number | null {
  const match = BADGE_PATH.exec(new URL(url).pathname);
  return match ? Number(match[1]) : null;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}
