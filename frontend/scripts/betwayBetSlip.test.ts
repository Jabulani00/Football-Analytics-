import assert from 'node:assert/strict';

import {
  buildBetwayTransferSummary,
  validateBetwaySlip,
  type BetwaySlipLeg,
} from '../services/betwayBetSlip';

const leg: BetwaySlipLeg = {
  eventId: 'evt-1', marketId: 'market-1', outcomeId: 'outcome-1', group: 'Main',
  fixture: 'Alpha vs Beta', marketName: '1X2', selectionName: 'Alpha', offeredOdds: 2.1,
  kickoff: '2026-10-30T18:00:00Z',
};

async function main() {
  let loads = 0;
  const result = await validateBetwaySlip([leg, { ...leg, outcomeId: 'outcome-2', selectionName: 'Draw' }], async () => {
    loads += 1;
    return {
      eventId: 'evt-1', selectedGroup: 'Main', groups: ['Main'], outcomeCount: 2,
      markets: [{
        market_id: 'market-1', market_type: 'win-draw-win', name: 'Match Result', line: null,
        open: true, suspended: false,
        selections: [
          { outcome_id: 'outcome-1', name: 'Alpha', odds: 2.2, available: true },
          { outcome_id: 'outcome-2', name: 'Draw', odds: null, available: false },
        ],
      }],
    };
  });

  assert.equal(loads, 1, 'legs from one event/group share one refresh request');
  assert.equal(result.valid.length, 1);
  assert.equal(result.valid[0].currentOdds, 2.2);
  assert.equal(result.valid[0].priceChanged, true);
  assert.equal(result.unavailable.length, 1);
  assert.match(result.unavailable[0].reason, /suspended/);
  const summary = buildBetwayTransferSummary(result.valid);
  assert.match(summary, /Alpha vs Beta/);
  assert.match(summary, /@ 2\.20 \(was 2\.10\)/);
  assert.match(summary, /No stake or bet has been submitted/);
  console.log('Betway bet-slip validation tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
