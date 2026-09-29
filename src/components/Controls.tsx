import {
  ChevronsUpDown,
  ListOrdered,
  Maximize,
  Minimize,
  SlidersHorizontal,
  Trophy,
} from 'lucide-react';
import { SERIES_IDS, SERIES_SHORT } from '../data/feeds/schedule.ts';
import type { Route } from '../hooks/useHashRoute.ts';
import type { LiveSeries } from '../prefs/preferences.ts';

interface Props {
  route: Route;
  onNavigate: (route: Route) => void;
  fullscreen: boolean;
  canFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenSettings: () => void;
  series: LiveSeries;
  /** Null hides the series picker (dev replays play one recording). */
  onSeriesChange: ((series: LiveSeries) => void) | null;
}

const ICON = { size: 15, strokeWidth: 2, 'aria-hidden': true } as const;

/** Footer controls: series picker, page switcher, fullscreen and settings, always visible. */
export function Controls({
  route,
  onNavigate,
  fullscreen,
  canFullscreen,
  onToggleFullscreen,
  onOpenSettings,
  series,
  onSeriesChange,
}: Props) {
  return (
    <div className="controls">
      {onSeriesChange && (
        <span className="series-select">
          <select
            className="series-select__input"
            value={series}
            onChange={(event) =>
              onSeriesChange(
                event.target.value === 'auto' ? 'auto' : (Number(event.target.value) as LiveSeries),
              )
            }
            aria-label="Series"
            title={series === 'auto' ? 'Series: following whatever NASCAR is featuring' : 'Series'}
          >
            <option value="auto">Auto</option>
            {SERIES_IDS.map((id) => (
              <option key={id} value={id}>
                {SERIES_SHORT[id]}
              </option>
            ))}
          </select>
          <ChevronsUpDown className="series-select__icon" size={12} aria-hidden="true" />
        </span>
      )}
      <nav className="controls__nav" aria-label="Pages">
        <button
          type="button"
          className="control-button"
          onClick={() => onNavigate('timing')}
          aria-current={route === 'timing' ? 'page' : undefined}
          aria-label="Timing board"
          title="Timing board"
        >
          <ListOrdered {...ICON} />
        </button>
        <button
          type="button"
          className="control-button"
          onClick={() => onNavigate('points')}
          aria-current={route === 'points' ? 'page' : undefined}
          aria-label="Points"
          title="Points"
        >
          <Trophy {...ICON} />
        </button>
      </nav>
      {canFullscreen && (
        <button
          type="button"
          className="control-button"
          onClick={onToggleFullscreen}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {fullscreen ? <Minimize {...ICON} /> : <Maximize {...ICON} />}
        </button>
      )}
      <button
        type="button"
        className="control-button"
        onClick={onOpenSettings}
        aria-label="Settings"
        title="Settings"
      >
        <SlidersHorizontal {...ICON} />
      </button>
    </div>
  );
}
