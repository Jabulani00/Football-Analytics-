import { Platform } from 'react-native';

import {
  BET_TYPE,
  bookingUrl,
  CORE_BET_TYPE_IDS,
  SPORT_SOCCER,
  type HbCategory,
  type HbEvent,
  type HbSport,
  type HbTournament,
  type ShareLeg,
} from '@/services/hollywoodTypes';

/**
 * Client for the Hollywoodbets sportsbook (reverse-engineered from the public
 * web app's network traffic — all endpoints are unauthenticated public GET/POST).
 *
 * Transport mirrors `services/oddAlerts.ts`: on web, requests go through the
 * bundled proxy at `/hollywood` (Expo Router API route `app/hollywood+api.ts`),
 * because every Hollywoodbets host locks CORS to their own origin. On native
 * there is no CORS, so requests hit the hosts directly.
 *
 * Data shapes and the pure helpers over them (`toDecimal`, `decimal1x2`,
 * `toShareLeg`, `bookingUrl`) live in `services/hollywoodTypes.ts` so they can
 * be used without pulling in `react-native`. They are re-exported here, so
 * importing from this module keeps working exactly as before.
 *
 * Pure data layer: no React. Fixture matching + edge live in separate helpers.
 */

export * from '@/services/hollywoodTypes';

const PROXY_URL = process.env.EXPO_PUBLIC_HOLLYWOOD_PROXY ?? '/hollywood';
const USE_PROXY = Platform.OS === 'web';

const DIRECT_HOSTS: Record<HostKey, string> = {
  events: 'https://sport-events-api.hollywoodbets.net',
  settings: 'https://comet-settings-api.hollywoodbets.net',
  live: 'https://betepsweb.hollywoodbets.net',
  bet: 'https://betapi.hollywoodbets.net',
};

type HostKey = 'events' | 'settings' | 'live' | 'bet';

// ---- Transport --------------------------------------------------------------
function buildUrl(host: HostKey, path: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) search.set(k, String(v));
  }
  if (USE_PROXY) {
    search.set('host', host);
    search.set('path', path);
    return `${PROXY_URL}?${search.toString()}`;
  }
  const qs = search.toString();
  return `${DIRECT_HOSTS[host]}/${path}${qs ? `?${qs}` : ''}`;
}

