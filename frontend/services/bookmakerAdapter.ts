import type {
  OddAlertsBookmaker,
  RawValueBet,
  RawValueOddsLine,
} from '@/services/oddAlerts';
import type { MarketRow } from '@/services/hollywoodFusion';
import { normalizeTeam } from '@/services/hollywoodMatch';
import type { PinnacleFixtureOdds } from '@/services/pinnacleOdds';
import { supportedSelection } from '@/services/bookmakerValue';

export type BookmakerStatus = 'live' | 'available_via_provider' | 'planned';

export type BookmakerCatalogItem = {
  id: string;
  name: string;
  priority: number | null;
  status: BookmakerStatus;
  source: 'hollywood' | 'oddalerts' | null;
  maxPayout: string | null;
  limitingPolicy: string | null;
};

/** Priority list transcribed from the PDF; manager fields remain explicit TODOs. */
export const PRIORITY_BOOKMAKERS: BookmakerCatalogItem[] = [
  ['hollywoodbets', 'Hollywoodbets', 1, 'live', 'hollywood'],
  ['betway', 'Betway', 2, 'planned', null],
  ['bet-co-za', 'Bet.co.za', 3, 'planned', null],
  ['supabets', 'Supabets', 4, 'planned', null],
  ['world-sports-betting', 'World Sports Betting', 5, 'planned', null],
  ['sunbet', 'Sunbet', 6, 'planned', null],
  ['betxchange', 'BetXchange', 7, 'planned', null],
  ['sportingbets', 'Sportingbets', 8, 'planned', null],
  ['gbets', 'Gbets', 9, 'planned', null],
  ['playabets', 'Playabets', 10, 'planned', null],
  ['interbet', 'Interbet (Soccer 13)', 11, 'planned', null],
].map(([id, name, priority, status, source]) => ({
  id: id as string,
  name: name as string,
  priority: priority as number,
  status: status as BookmakerStatus,
  source: source as BookmakerCatalogItem['source'],
  maxPayout: null,
  limitingPolicy: null,
}));

export type NormalizedBookmakerOffer = {
  providerFixtureId: number;
  fixture: string;
  homeName: string | null;
  awayName: string | null;
  kickoffUnix: number | null;
  market: string;
  selection: string;
  bookmaker: string;
  bookmakerSlug: string;
  decimal: number;
  opening: number | null;
  peak: number | null;
  providerValuePct: number | null;
  /** Time this client received the provider snapshot; not the bookmaker quote time. */
  capturedAt: string | null;
};

function finiteNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const number = typeof value === 'string' ? Number(value) : value;
    if (typeof number === 'number' && Number.isFinite(number)) return number;
  }
  return null;
}

function bookmaker(line: RawValueOddsLine): { name: string; slug: string } | null {
  if (typeof line.bookmaker === 'object' && line.bookmaker) {
    return { name: line.bookmaker.name, slug: line.bookmaker.slug };
  }
  const name = line.bookmaker_name ?? (typeof line.bookmaker === 'string' ? line.bookmaker : null);
  if (!name) return null;
  return {
    name,
    slug: line.bookmaker_slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  };
}

/** Normalize the provider's flexible value payload into one row per book price. */
export function normalizeOddAlertsValueBet(
  raw: RawValueBet,
  capturedAt: string | null = null,
): NormalizedBookmakerOffer[] {
  const fixture =
    raw.home_name && raw.away_name
      ? `${raw.home_name} vs ${raw.away_name}`
      : String(raw.fixture ?? raw.name ?? `Fixture ${raw.id}`);
  const kickoffUnix = finiteNumber(raw.unix);
  const market = String(raw.market ?? 'Unknown market');
  const selection = String(raw.selection ?? raw.outcome ?? raw.pick ?? 'Unknown selection');

  return (raw.odds ?? []).flatMap((line) => {
    const source = bookmaker(line);
    const decimal = finiteNumber(line.latest, line.latest_odds, line.odds);
    if (!source || decimal == null || decimal < 1) return [];
    return [{
      providerFixtureId: raw.id,
      fixture,
      homeName: raw.home_name ?? null,
      awayName: raw.away_name ?? null,
      kickoffUnix,
      market,
      selection,
      bookmaker: source.name,
      bookmakerSlug: source.slug,
      decimal,
      opening: finiteNumber(line.opening),
      peak: finiteNumber(line.peak),
      providerValuePct: finiteNumber(line.value),
      capturedAt,
    }];
  });
}

