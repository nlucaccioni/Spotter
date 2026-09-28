import { useEffect, useSyncExternalStore } from 'react';
import { createPreferencesStore, type PreferencesStore } from '../prefs/store.ts';

let store: PreferencesStore | null = null;
const getStore = () => (store ??= createPreferencesStore());
const subscribe = (listener: () => void) => getStore().subscribe(listener);
const getSnapshot = () => getStore().get();

/** Current preferences plus an updater. Shared across the app and persisted. */
export function usePreferences() {
  const preferences = useSyncExternalStore(subscribe, getSnapshot);
  return [preferences, getStore().update] as const;
}

/** Applies the theme preference to <html data-theme>. */
export function useApplyTheme() {
  const [{ theme }] = usePreferences();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}
