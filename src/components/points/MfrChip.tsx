import type { Manufacturer } from '../../data/model/types.ts';
import { formatManufacturer } from '../board/format.ts';
import { MfrLogo } from '../MfrLogo.tsx';

/**
 * Manufacturer pill, as on the board (or its logo when the opt-in is on); plain name for
 * unknown makers, nothing if missing.
 */
export function MfrChip({
  manufacturer,
  logoFor,
}: {
  manufacturer: Manufacturer | undefined;
  logoFor: ((manufacturer: Manufacturer) => string | null) | null;
}) {
  if (!manufacturer) return null;
  if (!manufacturer.code) return <>{manufacturer.name}</>;
  return (
    <MfrLogo manufacturer={manufacturer} logoUrl={logoFor?.(manufacturer) ?? null}>
      <span
        className={`mfr-chip mfr-chip--${manufacturer.code.toLowerCase()}`}
        title={manufacturer.name}
      >
        {formatManufacturer(manufacturer.name)}
      </span>
    </MfrLogo>
  );
}
