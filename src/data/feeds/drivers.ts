import { z } from 'zod';

// NASCAR's driver list (https://cf.nascar.com/cacher/drivers.json, ~1.4 MB, CORS: *). Used only
// for the opt-in car-number graphics: each driver links to a team-styled number image at
// cf.nascar.com/data/images/carbadges/<series id>/<badge>.png. Images are hotlinked from
// NASCAR's CDN when the user turns the option on; nothing is hosted by us.

export const DRIVERS_URL = 'https://cf.nascar.com/cacher/drivers.json';
const BADGE_HOST = 'cf.nascar.com';
const BADGE_PATH = /^\/data\/images\/carbadges\/(\d+)\/[\w-]+\.png$/;

const driverSchema = z.object({
  Nascar_Driver_ID: z.union([z.string(), z.number()]).transform(Number).catch(NaN),
  Full_Name: z.string().catch(''),
  Badge_Image: z.string().catch(''),
});

export interface BadgeIndex {
  byDriverId: Map<number, string>;
  byName: Map<string, string>;
}

export const EMPTY_BADGE_INDEX: BadgeIndex = { byDriverId: new Map(), byName: new Map() };

export function parseDrivers(raw: unknown): BadgeIndex {
  const list = z.object({ response: z.array(z.unknown()) }).safeParse(raw);
  if (!list.success) return EMPTY_BADGE_INDEX;
  const index: BadgeIndex = { byDriverId: new Map(), byName: new Map() };
  for (const item of list.data.response) {
    const driver = driverSchema.safeParse(item);
    if (!driver.success || !isBadgeUrl(driver.data.Badge_Image)) continue;
    const { Nascar_Driver_ID: id, Full_Name: name, Badge_Image: url } = driver.data;
    if (Number.isFinite(id)) index.byDriverId.set(id, url);
    if (name.trim()) index.byName.set(normalizeName(name), url);
  }
  return index;
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
  index: BadgeIndex,
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
