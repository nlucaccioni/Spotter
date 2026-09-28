import { DEFAULT_PREFERENCES, parsePreferences, type Preferences } from './preferences.ts';

export const STORAGE_KEY = 'spotter.preferences.v1';

export interface PreferencesStore {
  get(): Preferences;
  update(change: Partial<Preferences> | ((prev: Preferences) => Partial<Preferences>)): void;
  subscribe(listener: () => void): () => void;
}

/**
 * Preferences backed by Web Storage. Storage can be missing or throw (private mode, blocked
 * site data), in which case preferences still work for the session, they just aren't saved.
 * Changes made in another tab are picked up through the `storage` event.
 */
export function createPreferencesStore(
  storage: Storage | null = safeLocalStorage(),
  events: Pick<Window, 'addEventListener'> | null = typeof window === 'undefined' ? null : window,
): PreferencesStore {
  let value = read();
  const listeners = new Set<() => void>();

  function read(): Preferences {
    try {
      return parsePreferences(storage?.getItem(STORAGE_KEY) ?? null);
    } catch {
      return DEFAULT_PREFERENCES;
    }
  }

  function emit() {
    for (const listener of listeners) listener();
  }

  events?.addEventListener('storage', (event) => {
    if ((event as StorageEvent).key !== STORAGE_KEY) return;
    value = read();
    emit();
  });

  return {
    get: () => value,
    update(change) {
      const patch = typeof change === 'function' ? change(value) : change;
      value = { ...value, ...patch };
      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch {
        // Not persisted; keep the in-memory value.
      }
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