export type CrossBookPrice = {
  bookmaker: string;
  bookmakerSlug: string;
  decimal: number;
  capturedAt: string | null;
};

export type CrossBookComparison = {
  id: string;
  eventId: number;
  fixture: string;
  kickoff: string;
  market: string;
  selection: string;
  hollywoodOdds: number;
  hollywoodCapturedAt: string | null;
  providerPrices: CrossBookPrice[];
  bestBookmaker: string;
  bestOdds: number;
  difference: number;
};

export const PRICE_MATCH_KICKOFF_TOLERANCE_SECONDS = 5 * 60;

function fixtureKey(home: string | null, away: string | null, fixture: string): string | null {
  const teams = home && away
    ? [home, away]
    : fixture.split(/\s+vs?\.?\s+/i);
  if (teams.length !== 2) return null;
  const [normalizedHome, normalizedAway] = teams.map(normalizeTeam);
  return normalizedHome && normalizedAway ? `${normalizedHome}|${normalizedAway}` : null;
}

function normalizeMarketText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function marketSelectionKey(market: string, selection: string): string | null {
  const normalizedMarket = normalizeMarketText(market);
  const normalizedSelection = normalizeMarketText(selection);
  if (!normalizedMarket || !normalizedSelection || /unknown/.test(normalizedMarket + normalizedSelection)) {
    return null;
  }

  const supported = supportedSelection(market, selection);
  if (supported) return supported.key;
  if (/\b(result|1x2|btts|both teams to score|goals?|totals?|over|under|handicap|asian)\b/.test(
    `${normalizedMarket} ${normalizedSelection}`,
  )) return null;

  return `other:${normalizedMarket}:${normalizedSelection}`;
}

function kickoffSeconds(value: string | number | null): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : null;
}

export type CrossBookMatchDiagnostics = {
  providerOffers: number;
  usableProviderOffers: number;
  comparableHollywoodSelections: number;
  fixtureMatchedSelections: number;
  kickoffMatchedSelections: number;
  exactMarketSelectionMatches: number;
};

/** Count how far Hollywood selections progress through the strict comparison join. */
export function diagnoseHollywoodWithProvider(
  hollywood: readonly MarketRow[],
  provider: readonly NormalizedBookmakerOffer[],
): CrossBookMatchDiagnostics {
  const byFixture = new Map<string, { market: string; kickoff: number }[]>();
  let usableProviderOffers = 0;

  for (const offer of provider) {
    if (offer.bookmakerSlug === 'hollywoodbets' || offer.bookmakerSlug === 'hollywood') continue;
    const fixture = fixtureKey(offer.homeName, offer.awayName, offer.fixture);
    const market = marketSelectionKey(offer.market, offer.selection);
    const kickoff = kickoffSeconds(offer.kickoffUnix);
    if (!fixture || !market || kickoff == null) continue;

    usableProviderOffers += 1;
    const candidates = byFixture.get(fixture) ?? [];
    candidates.push({ market, kickoff });
    byFixture.set(fixture, candidates);
  }

  let comparableHollywoodSelections = 0;
  let fixtureMatchedSelections = 0;
  let kickoffMatchedSelections = 0;
  let exactMarketSelectionMatches = 0;

  for (const row of hollywood) {
    const fixture = fixtureKey(null, null, row.fixture);
    const market = marketSelectionKey(row.marketName, row.selection);
    const kickoff = kickoffSeconds(row.kickoff);
    if (!fixture || !market || kickoff == null) continue;
    comparableHollywoodSelections += 1;

    const fixtureCandidates = byFixture.get(fixture);
    if (!fixtureCandidates?.length) continue;
    fixtureMatchedSelections += 1;

    const kickoffCandidates = fixtureCandidates.filter((candidate) =>
      Math.abs(candidate.kickoff - kickoff) <= PRICE_MATCH_KICKOFF_TOLERANCE_SECONDS,
    );
    if (!kickoffCandidates.length) continue;
    kickoffMatchedSelections += 1;
    if (kickoffCandidates.some((candidate) => candidate.market === market)) {
      exactMarketSelectionMatches += 1;
    }
  }

  return {
    providerOffers: provider.length,
    usableProviderOffers,
    comparableHollywoodSelections,
    fixtureMatchedSelections,
    kickoffMatchedSelections,
    exactMarketSelectionMatches,
  };
}

