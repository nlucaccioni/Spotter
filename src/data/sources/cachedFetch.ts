import { createBrowserFetcher } from './browserFetcher.ts';

// One page-lifetime cache for NASCAR's per-race files (weekend feeds, lap times, pit data,
// schedules). They don't change once a race is over, and several pages read the same ones,
// sometimes with different parsers (team names and race results both come from the weekend
// feed), so the body is fetched once per URL and each parser's result is kept separately.

const fetcher = createBrowserFetcher(20_000);
const bodies = new Map<string, Promise<unknown>>();
const parsed = new WeakMap<(raw: unknown) => unknown, Map<string, Promise<unknown>>>();

function fetchBody(url: string): Promise<unknown> {
  let body = bodies.get(url);
  if (!body) {
    body = fetcher.fetchJson(url);
    // A failure is forgotten, so a later call tries again.
    body.catch(() => bodies.delete(url));
    bodies.set(url, body);
  }
  return body;
}

/** Fetches and parses a URL once per page; rejects if the fetch fails (and retries next time). */
export function fetchCachedStrict<T>(url: string, parse: (raw: unknown) => T): Promise<T> {
  let byUrl = parsed.get(parse);
  if (!byUrl) {
    byUrl = new Map();
    parsed.set(parse, byUrl);
  }
  let entry = byUrl.get(url) as Promise<T> | undefined;
  if (!entry) {
    const store = byUrl;
    entry = fetchBody(url).then(parse);
    entry.catch(() => store.delete(url));
    store.set(url, entry);
  }
  return entry;
}

/** Like fetchCachedStrict, but a failure gives `fallback`. */
export function fetchCached<T>(url: string, parse: (raw: unknown) => T, fallback: T): Promise<T> {
  return fetchCachedStrict(url, parse).catch(() => fallback);
}
