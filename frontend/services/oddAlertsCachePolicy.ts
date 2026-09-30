/**
 * Shared cache key and TTL policy for the OddAlerts proxy and TanStack Query.
 * Durations are short because the feed is live. Override with ODDALERTS_CACHE_TTLS.
 */

export type TtlWindow = { freshMs: number; staleMs: number };

export type TtlName =
  | 'fixtures/live'
  | 'fixtures/upcoming'
  | 'fixtures/id'
  | 'fixtures/between'
  | 'stats'
  | 'reference';

const DEFAULT_TTLS: Record<TtlName, TtlWindow> = {
  'fixtures/live': { freshMs: 10_000, staleMs: 10_000 },
  'fixtures/upcoming': { freshMs: 20_000, staleMs: 20_000 },
  'fixtures/id': { freshMs: 15_000, staleMs: 15_000 },
  'fixtures/between': { freshMs: 60_000, staleMs: 60_000 },
  stats: { freshMs: 60_000, staleMs: 120_000 },
  reference: { freshMs: 5 * 60_000, staleMs: 10 * 60_000 },
};

const FALLBACK: TtlWindow = { freshMs: 30_000, staleMs: 30_000 };

let loggedBadTtl = false;

export function cacheEnabled(): boolean {
  const raw = process.env.CACHE_ENABLED;
  if (raw == null || raw === '') return true;
  return raw !== 'false' && raw !== '0';
}

export function upstreamConcurrency(): number {
  const raw = Number(process.env.ODDALERTS_UPSTREAM_CONCURRENCY ?? 12);
  if (!Number.isFinite(raw) || raw < 1) return 12;
  return Math.floor(raw);
}

export function maxRedisBytes(): number {
  const raw = Number(process.env.ODDALERTS_CACHE_MAX_BYTES ?? 8_000_000);
  if (!Number.isFinite(raw) || raw < 1) return 8_000_000;
  return Math.floor(raw);
}

function ttlOverrides(): Partial<Record<TtlName, TtlWindow>> {
  const raw = process.env.ODDALERTS_CACHE_TTLS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<Record<TtlName, TtlWindow>>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    if (!loggedBadTtl) {
      loggedBadTtl = true;
      console.log(JSON.stringify({ source: 'oddalerts-traffic', error: 'ODDALERTS_CACHE_TTLS is not valid JSON' }));
    }
    return {};
  }
}

export function ttlNameFor(path: string): TtlName | null {
  if (path === 'fixtures/live') return 'fixtures/live';
  if (path === 'fixtures/upcoming' || path === 'value/upcoming') return 'fixtures/upcoming';
  if (/^fixtures\/[^/]+$/.test(path)) return 'fixtures/id';
  if (path === 'fixtures/between') return 'fixtures/between';
  if (
    path.startsWith('stats/season/') ||
    path.startsWith('stats/fixture/') ||
    path.startsWith('players/fixture/')
  ) {
    return 'stats';
  }
  if (path === 'countries' || path === 'competitions' || path === 'bookmakers' || path.startsWith('competitions/')) {
    return 'reference';
  }
  return null;
}

export function ttlFor(path: string): TtlWindow {
  const name = ttlNameFor(path);
  if (!name) return FALLBACK;
  const override = ttlOverrides()[name];
  if (
    override &&
    Number.isFinite(override.freshMs) &&
    Number.isFinite(override.staleMs) &&
    override.freshMs >= 0 &&
    override.staleMs >= 0
  ) {
    return { freshMs: override.freshMs, staleMs: override.staleMs };
  }
  return DEFAULT_TTLS[name];
}

/** Client refetch window. Matches the server fresh TTL for the same path. */
export function clientStaleTime(path: string): number {
  return ttlFor(path).freshMs;
}

export function cacheKey(
  path: string,
  params: Record<string, string | number | undefined | null> | URLSearchParams,
): string {
  const entries: [string, string][] = [];
  if (params instanceof URLSearchParams) {
    params.forEach((value, key) => {
      if (key === 'api_token' || key === 'path' || key === 'cache') return;
      entries.push([key, value]);
    });
  } else {
    for (const [key, value] of Object.entries(params)) {
      if (key === 'api_token' || key === 'path' || key === 'cache') continue;
      if (value == null || value === '') continue;
      entries.push([key, String(value)]);
    }
  }
  entries.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  const query = entries.map(([key, value]) => `${key}=${value}`).join('&');
  return query ? `${path}?${query}` : path;
}
