import type { BetwayMarket, BetwayMarketSelection } from '@/services/betwayHunt';

type Row = Record<string, unknown>;

export type BetwayEventMarkets = {
  eventId: string;
  selectedGroup: string;
  groups: string[];
  markets: BetwayMarket[];
  outcomeCount: number;
};

export class BetwayMarketsError extends Error {
  constructor(message: string, readonly status: number, readonly body: string) {
    super(message);
    this.name = 'BetwayMarketsError';
  }
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}

function parseMarket(
  market: Row,
  outcomes: Row[],
  priceByOutcome: Map<string, unknown>,
): BetwayMarket | null {
  const marketId = String(market.marketId ?? '').trim();
  if (!marketId || market.isSquashedMarket === true) return null;

  const seen = new Set<string>();
  const selections = outcomes
    .filter((outcome) => String(outcome.marketId) === marketId)
    .sort((left, right) => Number(left.index ?? 0) - Number(right.index ?? 0))
    .flatMap((outcome): BetwayMarketSelection[] => {
      const outcomeId = String(outcome.outcomeId ?? '').trim();
      if (!outcomeId || seen.has(outcomeId)) return [];
      seen.add(outcomeId);
      const baseName = String(outcome.displayName ?? outcome.name ?? '').trim();
      const qualifier = String(outcome.sbv ?? '').trim();
      const name = `${baseName}${qualifier ? ` ${qualifier}` : ''}`.replace(/\s+/g, ' ').trim();
      if (!name) return [];
      const price = numberOrNull(priceByOutcome.get(outcomeId));
      const available = outcome.isTradingActive === true && outcome.shouldDisplay === true && price != null;
      return [{ outcome_id: outcomeId, name, odds: available ? price : null, available }];
    });
  if (selections.length === 0) return null;

  const suspended = market.isSuspended === true || market.isActive !== true || market.shouldDisplay !== true;
  const lineValue = Number(market.handicap);
  return {
    market_id: marketId,
    market_type: String(market.marketTypeCName ?? market.name ?? '').trim(),
    name: String(market.displayName ?? market.name ?? market.marketTypeCName ?? 'Market').trim(),
    line: Number.isFinite(lineValue) && lineValue !== 0 ? lineValue : null,
    open: !suspended && selections.some((selection) => selection.available),
    suspended,
    selections,
  };
}

export function parseBetwayEventMarkets(
  eventId: string,
  selectedGroup: string,
  body: unknown,
): BetwayEventMarkets {
  if (!body || typeof body !== 'object') {
    throw new BetwayMarketsError('Betway returned an invalid full-market response.', 502, '');
  }
  const payload = body as Row;
  const groupRows = payload.marketGroupNames;
  const marketRows = payload.marketsInGroup;
  const outcomeRows = payload.outcomes;
  const priceRows = payload.prices;
  if (!Array.isArray(groupRows) || !Array.isArray(marketRows) || !Array.isArray(outcomeRows) || !Array.isArray(priceRows)) {
    throw new BetwayMarketsError('Betway returned an incomplete full-market response.', 502, '');
  }

  const groups = groupRows
    .map((group) => String(group).trim())
    .filter((group, index, all) => group && all.indexOf(group) === index);
  const prices = new Map((priceRows as Row[]).map((price) => [String(price.outcomeId), price.priceDecimal]));
  const markets = (marketRows as Row[])
    .map((market) => parseMarket(market, outcomeRows as Row[], prices))
    .filter((market): market is BetwayMarket => market != null)
    .sort((left, right) => left.name.localeCompare(right.name));

  return { eventId, selectedGroup, groups, markets, outcomeCount: outcomeRows.length };
}

const cache = new Map<string, { expiresAt: number; value: Promise<BetwayEventMarkets> }>();

export async function fetchBetwayEventMarkets(
  eventId: string,
  group = 'Main',
  fetchImpl: typeof fetch = fetch,
): Promise<BetwayEventMarkets> {
  const cacheKey = `${eventId}:${group}`;
  const cached = cache.get(cacheKey);
  if (fetchImpl === fetch && cached && cached.expiresAt > Date.now()) return cached.value;

  const params = new URLSearchParams({ eventId, group });
  if (group === 'Build A Bet') params.set('buildABet', 'true');
  const promise = fetchImpl(`/betway-markets?${params}`, { headers: { Accept: 'application/json' } })
    .then(async (response) => {
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new BetwayMarketsError(`Betway full markets returned HTTP ${response.status}.`, response.status, body);
      }
      return parseBetwayEventMarkets(eventId, group, await response.json());
    });

  if (fetchImpl === fetch) {
    cache.set(cacheKey, { expiresAt: Date.now() + 30_000, value: promise });
    promise.catch(() => cache.delete(cacheKey));
  }
  return promise;
}

export function betwayGroupLabel(group: string): string {
  if (group === 'Main') return 'Popular';
  if (group === 'Team') return 'Teams';
  if (group === 'Handicap') return 'Handicaps';
  return group;
}
