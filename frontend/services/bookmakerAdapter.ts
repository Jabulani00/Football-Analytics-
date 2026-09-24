import type {
  OddAlertsBookmaker,
  RawValueBet,
  RawValueOddsLine,
} from '@/services/oddAlerts';
import type { MarketRow } from '@/services/hollywoodFusion';
import { normalizeTeam } from '@/services/hollywoodMatch';

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
