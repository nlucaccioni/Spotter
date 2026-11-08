import { Maximize2, Minimize2 } from 'lucide-react';
import { Segmented } from '../Segmented.tsx';

// Controls shared by the zoomable charts (championship, running order): the full-screen button
// and the row of quick ranges, "Fit to picked" and the drag hint.

export function FullScreenButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="control-button"
      onClick={onToggle}
      aria-label={active ? 'Exit full screen' : 'Full screen'}
      title={active ? 'Exit full screen (Esc)' : 'Full screen'}
    >
      {active ? (
        <Minimize2 size={15} aria-hidden="true" />
      ) : (
        <Maximize2 size={15} aria-hidden="true" />
      )}
    </button>
  );
}

interface ZoomBarProps<T extends string> {
  /** What the quick ranges pick, e.g. "Races shown". */
  label: string;
  /** Quick ranges; the first is the whole chart. */
  options: readonly (readonly [T, string])[];
  /** The range shown, or one not in `options` for a dragged or pinched range. */
  value: T | 'custom';
  onChange: (value: T) => void;
  fit: boolean;
  onFitChange: (fit: boolean) => void;
  zoomed: boolean;
}

export function ZoomBar<T extends string>({
  label,
  options,
  value,
  onChange,
  fit,
  onFitChange,
  zoomed,
}: ZoomBarProps<T>) {
  const whole = options[0]?.[1] ?? 'the whole chart';
  return (
    <div className="chart-zoom">
      <Segmented<T | 'custom'>
        label={label}
        options={options}
        value={value}
        onChange={(v) => {
          if (v !== 'custom') onChange(v);
        }}
      />
      <button
        type="button"
        className="chart-zoom__toggle"
        aria-pressed={fit}
        onClick={() => onFitChange(!fit)}
        title="Scale the chart to the picked drivers only"
      >
        Fit to picked
      </button>
      <span className="chart-zoom__hint">
        {zoomed
          ? `Double-click or choose ${whole} to zoom back out`
          : 'Drag across the chart to zoom in · click a line to highlight it'}
      </span>
    </div>
  );
}