/** Join prices only for the same fixture, kickoff, market, period, line, and selection. */
export function compareHollywoodWithProvider(
  hollywood: MarketRow[],
  provider: NormalizedBookmakerOffer[],
  hollywoodCapturedAt: string | null = null,
): CrossBookComparison[] {
  const byKey = new Map<string, NormalizedBookmakerOffer[]>();
  for (const offer of provider) {
    if (offer.bookmakerSlug === 'hollywoodbets' || offer.bookmakerSlug === 'hollywood') continue;
    const fixture = fixtureKey(offer.homeName, offer.awayName, offer.fixture);
    const market = marketSelectionKey(offer.market, offer.selection);
    if (!fixture || !market || kickoffSeconds(offer.kickoffUnix) == null) continue;
    const key = `${fixture}|${market}`;
    const list = byKey.get(key) ?? [];
    list.push(offer);
    byKey.set(key, list);
  }

  const results: CrossBookComparison[] = [];
  for (const row of hollywood) {
    const fixture = fixtureKey(null, null, row.fixture);
    const market = marketSelectionKey(row.marketName, row.selection);
    const kickoff = kickoffSeconds(row.kickoff);
    if (!fixture || !market || kickoff == null) continue;
    const key = `${fixture}|${market}`;
    const offers = byKey.get(key);
    if (!offers?.length) continue;
    const matchingOffers = offers.filter((offer) => {
      const providerKickoff = kickoffSeconds(offer.kickoffUnix);
      return providerKickoff != null
        && Math.abs(providerKickoff - kickoff) <= PRICE_MATCH_KICKOFF_TOLERANCE_SECONDS;
    });
    const byBookmaker = new Map<string, NormalizedBookmakerOffer>();
    for (const offer of matchingOffers) {
      const previous = byBookmaker.get(offer.bookmakerSlug);
      if (!previous || (offer.capturedAt ?? '') > (previous.capturedAt ?? '')) {
        byBookmaker.set(offer.bookmakerSlug, offer);
      }
    }
    const providerPrices: CrossBookPrice[] = [...byBookmaker.values()]
      .map((offer) => ({
        bookmaker: offer.bookmaker,
        bookmakerSlug: offer.bookmakerSlug,
        decimal: offer.decimal,
        capturedAt: offer.capturedAt,
      }))
      .sort((a, b) => a.bookmaker.localeCompare(b.bookmaker));
    if (providerPrices.length === 0) continue;

    const allPrices = [
      { bookmaker: 'Hollywoodbets', decimal: row.decimal },
      ...providerPrices,
    ];
    const best = allPrices.reduce((current, item) =>
      item.decimal > current.decimal ? item : current,
    );
    const prices = allPrices.map((item) => item.decimal);
    results.push({
      id: `${row.eventId}-${row.betTypeId}-${row.marketNumber}`,
      eventId: row.eventId,
      fixture: row.fixture,
      kickoff: row.kickoff,
      market: row.marketName,
      selection: row.selection,
      hollywoodOdds: row.decimal,
      hollywoodCapturedAt,
      providerPrices,
      bestBookmaker: best.bookmaker,
      bestOdds: best.decimal,
      difference: Math.max(...prices) - Math.min(...prices),
    });
  }
  return results.sort((a, b) => b.difference - a.difference);
}

