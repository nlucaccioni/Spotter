import { useState } from 'react';
import { shortTeamName } from '../data/feeds/teams.ts';
import type { TeamDisplay } from '../prefs/preferences.ts';

/** Team logo URLs that failed to load this session, so rows don't keep retrying them. */
const failedLogos = new Set<string>();

/**
 * A team as chosen in settings: full name, shorthand, or logo. Teams without a logo (or whose
 * logo fails to load) show their shorthand, which keeps the column narrow.
 */
export function TeamName({
  name,
  display,
  logoFor,
}: {
  name: string | undefined;
  display: TeamDisplay;
  logoFor: ((teamName: string) => string | null) | null;
}) {
  const logoUrl = name && display === 'logo' ? (logoFor?.(name) ?? null) : null;
  const [failed, setFailed] = useState<string | null>(null);
  if (!name) return null;
  if (display === 'full') return <>{name}</>;
  if (logoUrl && failed !== logoUrl && !failedLogos.has(logoUrl)) {
    return (
      <img
        className="team-logo"
        src={logoUrl}
        alt={name}
        title={name}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => {
          failedLogos.add(logoUrl);
          setFailed(logoUrl);
        }}
      />
    );
  }
  // With logos chosen, a team without one is centered like the logos around it.
  return (
    <span className={display === 'logo' ? 'team-logo-fallback' : undefined} title={name}>
      {shortTeamName(name)}
    </span>
  );
}
