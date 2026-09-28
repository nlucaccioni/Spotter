import { FeedError, type Fetcher, type FetchJsonOptions } from './fetcher.ts';

const DEFAULT_TIMEOUT_MS = 15_000;

export function createBrowserFetcher(timeoutMs = DEFAULT_TIMEOUT_MS): Fetcher {
  return {
    async fetchJson(url: string, options: FetchJsonOptions = {}): Promise<unknown> {
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

      let response: Response;
      try {
        // "no-cache" = always revalidate. The browser sends If-None-Match / If-Modified-Since
        // from its cached copy, and a 304 comes back to us as the cached 200.
        response = await fetch(url, { cache: 'no-cache', signal });
      } catch (error) {
        if (timeout.aborted) throw new FeedError('timeout', `Timed out after ${timeoutMs} ms`);
        if (options.signal?.aborted) throw error;
        throw new FeedError('network', error instanceof Error ? error.message : String(error));
      }

      if (!response.ok) {
        throw new FeedError('http', `HTTP ${response.status}`, response.status);
      }
      try {
        return (await response.json()) as unknown;
      } catch {
        throw new FeedError('invalid', 'Response was not valid JSON');
      }
    },
  };
}