export type PinnacleSelectionMatch = {
  id: string;
  eventId: number;
  fixture: string;
  market: string;
  selection: string;
  hollywoodOdds: number;
  pinnacleOdds: number;
  oddAlertsFixtureId: number;
  kickoffDeltaSeconds: number;
  providerUpdatedAt: string | null;
  capturedAt: string | null;
};

/** Match only current Pinnacle prices to the same Hollywood event and selection. */
export function matchHollywoodWithPinnacle(
  hollywood: readonly MarketRow[],
  pinnacle: readonly PinnacleFixtureOdds[],
  capturedAt: string | null = null,
): PinnacleSelectionMatch[] {
  const byEvent = new Map<
    number,
    Map<string, { fixture: PinnacleFixtureOdds; odds: number }[]>
  >();

  for (const fixture of pinnacle) {
    if (
      fixture.oddAlertsKickoffUnix == null ||
      !Number.isFinite(fixture.oddAlertsKickoffUnix)
    ) continue;

    let eventOffers = byEvent.get(fixture.eventId);
    if (!eventOffers) {
      eventOffers = new Map();
      byEvent.set(fixture.eventId, eventOffers);
    }

    for (const market of fixture.markets) {
      for (const selection of market.selections) {
        const key = marketSelectionKey(market.marketName, selection.label);
        const odds = selection.current;
        if (!key || odds == null || !Number.isFinite(odds) || odds < 1) continue;
        const candidates = eventOffers.get(key) ?? [];
        candidates.push({ fixture, odds });
        eventOffers.set(key, candidates);
      }
    }
  }

  const matches: PinnacleSelectionMatch[] = [];
  for (const row of hollywood) {
    const key = marketSelectionKey(row.marketName, row.selection);
    const kickoff = kickoffSeconds(row.kickoff);
    if (!key || kickoff == null) continue;

    const candidates = byEvent.get(row.eventId)?.get(key);
    if (!candidates || candidates.length !== 1) continue;
    const candidate = candidates[0];
    const providerKickoff = candidate.fixture.oddAlertsKickoffUnix;
    if (providerKickoff == null || !Number.isFinite(providerKickoff)) continue;
    const kickoffDeltaSeconds = Math.abs(providerKickoff - kickoff);
    if (kickoffDeltaSeconds > PRICE_MATCH_KICKOFF_TOLERANCE_SECONDS) continue;

    matches.push({
      id: `${row.eventId}-${row.betTypeId}-${row.marketNumber}-${candidate.fixture.oddAlertsFixtureId}`,
      eventId: row.eventId,
      fixture: row.fixture,
      market: row.marketName,
      selection: row.selection,
      hollywoodOdds: row.decimal,
      pinnacleOdds: candidate.odds,
      oddAlertsFixtureId: candidate.fixture.oddAlertsFixtureId,
      kickoffDeltaSeconds,
      providerUpdatedAt: candidate.fixture.latestPriceAt,
      capturedAt,
    });
  }

  return matches.sort(
    (left, right) =>
      left.fixture.localeCompare(right.fixture) ||
      left.market.localeCompare(right.market) ||
      left.selection.localeCompare(right.selection),
  );
}

export function mergeProviderBookmakers(items: OddAlertsBookmaker[]): BookmakerCatalogItem[] {
  const merged = new Map(PRIORITY_BOOKMAKERS.map((item) => [item.id, item]));
  for (const item of items) {
    const id = item.slug || item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const existing = merged.get(id);
    merged.set(id, existing
      ? { ...existing, status: existing.status === 'live' ? 'live' : 'available_via_provider', source: existing.source ?? 'oddalerts' }
      : {
          id,
          name: item.name,
          priority: null,
          status: 'available_via_provider',
          source: 'oddalerts',
          maxPayout: null,
          limitingPolicy: null,
        });
  }
  return [...merged.values()].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999) || a.name.localeCompare(b.name));
}
