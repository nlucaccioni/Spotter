import { useCallback } from 'react';
import type { Manufacturer } from '../data/model/types.ts';
import { useDriverIndex } from './useDriverIndex.ts';

/**
 * Returns a lookup for manufacturer logos, or null when the option is off. The lookup gives
 * null for makes without a logo (and until the driver list loads), so callers show the pill.
 */
export function useMfrLogos(
  enabled: boolean,
): ((manufacturer: Manufacturer) => string | null) | null {
  const index = useDriverIndex(enabled);
  const lookup = useCallback(
    (manufacturer: Manufacturer) => index.mfrLogos.get(manufacturer.code) ?? null,
    [index],
  );
  return enabled ? lookup : null;
}
