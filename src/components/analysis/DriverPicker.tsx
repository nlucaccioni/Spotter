import { X } from 'lucide-react';
import { useState } from 'react';
import { MAX_PICKED, seriesColor, type Pickable, type usePicked } from './picked.ts';

interface Props {
  options: readonly Pickable[];
  picked: ReturnType<typeof usePicked>;
}

/** Chips for the picked drivers (in their colours) and a menu to add another. */
export function DriverPicker({ options, picked }: Props) {
  const [menuValue, setMenuValue] = useState('');
  const byId = new Map(options.map((o) => [o.id, o]));
  const chosen = picked.slots.flatMap((id, slot) => {
    const option = id === null ? undefined : byId.get(id);
    return option ? [{ option, slot }] : [];
  });
  const full = chosen.length >= MAX_PICKED;
  return (
    <div className="driver-picker" aria-label="Drivers shown in colour" role="group">
      {chosen.map(({ option, slot }) => (
        <span key={option.id} className="driver-picker__chip">
          <span className="chart__key" style={{ background: seriesColor(slot) }} aria-hidden />
          {option.label}
          <button
            type="button"
            className="driver-picker__remove"
            onClick={() => picked.remove(option.id)}
            aria-label={`Remove ${option.label}`}
            title="Remove"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </span>
      ))}
      <select
        className="driver-picker__add"
        value={menuValue}
        disabled={full}
        aria-label="Add a driver"
        title={full ? `Up to ${MAX_PICKED} drivers` : 'Add a driver'}
        onChange={(event) => {
          if (event.target.value) picked.add(event.target.value);
          setMenuValue('');
        }}
      >
        <option value="">{full ? `${MAX_PICKED} shown` : '+ Add driver'}</option>
        {options
          .filter((o) => picked.slotOf(o.id) === null)
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
      </select>
      {chosen.length > 0 && (
        <button
          type="button"
          className="drawer__link"
          onClick={picked.clear}
          title="Remove every highlighted driver"
        >
          Clear all
        </button>
      )}
      <button
        type="button"
        className="drawer__link"
        onClick={picked.reset}
        title="Highlight the default drivers again: your favorites, then the leaders"
      >
        Default picks
      </button>
    </div>
  );
}
