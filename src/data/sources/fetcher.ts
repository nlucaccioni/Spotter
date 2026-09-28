// The only seam for network I/O. The browser build uses browserFetcher.ts; a Tauri build or a
// proxy only needs another implementation of this interface.

export interface FetchJsonOptions {
  signal?: AbortSignal;
}

export interface Fetcher {
  /** Resolves with the parsed JSON body; rejects with a FeedError. */
  fetchJson(url: string, options?: FetchJsonOptions): Promise<unknown>;
}

export type FeedErrorKind =
  /** Request never completed: offline, DNS, CORS, connection reset. */
  | 'network'
  | 'timeout'
  /** Non-2xx response. A 403 often just means "session not live yet". */
  | 'http'
  /** Body wasn't JSON, or wasn't the shape we expect. */
  | 'invalid';

export class FeedError extends Error {
  readonly kind: FeedErrorKind;
  readonly status: number | undefined;

  constructor(kind: FeedErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'FeedError';
    this.kind = kind;
    this.status = status;
  }
}
