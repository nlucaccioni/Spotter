import { useState, type ReactNode } from 'react';
import type { Manufacturer } from '../data/model/types.ts';

/** Logo URLs that failed to load this session, so rows don't keep retrying them. */
const failedLogos = new Set<string>();

/**
 * The manufacturer's logo when the opt-in is on (`logoUrl`), otherwise `children` (the text
 * pill); also falls back to the pill if the image fails to load.
 */
export function MfrLogo({
  manufacturer,
  logoUrl,
  children,
}: {
  manufacturer: Manufacturer;
  logoUrl: string | null;
  children: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (!logoUrl || failed || failedLogos.has(logoUrl)) return <>{children}</>;
  return (
    <img
      className="mfr-logo"
      src={logoUrl}
      alt={manufacturer.name}
      title={manufacturer.name}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        failedLogos.add(logoUrl);
        setFailed(true);
      }}
    />
  );
}
