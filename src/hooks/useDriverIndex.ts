import { useEffect, useState } from 'react';
import {
  DRIVERS_URL,
  EMPTY_DRIVER_INDEX,
  parseDrivers,
  type DriverIndex,
} from '../data/feeds/drivers.ts';
import { createBrowserFetcher } from '../data/sources/browserFetcher.ts';

// The driver list is large and rarely changes, so it's fetched once per page, and only when
// an option that needs it (car-number graphics, manufacturer logos) is on.
let loading: Promise<DriverIndex> | null = null;

function loadDriverIndex(): Promise<DriverIndex> {
  loading ??= createBrowserFetcher(30_000)
    .fetchJson(DRIVERS_URL)
    .then(parseDrivers)
    .catch(() => {
      loading = null; // allow a retry later; callers fall back meanwhile
      return EMPTY_DRIVER_INDEX;
    });
  return loading;
}

/** NASCAR's driver list, loaded on first use while `enabled`; empty until then. */
export function useDriverIndex(enabled: boolean): DriverIndex {
  const [index, setIndex] = useState<DriverIndex>(EMPTY_DRIVER_INDEX);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadDriverIndex().then((loaded) => {
      if (active) setIndex(loaded);
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  return index;
}
