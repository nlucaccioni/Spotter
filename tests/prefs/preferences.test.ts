import { describe, expect, it, vi } from 'vitest';
import {
  clampDelay,
  DEFAULT_PREFERENCES,
  favoriteKey,
  parseDelayInput,
  parsePreferences,
  toggleInList,
  TOGGLEABLE_COLUMNS,
} from '../../src/prefs/preferences.ts';
import { createPreferencesStore, STORAGE_KEY } from '../../src/prefs/store.ts';

describe('parsePreferences', () => {
  it('returns defaults for missing or broken data', () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('not json')).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('42')).toEqual(DEFAULT_PREFERENCES);
  });

  it('keeps valid fields and repairs invalid ones individually', () => {
    const prefs = parsePreferences(
      JSON.stringify({
        theme: 'light',
        showTicker: 'yes',
        hiddenColumns: ['mfr', 'bogus', 'pos', 'driver', 7],
        favorites: ['id:4030', 12, 'name:Kyle Larson'],
        pinFavorites: true,
      }),
    );
    expect(prefs).toEqual({
      theme: 'light',
      showTicker: true,
      hiddenColumns: ['mfr'],
      favorites: ['id:4030', 'name:Kyle Larson'],
      pinFavorites: true,
      showCarBadges: false,
      delaySeconds: 0,
      liveSeries: 'auto',
    });
  });

  it('never lets identity columns be hidden', () => {
    expect(TOGGLEABLE_COLUMNS.map((c) => c.id)).not.toEqual(
      expect.arrayContaining(['pos', 'car', 'driver']),
    );
  });
});

describe('favoriteKey and toggleInList', () => {
  const name = { full: 'Kyle Larson', initial: 'K. Larson', last: 'Larson', badges: [] };

  it('prefers the driver id and falls back to the name', () => {
    expect(favoriteKey({ driverId: 4030, name })).toBe('id:4030');
    expect(favoriteKey({ driverId: null, name })).toBe('name:Kyle Larson');
  });

  it('adds and removes items', () => {
    expect(toggleInList(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleInList(['a', 'b'], 'a')).toEqual(['b']);
  });
});

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: vi.fn((k: string, v: string) => void data.set(k, v)),
    data,
  } as unknown as Storage & { data: Map<string, string>; setItem: ReturnType<typeof vi.fn> };
}

describe('createPreferencesStore', () => {
  it('loads saved preferences and persists updates', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ theme: 'light' }) });
    const store = createPreferencesStore(storage, null);
    expect(store.get().theme).toBe('light');

    const listener = vi.fn();
    store.subscribe(listener);
    store.update((p) => ({ favorites: toggleInList(p.favorites, 'id:1') }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!)).toMatchObject({
      theme: 'light',
      favorites: ['id:1'],
    });
  });

  it('keeps working in memory when storage throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const store = createPreferencesStore(storage, null);
    expect(store.get()).toEqual(DEFAULT_PREFERENCES);
    store.update({ showTicker: false });
    expect(store.get().showTicker).toBe(false);
  });

  it('picks up changes made in another tab', () => {
    const storage = memoryStorage();
    const events = new EventTarget();
    const store = createPreferencesStore(storage, events as unknown as Window);
    const listener = vi.fn();
    store.subscribe(listener);

    storage.data.set(STORAGE_KEY, JSON.stringify({ pinFavorites: true }));
    events.dispatchEvent(Object.assign(new Event('storage'), { key: STORAGE_KEY }));
    expect(store.get().pinFavorites).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    events.dispatchEvent(Object.assign(new Event('storage'), { key: 'something-else' }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('TV delay values', () => {
  it('parses typed input, tolerating a trailing s and whitespace', () => {
    expect(parseDelayInput('30')).toBe(30);
    expect(parseDelayInput(' 45s ')).toBe(45);
    expect(parseDelayInput('12.6')).toBe(13);
    expect(parseDelayInput('abc')).toBeNull();
    expect(parseDelayInput('')).toBeNull();
    expect(parseDelayInput('-5')).toBeNull();
  });

  it('clamps to whole seconds between 0 and 900', () => {
    expect(clampDelay(-3)).toBe(0);
    expect(clampDelay(5000)).toBe(900);
    expect(clampDelay(Number.NaN)).toBe(0);
  });

  it('repairs a stored delay', () => {
    expect(parsePreferences(JSON.stringify({ delaySeconds: 42 })).delaySeconds).toBe(42);
    expect(parsePreferences(JSON.stringify({ delaySeconds: 99999 })).delaySeconds).toBe(900);
    expect(parsePreferences(JSON.stringify({ delaySeconds: 'soon' })).delaySeconds).toBe(0);
  });

  it('keeps a known series and falls back to auto', () => {
    const series = (value: unknown) =>
      parsePreferences(JSON.stringify({ liveSeries: value })).liveSeries;
    expect(series(3)).toBe(3);
    expect(series('auto')).toBe('auto');
    expect(series(4)).toBe('auto');
    expect(series('cup')).toBe('auto');
  });
});
