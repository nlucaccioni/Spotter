import { ListOrdered, Maximize, Minimize, SlidersHorizontal, Trophy } from 'lucide-react';
import type { Route } from '../hooks/useHashRoute.ts';

interface Props {
  route: Route;
  onNavigate: (route: Route) => void;
  fullscreen: boolean;
  canFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenSettings: () => void;
}

const ICON = { size: 15, strokeWidth: 2, 'aria-hidden': true } as const;

/** Footer controls: page switcher, fullscreen and settings, always visible. */
export function Controls({
  route,
  onNavigate,
  fullscreen,
  canFullscreen,
  onToggleFullscreen,
  onOpenSettings,
}: Props) {
  return (
    <div className="controls">
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
