import type { Manufacturer } from '../../data/model/types.ts';
import { formatManufacturer } from '../board/format.ts';

/** Manufacturer pill, as on the board; plain name for unknown makers, nothing if missing. */
export function MfrChip({ manufacturer }: { manufacturer: Manufacturer | undefined }) {
  if (!manufacturer) return null;
  if (!manufacturer.code) return <>{manufacturer.name}</>;
  return (
    <span
      className={`mfr-chip mfr-chip--${manufacturer.code.toLowerCase()}`}
      title={manufacturer.name}
    >
      {formatManufacturer(manufacturer.name)}
    </span>
  );
}
