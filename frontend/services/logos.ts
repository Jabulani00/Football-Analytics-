import { Platform } from 'react-native';

/**
 * Club badge (logo) lookup via TheSportsDB.
 * - Web:    through the `/teamlogo` proxy route (CORS-safe, key server-side).
 * - Native: directly against TheSportsDB (no browser CORS).
 *
 * Results (including misses) are cached in-memory so each club is looked up once.
 */

const LOGO_PROXY = process.env.EXPO_PUBLIC_LOGO_PROXY ?? '/teamlogo';
const TSDB_KEY = process.env.EXPO_PUBLIC_THESPORTSDB_KEY ?? '123';
const USE_PROXY = Platform.OS === 'web';

const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

async function lookup(name: string): Promise<string | null> {
  if (USE_PROXY) {
    const res = await fetch(`${LOGO_PROXY}?name=${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { badge?: string | null };
    return data?.badge ?? null;
  }
  const res = await fetch(
    `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}/searchteams.php?t=${encodeURIComponent(name)}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { teams?: { strTeamBadge?: string | null }[] | null };
  return data?.teams?.[0]?.strTeamBadge ?? null;
}

export async function fetchTeamBadge(name: string | null | undefined): Promise<string | null> {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  if (inflight.has(key)) return inflight.get(key)!;

  const promise = (async () => {
    try {
      const badge = await lookup(name);
      cache.set(key, badge);
      return badge;
    } catch {
      cache.set(key, null);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}
