import assert from 'node:assert/strict';

import { GET } from '../app/betway-hunt-status+api';

async function main() {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const originalFetch = globalThis.fetch;
  const kickoff = Date.now() + 24 * 60 * 60 * 1000;
  globalThis.fetch = (async () => Response.json({
    events: [{
      eventId: 44,
      homeTeam: 'Home FC',
      awayTeam: 'Away FC',
      expectedStartEpoch: Math.floor(kickoff / 1_000),
      isActive: true,
      shouldDisplay: true,
      isLive: false,
      isFinished: false,
      isOutright: false,
      league: 'Test League',
      region: 'South Africa',
    }],
    markets: [{
      marketId: 'market-44', eventId: 44, marketTypeCName: 'win-draw-win',
      isActive: true, isSuspended: false, shouldDisplay: true,
    }, {
      marketId: 'totals-44', eventId: 44, marketTypeCName: 'Total', displayName: 'Total Goals',
      handicap: 2.5, isActive: true, isSuspended: false, shouldDisplay: true,
    }],
    outcomes: [
      { outcomeId: 'h', marketId: 'market-44', displayName: 'Home FC', index: 0, isTradingActive: true, shouldDisplay: true },
      { outcomeId: 'd', marketId: 'market-44', displayName: 'Draw', index: 1, isTradingActive: true, shouldDisplay: true },
      { outcomeId: 'a', marketId: 'market-44', displayName: 'Away FC', index: 2, isTradingActive: true, shouldDisplay: true },
      { outcomeId: 'over', marketId: 'totals-44', displayName: 'Over', sbv: '(2.5)', index: 0, isTradingActive: true, shouldDisplay: true },
      { outcomeId: 'under', marketId: 'totals-44', displayName: 'Under', sbv: '(2.5)', index: 1, isTradingActive: true, shouldDisplay: true },
    ],
    prices: [
      { outcomeId: 'h', priceDecimal: 2.1 },
      { outcomeId: 'd', priceDecimal: 3.2 },
      { outcomeId: 'a', priceDecimal: 3.4 },
      { outcomeId: 'over', priceDecimal: 1.8 },
      { outcomeId: 'under', priceDecimal: 2.0 },
    ],
    isFinalPage: true,
  })) as typeof fetch;

  try {
    const response = await GET();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.bookmaker, 'Betway');
    assert.equal(body.historyAvailable, false);
    assert.equal(body.currentEvents.length, 1);
    assert.deepEqual(
      [body.currentEvents[0].odds_home, body.currentEvents[0].odds_draw, body.currentEvents[0].odds_away],
      [2.1, 3.2, 3.4],
    );
    assert.equal(body.currentEvents[0].market_open, true);
    assert.equal(body.currentEvents[0].markets.length, 2);
    assert.equal(
      body.currentEvents[0].markets.find((market: { market_type: string }) => market.market_type === 'Total')?.selections[0].name,
      'Over (2.5)',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('Betway Hunt API route tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