async function getJson<T>(host: HostKey, path: string, params: Record<string, string | number | undefined> = {}, signal?: AbortSignal): Promise<T> {
  const res = await fetch(buildUrl(host, path, params), { headers: { Accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`Hollywoodbets ${host}/${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

// ---- Navigation reads -------------------------------------------------------
export async function fetchSports(signal?: AbortSignal): Promise<HbSport[]> {
  const j = await getJson<{ sports?: HbSport[] } | HbSport[]>('events', 'api/events/eps/sports', { lang: 'en' }, signal);
  return Array.isArray(j) ? j : (j.sports ?? []);
}

/** Countries/categories that have soccer events. */
export async function fetchSoccerCategories(signal?: AbortSignal): Promise<HbCategory[]> {
  const j = await getJson<{ categories?: HbCategory[] }>('events', `api/events/eps/sports/${SPORT_SOCCER}/categories`, {}, signal);
  return j.categories ?? [];
}

/** Leagues/tournaments within a soccer category (country). */
export async function fetchTournaments(categoryId: number, signal?: AbortSignal): Promise<{ tournaments: HbTournament[] }> {
  return getJson('events', `api/events/eps/sports/${SPORT_SOCCER}/categories/${categoryId}/tournaments`, {}, signal);
}

/** Events (with odds for the requested bet type) in a tournament. */
export async function fetchEvents(
  categoryId: number,
  tournamentId: number,
  betTypeId: number = BET_TYPE.FULL_TIME,
  signal?: AbortSignal,
): Promise<HbEvent[]> {
  const j = await getJson<{ events?: HbEvent[] }>(
    'events',
    `api/events/eps/sports/${SPORT_SOCCER}/categories/${categoryId}/tournaments/${tournamentId}/events`,
    { withBetTypeId: betTypeId, lang: 'en' },
    signal,
  );
  return j.events ?? [];
}

/**
 * Events for a tournament carrying MANY markets, not just 1X2.
 *
 * Hollywood accepts exactly one `withBetTypeId` per request — comma lists,
 * repeated params and omitting it all return zero events (probed 2026-09-10) —
 * so this issues one call per market and merges them onto a single event list
 * keyed by event id. Requests are sequential on purpose: `CORE_BET_TYPE_IDS` is
 * already 6 round trips per tournament and `ALL_BET_TYPE_IDS` is 23, so firing
 * them in parallel is how you get the resource exhaustion seen elsewhere.
 *
 * A market that fails or is unpriced for this tournament is skipped rather than
 * failing the batch, so callers always get whatever the book did offer.
 */
export async function fetchEventsAllMarkets(
  categoryId: number,
  tournamentId: number,
  betTypeIds: readonly number[] = CORE_BET_TYPE_IDS,
  signal?: AbortSignal,
): Promise<HbEvent[]> {
  const byId = new Map<number, HbEvent>();

  for (const betTypeId of betTypeIds) {
    if (signal?.aborted) break;
    let events: HbEvent[];
    try {
      events = await fetchEvents(categoryId, tournamentId, betTypeId, signal);
    } catch {
      continue; // one market must not sink the rest
    }

    for (const event of events) {
      const existing = byId.get(event.id);
      if (!existing) {
        byId.set(event.id, { ...event, betTypes: [...event.betTypes] });
        continue;
      }
      // Keyed on eventBetTypeMapID, which is unique per group. `id` is not:
      // one market can arrive as several groups (Additional Totals is five).
      for (const bt of event.betTypes) {
        const dupe = existing.betTypes.some(
          (b) => b.eventBetTypeMapID === bt.eventBetTypeMapID,
        );
        if (!dupe) existing.betTypes.push(bt);
      }
    }
  }

  return [...byId.values()];
}

/**
 * EVERY market for a single event — the payload behind Hollywood's own "more"
 * expander on a fixture.
 *
 * The tournament listing returns one bet type per request and only a handful of
 * markets; this returns the lot in one call (130 bet-type groups / 605
 * selections on a sampled fixture), including corners, bookings, shots and
 * goalscorers that the listing never exposes. Costly enough that it belongs
 * behind a per-fixture expand rather than being loaded for a whole league.
 *
 * Note the shape difference: here a market can be split across several groups
 * sharing one `id` and differing by `eventBetTypeMapID`, so read selections with
 * `marketOdds` / `marketGroups` rather than finding a single bet type.
 */
export async function fetchEventDetail(
  eventId: number,
  signal?: AbortSignal,
): Promise<HbEvent | null> {
  const j = await getJson<{ event?: HbEvent }>(
    'events',
    `api/events/eps/events/${eventId}`,
    { lang: 'en' },
    signal,
  );
  return j.event ?? null;
}

// ---- Share A Bet (booking code + deep link) ---------------------------------

export type ShareABetResult = {
  /** The booking code punters enter / the slip deep link resolves to. */
  code: number;
  /** Ready-to-open URL that pre-loads the betslip on Hollywoodbets. */
  url: string;
  raw: unknown;
};

/**
 * Create a Hollywoodbets booking code from a set of legs. Returns the code and
 * a deep link that opens the pre-loaded betslip. This is a RESERVATION only —
 * the punter still opens the link, reviews and pays; no bet is placed here.
 *
 * `punterId` is sent unvalidated (the endpoint requires no auth); a service
 * punter number can be used. Defaults to 0 (guest) — verify acceptance live.
 */
export async function createShareABet(legs: ShareLeg[], punterId = 0): Promise<ShareABetResult> {
  if (legs.length === 0) throw new Error('createShareABet: at least one leg required');
  const body = JSON.stringify({
    punterId,
    shareABetDetails: legs.map((l) => ({
      eventBetTypeDetailMapId: 0,
      marketStatusId: 0,
      eventNumber: 0,
      betTypeDesc: '',
      betTypeGroupId: 0,
      ...l,
    })),
  });

  const res = await fetch(buildUrl('bet', 'api/punters/ShareABet', {}), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body,
  });
  if (!res.ok) throw new Error(`Hollywoodbets ShareABet → HTTP ${res.status}`);
  const json = (await res.json()) as { responseType?: number; responseMessage?: string };
  const code = json.responseType;
  if (!code) throw new Error(`ShareABet: no code in response (${json.responseMessage ?? 'unknown'})`);
  return { code, url: bookingUrl(code), raw: json };
}
