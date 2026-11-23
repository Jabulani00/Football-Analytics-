import type {
  OddAlertsBookmaker,
  RawValueBet,
  RawValueOddsLine,
} from '@/services/oddAlerts';
import type { MarketRow } from '@/services/hollywoodFusion';
import { normalizeTeam } from '@/services/hollywoodMatch';
import type { PinnacleFixtureOdds } from '@/services/pinnacleOdds';

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
export function normalizeOddAlertsValueBet(raw: RawValueBet): NormalizedBookmakerOffer[] {
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
    }];
  });
}

export type CrossBookComparison = {
  id: string;
  eventId: number;
  fixture: string;
  market: string;
  selection: string;
  hollywoodOdds: number;
  bookmaker: string;
  bookmakerOdds: number;
  bestBookmaker: string;
  bestOdds: number;
  difference: number;
};

function fixtureKey(home: string | null, away: string | null, fixture: string): string | null {
  if (home && away) return `${normalizeTeam(home)}|${normalizeTeam(away)}`;
  const parts = fixture.split(/\s+vs?\.?\s+/i);
  return parts.length === 2 ? `${normalizeTeam(parts[0])}|${normalizeTeam(parts[1])}` : null;
}

function selectionKey(market: string, selection: string): string {
  const text = `${market} ${selection}`.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (/\b(home win|home|ft result 1)\b/.test(text)) return '1x2:home';
  if (/\b(away win|away|ft result 2)\b/.test(text)) return '1x2:away';
  if (/\b(draw|ft result x)\b/.test(text)) return '1x2:draw';
  if (/\b(btts|both teams to score)\b/.test(text) && /\b(yes)\b/.test(text)) return 'btts:yes';
  if (/\b(btts|both teams to score)\b/.test(text) && /\b(no)\b/.test(text)) return 'btts:no';
  const total = /\b(over|under)\s*(\d+(?:\.\d+)?)\b/.exec(text);
  if (total) return `totals:${total[1]}:${total[0].startsWith('over') ? 'over' : 'under'}`;
  return text.replace(/[^a-z0-9.]+/g, ':');
}

export const PRICE_MATCH_KICKOFF_TOLERANCE_SECONDS = 5 * 60;

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

function periodKey(text: string): string {
  if (/\b(first half|1st half|half time|ht)\b/.test(text)) return 'h1';
  if (/\b(second half|2nd half)\b/.test(text)) return 'h2';
  return 'ft';
}

function marketSelectionKey(market: string, selection: string): string | null {
  const normalizedMarket = normalizeMarketText(market);
  const normalizedSelection = normalizeMarketText(selection);
  if (!normalizedMarket || !normalizedSelection || /unknown/.test(normalizedMarket + normalizedSelection)) {
    return null;
  }

  const text = `${normalizedMarket} ${normalizedSelection}`;
  const period = periodKey(text);
  const selectionWord = normalizedSelection;

  const total = /\b(over|under)\s*(\d+(?:\.\d+)?)\b/.exec(text);
  if (total) return `totals:${period}:${total[2]}:${total[1]}`;
  const totalSide = /^(over|under)(?:\s|$)/.exec(selectionWord);
  const marketLine = /\b(?:total goals?|totals?|over under)\s*(\d+(?:\.\d+)?)\b/.exec(normalizedMarket);
  if (totalSide && marketLine) {
    return `totals:${period}:${marketLine[1]}:${totalSide[1]}`;
  }

  if (/\b(btts|both teams to score)\b/.test(text)) {
    if (/\b(yes|y)\b/.test(selectionWord)) return `btts:${period}:yes`;
    if (/\b(no|n)\b/.test(selectionWord)) return `btts:${period}:no`;
    return null;
  }

  const isResultMarket =
    /\b(full time|ft result|match result|1x2|home win|away win|half time|first half|1st half|second half|2nd half)\b/.test(normalizedMarket)
    || /^(home|away|draw) win$/.test(normalizedMarket);
  if (isResultMarket) {
    if (/^(home|home win|1)$/.test(selectionWord)) return `result:${period}:home`;
    if (/^(away|away win|2)$/.test(selectionWord)) return `result:${period}:away`;
    if (/^(draw|x)$/.test(selectionWord)) return `result:${period}:draw`;
    return null;
  }

  return `other:${normalizedMarket}:${normalizedSelection}`;
}

function kickoffSeconds(value: string | number | null): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : null;
}

/** Join Hollywood and OddAlerts offers only when fixture and market both match. */
export function compareHollywoodWithProvider(
  hollywood: MarketRow[],
  provider: NormalizedBookmakerOffer[],
): CrossBookComparison[] {
  const byKey = new Map<string, NormalizedBookmakerOffer[]>();
  for (const offer of provider) {
    const fixture = fixtureKey(offer.homeName, offer.awayName, offer.fixture);
    if (!fixture) continue;
    const key = `${fixture}|${selectionKey(offer.market, offer.selection)}`;
    const list = byKey.get(key) ?? [];
    list.push(offer);
    byKey.set(key, list);
  }

  const results: CrossBookComparison[] = [];
  for (const row of hollywood) {
    const fixture = fixtureKey(null, null, row.fixture);
    if (!fixture) continue;
    const key = `${fixture}|${selectionKey(row.marketName, row.selection)}`;
    const offers = byKey.get(key);
    if (!offers?.length) continue;
    const nearest = offers.filter(
      (offer) =>
        offer.kickoffUnix == null ||
        Math.abs(offer.kickoffUnix - Math.floor(new Date(row.kickoff).getTime() / 1000)) <= 3 * 3600,
    );
    if (nearest.length === 0) continue;
    const best = nearest.reduce((current, item) => item.decimal > current.decimal ? item : current);
    const bestOdds = Math.max(row.decimal, best.decimal);
    results.push({
      id: `${row.eventId}-${row.betTypeId}-${row.marketNumber}-${best.bookmakerSlug}`,
      eventId: row.eventId,
      fixture: row.fixture,
      market: row.marketName,
      selection: row.selection,
      hollywoodOdds: row.decimal,
      bookmaker: best.bookmaker,
      bookmakerOdds: best.decimal,
      bestBookmaker: best.decimal > row.decimal ? best.bookmaker : 'Hollywoodbets',
      bestOdds,
      difference: Math.abs(best.decimal - row.decimal),
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
    Map<string, { fixture: PinnacleFixtureOdds; odds: number }>
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
        if (!eventOffers.has(key)) eventOffers.set(key, { fixture, odds });
      }
    }
  }

  const matches: PinnacleSelectionMatch[] = [];
  for (const row of hollywood) {
    const key = marketSelectionKey(row.marketName, row.selection);
    const kickoff = kickoffSeconds(row.kickoff);
    if (!key || kickoff == null) continue;

    const candidate = byEvent.get(row.eventId)?.get(key);
    if (!candidate) continue;
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
