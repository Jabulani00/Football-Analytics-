import { fetchBetwayEventMarkets, type BetwayEventMarkets } from '@/services/betwayMarkets';

export const BETWAY_SOCCER_URL = 'https://www.betway.co.za/sport/soccer';

export type BetwaySlipLeg = {
  eventId: string;
  marketId: string;
  outcomeId: string;
  group: string;
  fixture: string;
  marketName: string;
  selectionName: string;
  offeredOdds: number;
  kickoff: string;
};

export type BetwayValidatedLeg = BetwaySlipLeg & {
  currentOdds: number;
  priceChanged: boolean;
};

export type BetwaySlipValidation = {
  valid: BetwayValidatedLeg[];
  unavailable: { leg: BetwaySlipLeg; reason: string }[];
};

type MarketLoader = (eventId: string, group: string) => Promise<BetwayEventMarkets>;

/** Re-check exact event, market and outcome ids immediately before hand-off. */
export async function validateBetwaySlip(
  legs: BetwaySlipLeg[],
  loadMarkets: MarketLoader = fetchBetwayEventMarkets,
): Promise<BetwaySlipValidation> {
  const responses = new Map<string, Promise<BetwayEventMarkets>>();
  const load = (leg: BetwaySlipLeg) => {
    const key = `${leg.eventId}:${leg.group}`;
    const existing = responses.get(key);
    if (existing) return existing;
    const request = loadMarkets(leg.eventId, leg.group);
    responses.set(key, request);
    return request;
  };

  const checked = await Promise.all(legs.map(async (leg) => {
    try {
      const response = await load(leg);
      const market = response.markets.find((candidate) => candidate.market_id === leg.marketId);
      if (!market) return { leg, reason: 'market is no longer offered' } as const;
      if (!market.open || market.suspended) return { leg, reason: 'market is suspended' } as const;
      const outcome = market.selections.find((candidate) => candidate.outcome_id === leg.outcomeId);
      if (!outcome) return { leg, reason: 'selection is no longer offered' } as const;
      if (!outcome.available || outcome.odds == null) return { leg, reason: 'selection is suspended' } as const;
      return {
        ...leg,
        currentOdds: outcome.odds,
        priceChanged: Math.abs(outcome.odds - leg.offeredOdds) >= 0.005,
      } satisfies BetwayValidatedLeg;
    } catch (error) {
      return {
        leg,
        reason: error instanceof Error ? error.message : 'could not refresh this selection',
      } as const;
    }
  }));

  return {
    valid: checked.filter((item): item is BetwayValidatedLeg => 'currentOdds' in item),
    unavailable: checked.filter((item): item is { leg: BetwaySlipLeg; reason: string } => 'reason' in item),
  };
}

export function buildBetwayTransferSummary(legs: BetwayValidatedLeg[]): string {
  const combinedOdds = legs.reduce((total, leg) => total * leg.currentOdds, 1);
  return [
    'Scoreline → Betway verified selections',
    ...legs.map((leg, index) =>
      `${index + 1}. ${leg.fixture} | ${leg.marketName} — ${leg.selectionName} @ ${leg.currentOdds.toFixed(2)}` +
      `${leg.priceChanged ? ` (was ${leg.offeredOdds.toFixed(2)})` : ''}`,
    ),
    `Combined odds at verification: ${combinedOdds.toFixed(2)}`,
    'Open Betway and add these selections to a Multi Bet. Prices may still change before acceptance.',
    'No stake or bet has been submitted by Scoreline.',
  ].join('\n');
}
