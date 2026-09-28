import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserFetcher } from '../../src/data/sources/browserFetcher.ts';
import { FeedError } from '../../src/data/sources/fetcher.ts';

const URL = 'https://example.test/feed.json';

function stubFetch(impl: (input: string, init: RequestInit) => Promise<Response>) {
  const fetch = vi.fn(impl);
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function failure(promise: Promise<unknown>): Promise<FeedError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(FeedError);
  return error as FeedError;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browserFetcher', () => {
  it('returns parsed JSON and asks the browser to revalidate', async () => {
    const fetch = stubFetch(async () => Response.json({ lap_number: 12 }));
    await expect(createBrowserFetcher().fetchJson(URL)).resolves.toEqual({ lap_number: 12 });
    expect(fetch).toHaveBeenCalledWith(URL, expect.objectContaining({ cache: 'no-cache' }));
  });

  it('maps non-2xx responses to an "http" error with the status', async () => {
    stubFetch(async () => new Response('Forbidden', { status: 403 }));
    const error = await failure(createBrowserFetcher().fetchJson(URL));
    expect(error).toMatchObject({ kind: 'http', status: 403 });
  });

  it('maps network failures to a "network" error', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const error = await failure(createBrowserFetcher().fetchJson(URL));
    expect(error).toMatchObject({ kind: 'network', message: 'Failed to fetch' });
  });

  it('maps a non-JSON body to an "invalid" error', async () => {
    stubFetch(async () => new Response('<html>maintenance</html>'));
    const error = await failure(createBrowserFetcher().fetchJson(URL));
    expect(error.kind).toBe('invalid');
  });

  it('times out slow requests', async () => {
    stubFetch(
      (_input, init) =>
        new Promise((_resolve, reject) =>
          init.signal!.addEventListener('abort', () => reject(init.signal!.reason)),
        ),
    );
    const error = await failure(createBrowserFetcher(20).fetchJson(URL));
    expect(error.kind).toBe('timeout');
  });

  it('passes a caller abort through untouched', async () => {
    stubFetch(
      (_input, init) =>
        new Promise((_resolve, reject) =>
          init.signal!.addEventListener('abort', () => reject(init.signal!.reason)),
        ),
    );
    const controller = new AbortController();
    const pending = createBrowserFetcher().fetchJson(URL, { signal: controller.signal });
    controller.abort();
    const error = await pending.catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(FeedError);
    expect((error as Error).name).toBe('AbortError');
  });
});
