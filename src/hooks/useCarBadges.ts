import { useCallback, useEffect, useState } from 'react';
import {
  badgeUrlFor,
  DRIVERS_URL,
  EMPTY_BADGE_INDEX,
  parseDrivers,
  type BadgeIndex,
} from '../data/feeds/drivers.ts';
import type { CarState } from '../data/model/types.ts';
import { createBrowserFetcher } from '../data/sources/browserFetcher.ts';

// The driver list is large and rarely changes, so it's fetched once per page, and only when
// the car-number graphics option is on.
let loading: Promise<BadgeIndex> | null = null;

function loadBadgeIndex(): Promise<BadgeIndex> {
  loading ??= createBrowserFetcher(30_000)
    .fetchJson(DRIVERS_URL)
    .then(parseDrivers)
    .catch(() => {
      loading = null; // allow a retry later; by-number URLs still work meanwhile
      return EMPTY_BADGE_INDEX;
    });
  return loading;
}

/** Returns a lookup for car-number graphics, or null when the option is off. */
export function useCarBadges(
  enabled: boolean,
  seriesId: number | null,
): ((car: CarState) => string | null) | null {
  const [index, setIndex] = useState<BadgeIndex>(EMPTY_BADGE_INDEX);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadBadgeIndex().then((loaded) => {
      if (active) setIndex(loaded);
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  const lookup = useCallback(
    (car: CarState) => badgeUrlFor(index, car, seriesId),
    [index, seriesId],
  );
  return enabled ? lookup : null;
}
