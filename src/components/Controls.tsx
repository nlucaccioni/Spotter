interface Props {
  /** Fade out (display mode: the pointer has been still for a while). */
  hidden: boolean;
  fullscreen: boolean;
  canFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenSettings: () => void;
}

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
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {fullscreen ? (
              <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
            ) : (
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            )}
          </svg>
        </button>
      )}
      <button
        type="button"
        className="control-button"
        onClick={onOpenSettings}
        aria-label="Settings"
        title="Settings"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="8" cy="17" r="2" />
        </svg>
      </button>
    </div>
  );
}
