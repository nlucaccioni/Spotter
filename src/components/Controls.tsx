import { Maximize, Minimize, SlidersHorizontal } from 'lucide-react';

interface Props {
  /** Fade out (display mode: the pointer has been still for a while). */
  hidden: boolean;
  fullscreen: boolean;
  canFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenSettings: () => void;
}

const ICON = { size: 15, strokeWidth: 2, 'aria-hidden': true } as const;

/** Footer controls; hidden until the mouse moves (PROJECT_BRIEF.md §5.1). */
export function Controls({
  hidden,
  fullscreen,
  canFullscreen,
  onToggleFullscreen,
  onOpenSettings,
}: Props) {
  return (
    <div className={`controls${hidden ? ' controls--hidden' : ''}`}>
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
