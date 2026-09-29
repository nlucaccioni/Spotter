import { describe, expect, it } from 'vitest';
import { badgeUrlFor, isBadgeUrl, parseDrivers } from '../../src/data/feeds/drivers.ts';

const CUP = 'https://cf.nascar.com/data/images/carbadges/1';

const raw = {
  status: 'ok',
  response: [
    { Nascar_Driver_ID: '4030', Full_Name: 'Kyle Larson', Badge_Image: `${CUP}/5.png` },
    { Nascar_Driver_ID: '4184', Full_Name: 'William  Byron ', Badge_Image: `${CUP}/24.png` },
    // A Truck driver whose badge id isn't the car number.
    {
      Nascar_Driver_ID: '9001',
      Full_Name: 'Truck Driver',
      Badge_Image: 'https://cf.nascar.com/data/images/carbadges/3/4237.png',
    },
    // Rejected: not NASCAR's badge path/host.
    { Nascar_Driver_ID: '1', Full_Name: 'Evil', Badge_Image: 'https://evil.example/x.png' },
    {
      Nascar_Driver_ID: '2',
      Full_Name: 'Plain',
      Badge_Image: 'http://cf.nascar.com/data/images/carbadges/1/2.png',
    },
    'garbage',
  ],
};

const car = (driverId: number | null, full: string, carNumber: string) => ({
  driverId,
  name: { full },
  carNumber,
});

describe('parseDrivers / badgeUrlFor', () => {
  const index = parseDrivers(raw);

  it('indexes NASCAR badge URLs by driver id and name, rejecting anything else', () => {
    expect(index.byDriverId.get(4030)).toBe(`${CUP}/5.png`);
    expect(index.byName.get('william byron')).toBe(`${CUP}/24.png`);
    expect(index.byDriverId.has(1)).toBe(false);
    expect(index.byDriverId.has(2)).toBe(false);
  });

  it('prefers the driver entry, then the name, then the by-number path', () => {
    expect(badgeUrlFor(index, car(4030, 'Kyle Larson', '5'), 1)).toBe(`${CUP}/5.png`);
    // Replays have no driver ids.
    expect(badgeUrlFor(index, car(null, 'William Byron', '24'), 1)).toBe(`${CUP}/24.png`);
    expect(badgeUrlFor(index, car(null, 'Unknown Driver', '77'), 1)).toBe(`${CUP}/77.png`);
  });

  it("ignores a driver's badge from another series", () => {
    expect(badgeUrlFor(index, car(9001, 'Truck Driver', '42'), 1)).toBe(`${CUP}/42.png`);
    expect(badgeUrlFor(index, car(9001, 'Truck Driver', '42'), 3)).toBe(
      'https://cf.nascar.com/data/images/carbadges/3/4237.png',
    );
  });

  it('returns null when nothing safe can be built', () => {
    expect(badgeUrlFor(index, car(null, 'X', '5'), null)).toBeNull();
    expect(badgeUrlFor(index, car(null, 'X', '5a'), 1)).toBeNull();
    expect(parseDrivers({ nope: true }).byDriverId.size).toBe(0);
  });

  it('only accepts https badge images on cf.nascar.com', () => {
    expect(isBadgeUrl(`${CUP}/5.png`)).toBe(true);
    expect(isBadgeUrl('https://cf.nascar.com/live/feeds/live-feed.json')).toBe(false);
    expect(isBadgeUrl('javascript:alert(1)')).toBe(false);
    expect(isBadgeUrl('not a url')).toBe(false);
  });
});
