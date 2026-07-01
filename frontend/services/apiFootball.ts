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
  /** Score after this goal (Flashscore-style running score). */
  scoreHome: number;
  scoreAway: number;
};

export type MatchTimelineEvent = {
  kind: 'goal' | 'yellow' | 'red' | 'sub';
  side: 'home' | 'away';
  minute: number;
  extra: number | null;
  player: string;
  detail: string;
  /** Substitution: player coming off. */
  relatedPlayer: string | null;
};

export type MatchEventsResult = {
  goals: MatchGoalEvent[];
  timeline: MatchTimelineEvent[];
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
const eventsCache = new Map<string, MatchEventsResult>();

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

  const dates = new Set<string>();
  dates.add(kickoffDate(opts.unix));
  // Kick-off may fall on adjacent UTC dates vs local fixture calendars.
  dates.add(kickoffDate(opts.unix - 86400));
  dates.add(kickoffDate(opts.unix + 86400));

  for (const date of dates) {
    const env = await getJson<ApiEnvelope<RawFixture>>('fixtures', { date, timezone: 'UTC' });
    if (signal?.aborted) return null;

    const hit = env.response?.find(
      (f) => namesMatch(f.teams.home.name, opts.homeName) && namesMatch(f.teams.away.name, opts.awayName),
    );
    if (hit) {
      fixtureIdCache.set(cacheKey, hit.fixture.id);
      return hit.fixture.id;
    }
  }

  return null;
}

function goalSortKey(g: Pick<MatchGoalEvent, 'minute' | 'extra'>): number {
  return g.minute + (g.extra ?? 0) * 0.01;
}

function mapTimelineEvents(
  events: RawEvent[],
  homeName: string,
  awayName: string,
): MatchTimelineEvent[] {
  const out: MatchTimelineEvent[] = [];

  for (const e of events) {
    const isHome = namesMatch(e.team.name, homeName);
    const isAway = namesMatch(e.team.name, awayName);
    const side = (isHome ? 'home' : isAway ? 'away' : 'home') as 'home' | 'away';
    const minute = e.time.elapsed;
    const extra = e.time.extra;
    const player = e.player?.name?.trim() || 'Unknown';

    if (e.type === 'Goal' && !/missed/i.test(e.detail)) {
      out.push({
        kind: 'goal',
        side,
        minute,
        extra,
        player,
        detail: e.detail || 'Goal',
        relatedPlayer: e.assist?.name?.trim() || null,
      });
      continue;
    }

    if (e.type === 'Card') {
      const isRed = /red/i.test(e.detail);
      out.push({
        kind: isRed ? 'red' : 'yellow',
        side,
        minute,
        extra,
        player,
        detail: e.detail || 'Card',
        relatedPlayer: null,
      });
      continue;
    }

    if (e.type === 'subst') {
      out.push({
        kind: 'sub',
        side,
        minute,
        extra,
        player,
        detail: e.detail || 'Substitution',
        relatedPlayer: e.assist?.name?.trim() || null,
      });
    }
  }

  return out.sort((a, b) => a.minute + (a.extra ?? 0) * 0.01 - (b.minute + (b.extra ?? 0) * 0.01));
}

function buildGoalsFromTimeline(
  timeline: MatchTimelineEvent[],
  homeName: string,
  awayName: string,
): MatchGoalEvent[] {
  const raw = timeline
    .filter((e) => e.kind === 'goal')
    .map((e) => ({
      side: e.side,
      minute: e.minute,
      extra: e.extra,
      player: e.player,
      assist: e.relatedPlayer,
      detail: e.detail,
      scoreHome: 0,
      scoreAway: 0,
    }))
    .sort((a, b) => goalSortKey(a) - goalSortKey(b));

  let home = 0;
  let away = 0;
  for (const g of raw) {
    if (g.side === 'home') home += 1;
    else away += 1;
    g.scoreHome = home;
    g.scoreAway = away;
  }

  return raw;
}

/**
 * Load goals, cards and substitutions for an OddAlerts fixture.
 */
export async function fetchMatchEvents(
  detail: { id: number; home_name: string; away_name: string; unix: number },
  signal?: AbortSignal,
): Promise<MatchEventsResult> {
  if (!isConfigured()) {
    return { goals: [], timeline: [], configured: false, matched: false };
  }

  try {
    const cacheKey = String(detail.id);
    const cached = eventsCache.get(cacheKey);
    if (cached) return cached;

    const fixtureId = await findApiFixtureId(
      { homeName: detail.home_name, awayName: detail.away_name, unix: detail.unix },
      signal,
    );
    if (!fixtureId) {
      return { goals: [], timeline: [], configured: true, matched: false };
    }

    const env = await getJson<ApiEnvelope<RawEvent>>('fixtures/events', { fixture: fixtureId });
    if (signal?.aborted) {
      return { goals: [], timeline: [], configured: true, matched: true };
    }

    const timeline = mapTimelineEvents(env.response ?? [], detail.home_name, detail.away_name);
    const goals = buildGoalsFromTimeline(timeline, detail.home_name, detail.away_name);
    const result: MatchEventsResult = { goals, timeline, configured: true, matched: true };
    eventsCache.set(cacheKey, result);
    return result;
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_CONFIGURED') {
      return { goals: [], timeline: [], configured: false, matched: false };
    }
    throw err;
  }
}

/**
 * Load goal scorers + minutes for an OddAlerts fixture by matching teams on kick-off date.
 */
export async function fetchMatchGoals(
  detail: { id: number; home_name: string; away_name: string; unix: number },
  signal?: AbortSignal,
): Promise<MatchEventsResult> {
  return fetchMatchEvents(detail, signal);
}
