import { Minus, Plus } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { clampDelay, MAX_DELAY_SECONDS, parseDelayInput } from '../prefs/preferences.ts';

interface Props {
  value: number;
  onChange: (seconds: number) => void;
  id?: string;
}

/**
 * − [ seconds ] + stepper for the TV delay. Buttons and ↑/↓ step by 1 second (Shift: 10);
 * the number can also be typed and is applied on Enter or when the field loses focus.
 */
export function DelayStepper({ value, onChange, id }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (text: string) => {
    const parsed = parseDelayInput(text);
    if (parsed !== null) onChange(parsed);
    setDraft(null);
  };
  const step = (by: number) => {
    setDraft(null);
    onChange(clampDelay(value + by));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const by = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      step(by);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      step(-by);
    } else if (event.key === 'Enter') {
      commit(event.currentTarget.value);
    } else if (event.key === 'Escape' && draft !== null) {
      event.stopPropagation(); // cancel the edit, don't close the drawer
      setDraft(null);
    }
  };

  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper__button"
        onClick={(e) => step(e.shiftKey ? -10 : -1)}
        disabled={value <= 0}
        aria-label="Decrease delay by 1 second"
        title="−1 s (Shift: −10 s)"
      >
        <Minus size="1em" aria-hidden="true" />
      </button>
      <input
        id={id}
        className="stepper__input"
        type="text"
        inputMode="numeric"
        role="spinbutton"
        aria-valuemin={0}
        aria-valuemax={MAX_DELAY_SECONDS}
        aria-valuenow={value}
        aria-valuetext={`${value} seconds`}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={(e) => e.target.select()}
      />
      <button
        type="button"
        className="stepper__button"
        onClick={(e) => step(e.shiftKey ? 10 : 1)}
        disabled={value >= MAX_DELAY_SECONDS}
        aria-label="Increase delay by 1 second"
        title="+1 s (Shift: +10 s)"
      >
        <Plus size="1em" aria-hidden="true" />
      </button>
    </div>
  );
}
