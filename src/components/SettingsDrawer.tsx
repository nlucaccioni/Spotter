import { useEffect, useRef } from 'react';
import type { Session } from '../data/model/types.ts';
import { usePreferences } from '../hooks/usePreferences.ts';
import { favoriteKey, toggleInList, TOGGLEABLE_COLUMNS, type Theme } from '../prefs/preferences.ts';

interface Props {
  session: Session | null;
  onClose: () => void;
}

/** Settings overlay, hidden by default (PROJECT_BRIEF.md §5.1: no side panels in portrait). */
export function SettingsDrawer({ session, onClose }: Props) {
  const [prefs, update] = usePreferences();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const drivers = [...(session?.cars ?? [])].sort(
    (a, b) => Number.parseInt(a.carNumber, 10) - Number.parseInt(b.carNumber, 10),
  );

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="drawer__header">
          <h2 id="settings-title">Settings</h2>
          <button ref={closeRef} type="button" className="drawer__close" onClick={onClose}>
            Close
          </button>
        </header>

        <section className="drawer__section">
          <h3>Display</h3>
          <div className="segmented" role="radiogroup" aria-label="Theme">
            {(['dark', 'light'] as Theme[]).map((theme) => (
              <label key={theme} className="segmented__option">
                <input
                  type="radio"
                  name="theme"
                  checked={prefs.theme === theme}
                  onChange={() => update({ theme })}
                />
                {theme === 'dark' ? 'Dark' : 'Light'}
              </label>
            ))}
          </div>
          <Toggle
            label="Show event ticker"
            checked={prefs.showTicker}
            onChange={(showTicker) => update({ showTicker })}
          />
          <Toggle
            label="Pin favorites to the top"
            checked={prefs.pinFavorites}
            onChange={(pinFavorites) => update({ pinFavorites })}
          />
          <Toggle
            label="Team car-number graphics"
            checked={prefs.showCarBadges}
            onChange={(showCarBadges) => update({ showCarBadges })}
          />
          <p className="drawer__hint">
            Loads each team&apos;s styled car number from NASCAR&apos;s servers. Off by default.
          </p>
        </section>

        <section className="drawer__section">
          <h3>Columns</h3>
          <p className="drawer__hint">
            Columns also drop out on their own when the screen is too narrow.
          </p>
          <div className="drawer__grid">
            {TOGGLEABLE_COLUMNS.map((column) => (
              <Toggle
                key={column.id}
                label={column.title}
                checked={!prefs.hiddenColumns.includes(column.id)}
                onChange={() =>
                  update((p) => ({ hiddenColumns: toggleInList(p.hiddenColumns, column.id) }))
                }
              />
            ))}
          </div>
        </section>

        <section className="drawer__section">
          <h3>Favorite drivers</h3>
          <p className="drawer__hint">Tip: double-click a row on the board to toggle a favorite.</p>
          {drivers.length === 0 ? (
            <p className="drawer__hint">No session loaded.</p>
          ) : (
            <div className="drawer__grid">
              {drivers.map((car) => {
                const key = favoriteKey(car);
                return (
                  <Toggle
                    key={car.carNumber}
                    label={`#${car.carNumber} ${car.name.full}`}
                    checked={prefs.favorites.includes(key)}
                    onChange={() => update((p) => ({ favorites: toggleInList(p.favorites, key) }))}
                  />
                );
              })}
            </div>
          )}
          {prefs.favorites.length > 0 && (
            <button
              type="button"
              className="drawer__link"
              onClick={() => update({ favorites: [] })}
            >
              Clear all favorites
            </button>
          )}
        </section>
      </aside>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
