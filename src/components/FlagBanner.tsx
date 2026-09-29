import type { Flag } from '../data/model/types.ts';

interface Props {
  flag: Flag;
  lap: number;
  lapsInRace: number;
  lapsToGo: number;
}

export function FlagBanner({ flag, lap, lapsInRace, lapsToGo }: Props) {
  return (
    <div className={`flag-banner flag-banner--${flag.kind}`}>
      {/* Only the flag is announced; the lap count changes every lap and would be noise. */}
      <span className="flag-banner__label" role="status">
        {flag.label}
      </span>
      <span className="flag-banner__laps">
        Lap {lap}
        {lapsInRace > 0 && ` / ${lapsInRace}`}
        {lapsInRace > 0 && lapsToGo > 0 && (
          <span className="flag-banner__to-go"> · {lapsToGo} to go</span>
        )}
      </span>
    </div>
  );
}
