import { Maximize, Minimize, SlidersHorizontal } from 'lucide-react';

interface Props {
  fullscreen: boolean;
  canFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenSettings: () => void;
}

const ICON = { size: 15, strokeWidth: 2, 'aria-hidden': true } as const;

/** Footer controls: fullscreen and settings, always visible. */
export function Controls({ fullscreen, canFullscreen, onToggleFullscreen, onOpenSettings }: Props) {
  return (
    <div className="controls">
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
