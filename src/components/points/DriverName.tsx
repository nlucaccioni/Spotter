import type { DriverName as Name } from '../../data/model/types.ts';

/** Full name, switching to the initialed form ("K. Larson") when the table is narrow (CSS). */
export function DriverName({ name }: { name: Name }) {
  return (
    <>
      <span className="name-full">{name.full}</span>
      <span className="name-short" aria-hidden="true">
        {name.initial}
      </span>
    </>
  );
}
