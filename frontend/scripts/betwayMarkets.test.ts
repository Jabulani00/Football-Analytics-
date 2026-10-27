import assert from 'node:assert/strict';

import { betwayGroupLabel, fetchBetwayEventMarkets } from '../services/betwayMarkets';

async function main() {
  let requested = '';
  const result = await fetchBetwayEventMarkets('74994250', 'Main', (async (input) => {
    requested = String(input);
    return Response.json({
      marketGroupNames: ['Main', 'Goals', 'Team', 'Handicap', 'Build A Bet'],
      marketsInGroup: [{
        marketId: 'total', eventId: 74994250, displayName: 'Total Goals', marketTypeCName: 'Total',
        isActive: true, isSuspended: false, shouldDisplay: true, isSquashedParent: true,
      }, {
        marketId: 'total-2.5', displayName: 'Total (2.5)', isSquashedMarket: true,
      }],
      outcomes: [
        { outcomeId: 'over', marketId: 'total', displayName: 'Over ', sbv: ' (2.5)', index: 0, isTradingActive: true, shouldDisplay: true },
        { outcomeId: 'under', marketId: 'total', displayName: 'Under ', sbv: ' (2.5)', index: 1, isTradingActive: true, shouldDisplay: true },
      ],
      prices: [
        { outcomeId: 'over', priceDecimal: 1.8 },
        { outcomeId: 'under', priceDecimal: 2.0 },
      ],
    });
  }) as typeof fetch);

  assert.equal(requested, '/betway-markets?eventId=74994250&group=Main');
  assert.deepEqual(result.groups, ['Main', 'Goals', 'Team', 'Handicap', 'Build A Bet']);
  assert.equal(result.markets.length, 1, 'squashed child markets must not duplicate the parent');
  assert.deepEqual(result.markets[0].selections.map((selection) => selection.name), ['Over (2.5)', 'Under (2.5)']);
  assert.equal(result.markets[0].selections[0].odds, 1.8);
  assert.equal(result.outcomeCount, 2);
  assert.equal(betwayGroupLabel('Main'), 'Popular');
  assert.equal(betwayGroupLabel('Team'), 'Teams');
  assert.equal(betwayGroupLabel('Handicap'), 'Handicaps');

  let buildUrl = '';
  await fetchBetwayEventMarkets('74994250', 'Build A Bet', (async (input) => {
    buildUrl = String(input);
    return Response.json({ marketGroupNames: [], marketsInGroup: [], outcomes: [], prices: [] });
  }) as typeof fetch);
  assert.match(buildUrl, /buildABet=true/);

  console.log('Betway full-market frontend contract tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
