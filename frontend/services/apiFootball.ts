import { Platform } from 'react-native';

/**
 * API-Football (api-sports.io) — match events: goals, assists, cards, subs.
 * OddAlerts does not expose per-player events; this is the secondary source.
 *
 * Web:    `/football` Expo API route (key server-side).
 * Native: direct calls with EXPO_PUBLIC_API_FOOTBALL_KEY.
 */

const DIRECT_BASE = 'https://v3.football.api-sports.io';
const PROXY_URL = process.env.EXPO_PUBLIC_API_FOOTBALL_PROXY ?? '/football';
const NATIVE_KEY = process.env.EXPO_PUBLIC_API_FOOTBALL_KEY ?? '';
const USE_PROXY = Platform.OS === 'web';

export type MatchGoalEvent = {
  side: 'home' | 'away';
  minute: number;
  extra: number | null;
  player: string;
  assist: string | null;
  detail: string;
};

export type MatchEventsResult = {
  goals: MatchGoalEvent[];
  /** API key present (proxy env or native public key). */
  configured: boolean;
  /** Matched an API-Football fixture for this OddAlerts game. */
  matched: boolean;
};

type ApiEnvelope<T> = { response: T[]; errors?: Record<string, string> };

type RawFixture = {
  fixture: { id: number; timestamp: number };
  teams: { home: { name: string }; away: { name: string } };
};

type RawEvent = {
  team: { name: string };
  player: { name: string | null };
  assist: { name: string | null };
  type: string;
  detail: string;
  time: { elapsed: number; extra: number | null };
};

const fixtureIdCache = new Map<string, number>();
const eventsCache = new Map<string, MatchGoalEvent[]>();

function isConfigured(): boolean {
  return USE_PROXY || Boolean(NATIVE_KEY);
}

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|sc|cf|fk|afc|bk|if|ac|sv|as|cd|ud)\b/gi, '')
    .replace(/[^a-z0-9]/g, '');
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

function kickoffDate(unix: number): string {
  const d = new Date(unix * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function getJson<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    search.set(k, String(v));
  }

  let url: string;
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (USE_PROXY) {
    search.set('path', path);
    url = `${PROXY_URL}?${search.toString()}`;
  } else {
    url = `${DIRECT_BASE}/${path}?${search.toString()}`;
    headers['x-apisports-key'] = NATIVE_KEY;
  }

  const res = await fetch(url, { headers });
  if (res.status === 500 && USE_PROXY) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (body.error?.includes('not configured')) {
      throw new Error('NOT_CONFIGURED');
    }
  }
  if (!res.ok) {
    throw new Error(`API-Football ${res.status}`);
  }
  return (await res.json()) as T;
}

async function findApiFixtureId(
  opts: { homeName: string; awayName: string; unix: number },
  signal?: AbortSignal,
): Promise<number | null> {
  const cacheKey = `${opts.unix}:${opts.homeName}:${opts.awayName}`;
  const cached = fixtureIdCache.get(cacheKey);
  if (cached) return cached;

  const date = kickoffDate(opts.unix);
  const env = await getJson<ApiEnvelope<RawFixture>>('fixtures', { date, timezone: 'UTC' });
  if (signal?.aborted) return null;

  const hit = env.response?.find(
    (f) => namesMatch(f.teams.home.name, opts.homeName) && namesMatch(f.teams.away.name, opts.awayName),
  );
  if (!hit) return null;

  fixtureIdCache.set(cacheKey, hit.fixture.id);
  return hit.fixture.id;
}

function mapGoals(
  events: RawEvent[],
  homeName: string,
  awayName: string,
): MatchGoalEvent[] {
  return events
    .filter((e) => e.type === 'Goal')
    .map((e) => {
      const isHome = namesMatch(e.team.name, homeName);
      const isAway = namesMatch(e.team.name, awayName);
      return {
        side: isHome ? 'home' : isAway ? 'away' : 'home',
        minute: e.time.elapsed,
        extra: e.time.extra,
        player: e.player?.name?.trim() || 'Unknown',
        assist: e.assist?.name?.trim() || null,
        detail: e.detail || 'Goal',
      } satisfies MatchGoalEvent;
    });
}

/**
 * Load goal scorers + minutes for an OddAlerts fixture by matching teams on kick-off date.
 */
export async function fetchMatchGoals(
  detail: { id: number; home_name: string; away_name: string; unix: number },
  signal?: AbortSignal,
): Promise<MatchEventsResult> {
  if (!isConfigured()) {
    return { goals: [], configured: false, matched: false };
  }

  try {
    const cacheKey = String(detail.id);
    const cached = eventsCache.get(cacheKey);
    if (cached) {
      return { goals: cached, configured: true, matched: true };
    }

    const fixtureId = await findApiFixtureId(
      { homeName: detail.home_name, awayName: detail.away_name, unix: detail.unix },
      signal,
    );
    if (!fixtureId) {
      return { goals: [], configured: true, matched: false };
    }

    const env = await getJson<ApiEnvelope<RawEvent>>('fixtures/events', { fixture: fixtureId });
    if (signal?.aborted) {
      return { goals: [], configured: true, matched: true };
    }

    const goals = mapGoals(env.response ?? [], detail.home_name, detail.away_name);
    eventsCache.set(cacheKey, goals);
    return { goals, configured: true, matched: true };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_CONFIGURED') {
      return { goals: [], configured: false, matched: false };
    }
    throw err;
  }
}
