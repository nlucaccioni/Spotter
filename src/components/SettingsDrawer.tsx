import { useEffect, useRef } from 'react';
import { SERIES_IDS, SERIES_SHORT } from '../data/feeds/schedule.ts';
import { seriesFromId } from '../data/model/lookups.ts';
import type { Session } from '../data/model/types.ts';
import { usePreferences } from '../hooks/usePreferences.ts';
import { DelayStepper } from './DelayStepper.tsx';
import {
  favoriteKey,
  toggleInList,
  TOGGLEABLE_COLUMNS,
  type TeamDisplay,
  type Theme,
} from '../prefs/preferences.ts';

interface Props {
  session: Session | null;
  /** The series on screen; only its team display option is offered. */
  seriesId: number | null;
  onClose: () => void;
}

/** Settings overlay, hidden by default (PROJECT_BRIEF.md §5.1: no side panels in portrait). */
export function SettingsDrawer({ session, seriesId, onClose }: Props) {
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

  const pageSeries = SERIES_IDS.find((id) => id === seriesId) ?? null;

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
          <h3>
            <label htmlFor="tv-delay">TV delay (seconds)</label>
          </h3>
          <DelayStepper
            id="tv-delay"
            value={prefs.delaySeconds}
            onChange={(delaySeconds) => update({ delaySeconds })}
          />
          <p className="drawer__hint">
            Holds the board back so it lines up with a delayed broadcast. Type a number or use − /
            +; Shift steps by 10.
          </p>
        </section>

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
          <Toggle
            label="Manufacturer logos"
            checked={prefs.showMfrLogos}
            onChange={(showMfrLogos) => update({ showMfrLogos })}
          />
          <p className="drawer__hint">
            Loads each team&apos;s styled car number and each manufacturer&apos;s logo from
            NASCAR&apos;s servers. Both off by default.
          </p>
          {/* Only the series on screen: the other series' choices stay as they were. */}
          {pageSeries !== null && (
            <>
              <label className="drawer__select">
                Team display ({SERIES_SHORT[pageSeries]})
                <select
                  value={prefs.teamDisplay[pageSeries]}
                  onChange={(event) =>
                    update((p) => ({
                      teamDisplay: {
                        ...p.teamDisplay,
                        [pageSeries]: event.target.value as TeamDisplay,
                      },
                    }))
                  }
                >
                  <option value="full">Full name</option>
                  <option value="short">Shorthand</option>
                  <option value="logo">Team logo</option>
                </select>
              </label>
              <p className="drawer__hint">
                For the {seriesFromId(pageSeries).name} on the points page and the
                leaderboard&apos;s Team column; each series has its own. Shorthands are the ones
                used on broadcasts (HMS, JGR). Logos are loaded from NASCAR&apos;s servers and only
                exist for full-time Cup organizations; other teams show their shorthand.
              </p>
            </>
          )}
        </section>

        <section className="drawer__section">
          <h3>Columns</h3>
          <p className="drawer__hint">
            Columns also drop out on their own when the screen is too narrow.
          </p>
          <div className="drawer__grid">
            {TOGGLEABLE_COLUMNS.flatMap((column) => {
              const toggle = (
                <Toggle
                  key={column.id}
                  label={column.title}
                  checked={!prefs.hiddenColumns.includes(column.id)}
                  onChange={() =>
                    update((p) => ({ hiddenColumns: toggleInList(p.hiddenColumns, column.id) }))
                  }
                />
              );
              // Team is off by default, so it has its own switch; it sits next to Manufacturer.
              return column.id === 'mfr'
                ? [
                    toggle,
                    <Toggle
                      key="team"
                      label="Team"
                      checked={prefs.showTeamColumn}
                      onChange={(showTeamColumn) => update({ showTeamColumn })}
                    />,
                  ]
                : [toggle];
            })}
          </div>
          <p className="drawer__hint">
            Team is off by default and shows as chosen under Team display. When it&apos;s on it
            ranks just after Best and ±, and it&apos;s left out when there isn&apos;t room for it.
          </p>
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
