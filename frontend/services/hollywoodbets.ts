import { Platform } from 'react-native';

/**
 * Client for the Hollywoodbets sportsbook (reverse-engineered from the public
 * web app's network traffic — all endpoints are unauthenticated public GET/POST).
 *
 * Transport mirrors `services/oddAlerts.ts`: on web, requests go through the
 * bundled proxy at `/hollywood` (Expo Router API route `app/hollywood+api.ts`),
 * because every Hollywoodbets host locks CORS to their own origin. On native
 * there is no CORS, so requests hit the hosts directly.
 *
 * ODDS FORMAT — important. Hollywoodbets returns FRACTIONAL net odds in the
 * `odds` field (winnings per 1 unit staked), e.g. 0.6 with ratio "6/10". True
 * decimal odds = `odds + 1`. `toDecimal()` does this conversion; always feed
 * DECIMAL odds to the de-vig / edge math.
 *
 * Pure data layer: no React. Fixture matching + edge live in separate helpers.
 */

const PROXY_URL = process.env.EXPO_PUBLIC_HOLLYWOOD_PROXY ?? '/hollywood';
const USE_PROXY = Platform.OS === 'web';

const DIRECT_HOSTS: Record<HostKey, string> = {
  events: 'https://sport-events-api.hollywoodbets.net',
  settings: 'https://comet-settings-api.hollywoodbets.net',
  live: 'https://betepsweb.hollywoodbets.net',
  bet: 'https://betapi.hollywoodbets.net',
};

type HostKey = 'events' | 'settings' | 'live' | 'bet';

/** Soccer is sport id 1 across every Hollywoodbets endpoint. */
export const SPORT_SOCCER = 1;

/** Bet-type ids (soccer). Swap into `withBetTypeId` to fetch a given market. */
export const BET_TYPE = {
  FULL_TIME: 15, // 1X2
  BTTS: 22, // Both Teams to Score
  TOTALS: 27, // Over/Under
  DOUBLE_CHANCE: 19,
  CORRECT_SCORE: 20,
  HT_FT: 23,
} as const;

// ---- Raw response shapes (from captured traffic) ----------------------------
export type HbSport = { id: number; name: string; liveEventCount?: number };
export type HbCategory = { id: number; name: string };
export type HbTournament = {
  id: number;
  name: string;
  countryId?: number;
  countryName?: string;
  countryCode?: string;
  priority?: number;
};

/** A single selection/outcome within a market. `odds` is FRACTIONAL. */
export type HbMarket = {
  id: number;
  eventId: number;
  eventBetTypeMapId: number;
  eventDetailId: number;
  status: string;
  number: number; // 1X2: 1 = home, 2 = draw, 3 = away
  name: string; // team short name or "Draw"
  odds: number; // FRACTIONAL net odds — decimal = odds + 1
  ratio: string; // e.g. "6/10"
};

export type HbBetType = {
  id: number; // e.g. 15 = Full Time
  name: string;
  status: string;
  eventBetTypeMapID: number;
  markets: HbMarket[];
};

export type HbEvent = {
  id: number;
  name: string; // "Home vs Away"
  startTime: string; // ISO
  categoryId: number;
  category: string;
  tournament: string;
  isOutright: boolean;
  betTypes: HbBetType[];
};

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

// ---- Odds helpers -----------------------------------------------------------
/** Convert a Hollywoodbets fractional `odds` value to true decimal odds. */
export function toDecimal(fractionalOdds: number): number {
  return fractionalOdds + 1;
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

// ---- Convenience: extract 1X2 decimal odds from an event --------------------
export type Decimal1x2 = { home: number; draw: number; away: number } | null;

/** Pull decimal 1X2 odds from an event's Full Time (id 15) bet type. */
export function decimal1x2(event: HbEvent): Decimal1x2 {
  const ft = event.betTypes.find((b) => b.id === BET_TYPE.FULL_TIME);
  if (!ft) return null;
  const byNumber = (n: number) => ft.markets.find((m) => m.number === n);
  const h = byNumber(1);
  const d = byNumber(2);
  const a = byNumber(3);
  if (!h || !d || !a) return null;
  return { home: toDecimal(h.odds), draw: toDecimal(d.odds), away: toDecimal(a.odds) };
}

// ---- Share A Bet (booking code + deep link) ---------------------------------
/** One leg of a Share-A-Bet request. Every field comes from an `HbEvent`. */
export type ShareLeg = {
  eventID: number;
  eventName: string;
  eventDate: string;
  eventBetTypeMapID: number;
  eventDetailOfferedOdd: number; // FRACTIONAL odds, as the API returns them
  sportId: number;
  tournamentName: string;
  betTypeID: number;
  betTypeName: string;
  eventDetailId: number;
  countryId: number;
  tournamentId: number;
};

/** Build a Share-A-Bet leg from an event + a chosen market/selection. */
export function toShareLeg(
  event: HbEvent,
  betType: HbBetType,
  market: HbMarket,
  ctx: { tournamentId: number; tournamentName: string; countryId: number },
): ShareLeg {
  return {
    eventID: event.id,
    eventName: event.name,
    eventDate: event.startTime,
    eventBetTypeMapID: betType.eventBetTypeMapID,
    eventDetailOfferedOdd: market.odds,
    sportId: SPORT_SOCCER,
    tournamentName: ctx.tournamentName,
    betTypeID: betType.id,
    betTypeName: betType.name,
    eventDetailId: market.eventDetailId,
    countryId: ctx.countryId,
    tournamentId: ctx.tournamentId,
  };
}

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

/** The public URL that opens a booked betslip by its code. */
export function bookingUrl(code: number): string {
  return `https://www.hollywoodbets.net/betting/${code}/code`;
}
