import { AsyncLocalStorage } from 'async_hooks';
export interface RequestContextStore {
  traceId?: string;
}

/**
 * Lightweight async context wrapper for trace IDs and request metadata.
 * Used to persist context (like traceId) across async operations and RxJS streams.
 */
export class RequestContext {
  private static readonly storage =
    new AsyncLocalStorage<RequestContextStore>();

  /**
   * Runs a callback function inside a specific request context.
   * The callback’s return value (e.g. Promise, Observable, etc.) is preserved and returned.
   */
  static run<T>(store: RequestContextStore, callback: () => T): T {
    return this.storage.run(store, callback);
  }

  /**
   * Retrieves the current request context (if available).
   */
  static get(): RequestContextStore | undefined {
    return this.storage.getStore();
  }

  /**
   * Retrieves the current traceId (if available).
   */
  static traceId(): string | undefined {
    const store = this.storage.getStore();
    return store?.traceId;
  }
}
