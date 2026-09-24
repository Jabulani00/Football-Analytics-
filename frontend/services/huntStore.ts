/**
 * Section 10 — persistence for the Hollywood hunt store.
 *
 * Talks to Supabase over PostgREST with plain `fetch` rather than the JS SDK, so
 * this file carries no dependencies and runs unchanged in the app, in a Node
 * script, and in a Deno edge function. Schema lives in
 * `supabase/migrations/20260911090000_hollywood_hunt.sql`.
 *
 * KEYS. Two exist and they are not interchangeable:
 *   * the anon key is designed to be public and is safe in the client bundle —
 *     RLS on these tables allows it to read and nothing else;
 *   * the service-role key bypasses RLS entirely and must only ever be used by
 *     the crawler, server-side. It must never reach the app bundle, which means
 *     never behind an `EXPO_PUBLIC_` name.
 *
 * `createHuntStore` takes the key explicitly rather than reading the
 * environment, so a caller cannot accidentally hand the client a writer.
 */

import type { HwChangeRow, HwEventRow } from '@/services/hollywoodHunt';

export type HuntStoreConfig = {
  /** Project URL, e.g. https://<ref>.supabase.co — no trailing slash needed. */
  url: string;
  /** anon key for reads, service-role key for the crawler. */
  key: string;
  /** Injectable for tests and for runtimes with a non-global fetch. */
  fetchImpl?: typeof fetch;
};

export type CrawlStateRow = {
  category_id: number;
  tournament_id: number;
  tournament: string | null;
  next_kickoff: string | null;
  last_crawled: string | null;
  last_attempted?: string | null;
  last_succeeded?: string | null;
  status?: 'never' | 'success' | 'partial' | 'failed';
  last_error?: string | null;
  last_event_count?: number | null;
  consecutive_empty?: number;
  last_crawl_key?: string | null;
};

export class HuntStoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = 'HuntStoreError';
  }
}

/** PostgREST requests in batches; one oversized body is a 413, not a retry. */
const CHUNK = 500;

function chunk<T>(rows: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export function createHuntStore(config: HuntStoreConfig) {
  const base = `${config.url.replace(/\/+$/, '')}/rest/v1`;
  const doFetch = config.fetchImpl ?? fetch;

  const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
    apikey: config.key,
    // Legacy anon/service keys are JWTs. New sb_publishable_/sb_secret_ keys
    // belong only in `apikey`; sending them as Bearer tokens is invalid.
    ...(config.key.startsWith('eyJ') ? { Authorization: `Bearer ${config.key}` } : {}),
    'Content-Type': 'application/json',
    ...extra,
  });

  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const res = await doFetch(`${base}${path}`, init);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new HuntStoreError(
        `Supabase ${init.method ?? 'GET'} ${path} → HTTP ${res.status}`,
        res.status,
        body,
      );
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return {
    // ---- writes (crawler / service role) ------------------------------------

    /** Upsert current listing state. Conflicts on the natural key, `event_id`. */
    async upsertEvents(rows: HwEventRow[]): Promise<void> {
      for (const batch of chunk(rows)) {
        if (batch.length === 0) continue;
        await request<void>('/hw_event?on_conflict=event_id', {
          method: 'POST',
          headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify(batch),
        });
      }
    },

    /** Append change rows. Never updates — the log is the history. */
    async insertChanges(rows: HwChangeRow[]): Promise<void> {
      for (const batch of chunk(rows)) {
        if (batch.length === 0) continue;
        await request<void>('/hw_change', {
          method: 'POST',
          headers: headers({ Prefer: 'return=minimal' }),
          body: JSON.stringify(batch),
        });
      }
    },

    /**
     * Tombstone fixtures a crawl no longer saw. Separate from `upsertEvents`
     * because a removed fixture is absent from the crawl by definition, so
     * there is no row to upsert — only an id to mark.
     */
    async markRemoved(eventIds: number[], atIso: string): Promise<void> {
      for (const batch of chunk(eventIds)) {
        if (batch.length === 0) continue;
        const ids = batch.join(',');
        await request<void>(`/hw_event?event_id=in.(${ids})`, {
          method: 'PATCH',
          headers: headers({ Prefer: 'return=minimal' }),
          body: JSON.stringify({ removed_at: atIso }),
        });
      }
    },

    async upsertCrawlState(rows: CrawlStateRow[]): Promise<void> {
      if (rows.length === 0) return;
      await request<void>('/hw_crawl_state?on_conflict=category_id,tournament_id', {
        method: 'POST',
        headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(rows),
      });
    },

    // ---- reads (app / anon key) ---------------------------------------------

    /**
     * The notes' hourly question: what changed since a given moment.
     * Newest first, capped — this feeds a panel, not a report.
     */
    async recentChanges(sinceIso: string, limit = 200): Promise<HwChangeRow[]> {
      const qs = new URLSearchParams({
        select: '*',
        observed_at: `gte.${sinceIso}`,
        order: 'observed_at.desc',
        limit: String(limit),
      });
      return request<HwChangeRow[]>(`/hw_change?${qs}`, { method: 'GET', headers: headers() });
    },

    /** Fixtures Hollywood has stopped listing, most recent first. */
    async removedEvents(limit = 100): Promise<HwEventRow[]> {
      const qs = new URLSearchParams({
        select: '*',
        removed_at: 'not.is.null',
        order: 'removed_at.desc',
        limit: String(limit),
      });
      return request<HwEventRow[]>(`/hw_event?${qs}`, { method: 'GET', headers: headers() });
    },

    /** Current listing, optionally only fixtures still live. */
    async currentListing(opts: { includeRemoved?: boolean; limit?: number } = {}): Promise<HwEventRow[]> {
      const qs = new URLSearchParams({
        select: '*',
        order: 'start_time.asc',
        limit: String(opts.limit ?? 500),
      });
      if (!opts.includeRemoved) qs.set('removed_at', 'is.null');
      return request<HwEventRow[]>(`/hw_event?${qs}`, { method: 'GET', headers: headers() });
    },

    async crawlState(): Promise<CrawlStateRow[]> {
      const qs = new URLSearchParams({ select: '*' });
      return request<CrawlStateRow[]>(`/hw_crawl_state?${qs}`, {
        method: 'GET',
        headers: headers(),
      });
    },
  };
}

export type HuntStore = ReturnType<typeof createHuntStore>;

/**
 * Read-only store from public env, or null when the project is not configured.
 *
 * Returns null rather than throwing so Section 10 stays strictly additive — the
 * notes require the app to keep working with the Hollywood script stopped
 * (p76), and an unconfigured store is exactly that case.
 */
export function huntStoreFromEnv(): HuntStore | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createHuntStore({ url, key });
}
