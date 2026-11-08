/**
 * A row of toggle buttons, one of which is on (points and analysis page tabs). An option can
 * carry a third string, shown as that button's tooltip.
 */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly (readonly [T, string] | readonly [T, string, string])[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented-control" role="group" aria-label={label}>
      {options.map(([option, text, hint]) => (
        <button
          key={option}
          type="button"
          className="segmented-control__option"
          aria-pressed={option === value}
          title={hint}
          onClick={() => onChange(option)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
