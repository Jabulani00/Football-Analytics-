/**
 * Tiny in-memory TTL cache with in-flight de-duplication.
 *
 * Makes re-selecting a competition instant (no refetch/rebuild within the TTL)
 * and collapses concurrent identical requests — e.g. the Stats Tables and
 * Predictions panels asking for the same competition at once — into one fetch.
 *
 * Pure (no network, no React) → unit-testable.
 */

type Entry<T> = { value: T; expires: number };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Return the cached value for `key` if fresh; otherwise run `fn`, cache its
 * result for `ttlMs`, and return it. Concurrent calls with the same key share
 * one in-flight promise.
 */
export function cachedFetch<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return Promise.resolve(hit.value as T);

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const p = fn()
    .then((value) => {
      store.set(key, { value, expires: Date.now() + ttlMs });
      inflight.delete(key);
      return value;
    })
    .catch((e) => {
      inflight.delete(key); // don't cache failures
      throw e;
    });
  inflight.set(key, p);
  return p;
}

/** Clear everything (tests / manual refresh). */
export function clearFixtureCache(): void {
  store.clear();
  inflight.clear();
}

/** Current number of cached (non-expired counted lazily) entries — for tests. */
export function cacheSize(): number {
  return store.size;
}
