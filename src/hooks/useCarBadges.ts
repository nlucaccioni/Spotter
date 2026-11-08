import { useCallback } from 'react';
import { badgeUrlFor } from '../data/feeds/drivers.ts';
import { useDriverIndex } from './useDriverIndex.ts';

/** What the badge lookup needs from a row: board cars and points rows both have it. */
export interface BadgeCar {
  driverId: number | null;
  name: { full: string };
  carNumber: string;
}

/** Returns a lookup for car-number graphics, or null when the option is off. */
export function useCarBadges(
  enabled: boolean,
  seriesId: number | null,
): ((car: BadgeCar) => string | null) | null {
  const index = useDriverIndex(enabled);
  const lookup = useCallback(
    (car: BadgeCar) => badgeUrlFor(index, car, seriesId),
    [index, seriesId],
  );
  return enabled ? lookup : null;
}
