/**
 * Hollywoodbets data shapes and the pure helpers over them.
 *
 * Split out of `services/hollywoodbets.ts` so anything that only needs to
 * *understand* Hollywood data can avoid the transport layer — which imports
 * `react-native` for its proxy/direct decision and therefore cannot load in a
 * plain Node script, a test runner, or a Deno edge function. Keep this file
 * free of imports so it stays portable to every one of those.
 *
 * `services/hollywoodbets.ts` re-exports everything here, so existing importers
 * do not need to know about the split.
 *
 * ODDS FORMAT — important. Hollywoodbets returns FRACTIONAL net odds in the
 * `odds` field (winnings per 1 unit staked), e.g. 0.6 with ratio "6/10". True
 * decimal odds = `odds + 1`. `toDecimal()` does this conversion; always feed
 * DECIMAL odds to the de-vig / edge math.
 */

export const SPORT_SOCCER = 1;

/**
 * Bet-type ids (soccer). Swap into `withBetTypeId` to fetch a given market.
 *
 * VERIFIED AGAINST THE LIVE FEED (2026-09-10) by probing ids 1–99 on a priced
 * fixture. Hollywood accepts exactly one id per request — no comma list, no
 * repeated param, and omitting it returns nothing — so a full market set costs
 * one call per id. `fetchEventsAllMarkets` does that merge.
 *
 * `TOTALS` was previously 27, which returns no events; Over/Under is actually
 * id 60, "Additional Totals". That is why the O/U strategy lines in the notes
 * could never have been populated.
 *
 * Availability is per fixture: a given match only carries the markets the book
 * has priced, so treat this list as what *may* be offered, not a guarantee.
 */
export const BET_TYPE = {
  FULL_TIME: 15, // 1X2
  HALF_TIME: 16, // 1X2 at half time
  HANDICAP: 17,
  FIRST_10_MINS: 18,
  DOUBLE_CHANCE: 19,
  CORRECT_SCORE: 20,
  FIRST_TEAM_TO_SCORE: 21,
  BTTS: 22, // Both Teams to Score
  HT_FT: 23,
  ODD_EVEN: 24,
  GOALS_HOME: 25,
  GOALS_AWAY: 26,
  WHICH_TEAM_TO_SCORE: 47,
  CLEAN_SHEET_HOME: 49,
  CLEAN_SHEET_AWAY: 50,
  TOTALS: 60, // Over/Under 0.5–4.5 ("Additional Totals")
  SECOND_HALF_TOTALS: 62,
  LAST_TEAM_TO_SCORE: 63,
  HOME_SCORES_BOTH_HALVES: 66,
  AWAY_SCORES_BOTH_HALVES: 67,
  BOTH_HALVES_OVER_15: 68,
  BOTH_HALVES_UNDER_15: 69,
  FIRST_HALF_CORRECT_SCORE: 70,
} as const;

export type BetTypeId = (typeof BET_TYPE)[keyof typeof BET_TYPE];

/** Every id above, in request order. */
export const ALL_BET_TYPE_IDS: readonly BetTypeId[] = Object.values(BET_TYPE);

/**
 * The markets the value rules in the notes actually need — 1X2, BTTS, the
 * Over/Under lines, correct score and multiscores. Costs 6 calls per tournament
 * instead of 23, so prefer this unless you genuinely want everything.
 */
export const CORE_BET_TYPE_IDS: readonly BetTypeId[] = [
  BET_TYPE.FULL_TIME,
  BET_TYPE.BTTS,
  BET_TYPE.TOTALS,
  BET_TYPE.CORRECT_SCORE,
  BET_TYPE.DOUBLE_CHANCE,
  BET_TYPE.HT_FT,
];

export const BET_TYPE_LABEL: Record<number, string> = {
  15: 'Full Time',
  16: 'Half Time',
  17: 'Handicap',
  18: 'First 10 mins',
  19: 'Double Chance',
  20: 'Correct Score',
  21: 'First Team to Score',
  22: 'Both Teams to Score',
  23: 'Half Time/Full Time',
  24: 'Odd/Even',
  25: 'Goals Home',
  26: 'Goals Away',
  47: 'Which Team To Score',
  49: 'Clean Sheet Home Team',
  50: 'Clean Sheet Away Team',
  60: 'Additional Totals',
  62: '2nd Half Totals',
  63: 'Last Team To Score',
  66: 'Home To Score In Both Halves',
  67: 'Away To Score In Both Halves',
  68: 'Both Halves Over 1.5',
  69: 'Both Halves Under 1.5',
  70: '1st Half - Correct Score',
};

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
  /**
   * The book's upstream id, e.g. 'sr:match:68932806' — a Sportradar match id.
   * Present on the live feed but absent from the captured traffic this type was
   * first written from. Worth carrying: if our own provider exposes the same
   * identifier, fixture matching becomes an exact join instead of name matching.
   */
  sourceId?: string;
  name: string; // "Home vs Away"
  startTime: string; // ISO
  categoryId: number;
  category: string;
  tournament: string;
  isOutright: boolean;
  betTypes: HbBetType[];
};

// ---- Odds helpers -----------------------------------------------------------

/** Convert a Hollywoodbets fractional `odds` value to true decimal odds. */
export function toDecimal(fractionalOdds: number): number {
  return fractionalOdds + 1;
}

export type Decimal1x2 = { home: number; draw: number; away: number } | null;

const CLOSED_MARKET_STATUSES = new Set([
  'suspended',
  'closed',
  'inactive',
  'deactivated',
  'settled',
]);

