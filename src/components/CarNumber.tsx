import { useState } from 'react';

/** Badge URLs that failed to load this session, so rows don't keep retrying them. */
const failedBadges = new Set<string>();

/**
 * A car number, or the team's car-number graphic when the opt-in is on (`badgeUrl`); falls back
 * to the plain number if the image fails to load.
 */
export function CarNumber({ number, badgeUrl }: { number: string; badgeUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!badgeUrl || failed || failedBadges.has(badgeUrl)) return <>{number}</>;
  return (
    <img
      className="car-badge"
      src={badgeUrl}
      alt={number}
      title={`#${number}`}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        failedBadges.add(badgeUrl);
        setFailed(true);
      }}
    />
  );
}