/** Unknown/empty statuses stay usable; only explicit closed states are blocked. */
export function isMarketOpenStatus(status: string | null | undefined): boolean {
  return !CLOSED_MARKET_STATUSES.has((status ?? '').trim().toLowerCase());
}

/** Pull decimal 1X2 odds from an event's Full Time (id 15) bet type. */
export function decimal1x2(event: HbEvent): Decimal1x2 {
  const ft = event.betTypes.find(
    (b) => b.id === BET_TYPE.FULL_TIME && isMarketOpenStatus(b.status),
  );
  if (!ft) return null;
  const byNumber = (n: number) =>
    ft.markets.find((m) => m.number === n && isMarketOpenStatus(m.status));
  const h = byNumber(1);
  const d = byNumber(2);
  const a = byNumber(3);
  if (!h || !d || !a) return null;
  return { home: toDecimal(h.odds), draw: toDecimal(d.odds), away: toDecimal(a.odds) };
}

// ---- Reading any market -----------------------------------------------------

/** One selection, with the fractional odds already converted to decimal. */
export type MarketOdd = {
  /** Selection index within the market (1X2: 1 home, 2 draw, 3 away). */
  number: number;
  name: string;
  decimal: number;
  fractional: number;
  ratio: string;
  status: string;
};

function toMarketOdd(m: HbMarket): MarketOdd {
  return {
    number: m.number,
    name: m.name,
    decimal: toDecimal(m.odds),
    fractional: m.odds,
    ratio: m.ratio,
    status: m.status,
  };
}

/**
 * Every selection for one bet type on an event, decimal-converted.
 * Empty when the book did not price that market for this fixture.
 *
 * A bet type id CAN REPEAT within one event, and this must gather all of them.
 * The per-event feed splits some markets across several groups distinguished
 * only by `eventBetTypeMapID` — "Additional Totals" (id 60) arrives as five
 * groups of two, one per goal line. Matching on the first group alone returns
 * the 0.5 line and silently drops the other eight selections. The tournament
 * feed returns the same market as a single group, so the two shapes differ and
 * only the filtering form is correct for both.
 */
export function marketOdds(event: HbEvent, betTypeId: number): MarketOdd[] {
  return event.betTypes
    .filter((b) => b.id === betTypeId)
    .flatMap((b) => b.markets)
    .map(toMarketOdd);
}

/** Which bet types this event carries, de-duplicated and in first-seen order. */
export function availableBetTypes(event: HbEvent): number[] {
  return [...new Set(event.betTypes.map((b) => b.id))];
}

/** One market as it should be displayed: split groups merged back together. */
export type MarketGroup = {
  betTypeId: number;
  name: string;
  selections: MarketOdd[];
};

/**
 * Every market on an event, one entry per bet type, with split groups merged.
 * Use this for display — it turns the five "Additional Totals" groups back into
 * a single market carrying all ten lines.
 */
export function marketGroups(event: HbEvent): MarketGroup[] {
  const out = new Map<number, MarketGroup>();
  for (const bt of event.betTypes) {
    const existing = out.get(bt.id);
    if (existing) {
      existing.selections.push(...bt.markets.map(toMarketOdd));
      continue;
    }
    out.set(bt.id, {
      betTypeId: bt.id,
      name: BET_TYPE_LABEL[bt.id] ?? bt.name,
      selections: bt.markets.map(toMarketOdd),
    });
  }
  return [...out.values()];
}

/** Both Teams to Score, as decimal odds. */
export function bttsDecimal(event: HbEvent): { yes: number; no: number } | null {
  const ms = marketOdds(event, BET_TYPE.BTTS).filter((m) => isMarketOpenStatus(m.status));
  const yes = ms.find((m) => m.name.toUpperCase() === 'YES');
  const no = ms.find((m) => m.name.toUpperCase() === 'NO');
  return yes && no ? { yes: yes.decimal, no: no.decimal } : null;
}

/**
 * Over/Under lines keyed by the line itself, e.g. `{ 2.5: { over, under } }`.
 * Selection names come through as "OVER 2.5" / "UNDER 2.5"; the numeric line is
 * parsed from the name rather than assumed from `number`, because the book
 * numbers overs 1–5 and unders 16–20 and that offset is not documented.
 */
export function totalsDecimal(
  event: HbEvent,
  betTypeId: number = BET_TYPE.TOTALS,
): Record<string, { over?: number; under?: number }> {
  const out: Record<string, { over?: number; under?: number }> = {};
  for (const m of marketOdds(event, betTypeId).filter((item) => isMarketOpenStatus(item.status))) {
    const parsed = /^(OVER|UNDER)\s+([\d.]+)$/i.exec(m.name.trim());
    if (!parsed) continue;
    const side = parsed[1].toUpperCase() === 'OVER' ? 'over' : 'under';
    const line = parsed[2];
    out[line] = { ...(out[line] ?? {}), [side]: m.decimal };
  }
  return out;
}

/** Correct-score selections as `{ "1:0": decimal }`. */
export function correctScoreDecimal(
  event: HbEvent,
  betTypeId: number = BET_TYPE.CORRECT_SCORE,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of marketOdds(event, betTypeId).filter((item) => isMarketOpenStatus(item.status))) {
    const key = m.name.trim();
    if (/^\d+:\d+$/.test(key)) out[key] = m.decimal;
  }
  return out;
}

// ---- Share A Bet (pure parts) -----------------------------------------------

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

/** The public URL that opens a booked betslip by its code. */
export function bookingUrl(code: number): string {
  return `https://www.hollywoodbets.net/betting/${code}/code`;
}
