import {
  assessValueSelection,
  classifyOppositionDelta,
} from '../services/hollywoodValueRules';
import { CORE_VALUE_STRATEGY, evaluateStrategy } from '../services/strategyEngine';
import {
  compareHollywoodWithProvider,
  matchHollywoodWithPinnacle,
  mergeProviderBookmakers,
  normalizeOddAlertsValueBet,
} from '../services/bookmakerAdapter';
import type { MarketRow } from '../services/hollywoodFusion';
import { buildBetSlipSummary } from '../services/betSlipShare';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`);
  }
}

console.log('\nPDF odds/value rules');
check('0.29 is below the 0.30 boundary', classifyOppositionDelta(0.29) === 'below');
check('0.30 is the boundary', classifyOppositionDelta(0.3) === 'equal');
check('0.31 is above the boundary', classifyOppositionDelta(0.31) === 'above');

const value = assessValueSelection({
  modelProb: 0.65,
  bookFairProb: 0.55,
  decimalOdds: 2,
  modelFavours: true,
  bookFavours: false,
  marketOdds: [1.5, 3],
});
check('assessment is produced for valid inputs', value != null);
check('0.65 produces opposition delta 0.30', value?.deltaBand === 'equal');
check('0.65 is inside the inclusive watch range', value?.inWatchRange === true);
check('machine/book conflict is retained', value?.agreement === 'imibono_ihlukene');
check('topdog/underdog ratio 0.5 triggers score investigation', value?.investigateScores === true);
check('positive probability gap and EV pass value', value?.hasValue === true);
check(
  'invalid probability is rejected',
  assessValueSelection({
    modelProb: 1.1,
    bookFairProb: 0.5,
    decimalOdds: 2,
    modelFavours: true,
    bookFavours: true,
  }) == null,
);

console.log('\nStrategy qualification');
const base = {
  id: '1',
  fixture: 'Alpha vs Bravo',
  kickoff: '2026-09-12T14:00:00Z',
  market: 'Full Time',
  selection: 'Home',
  odds: 2,
};
const blocked = evaluateStrategy(CORE_VALUE_STRATEGY, {
  ...base,
  evidence: { value: { status: 'pass' as const, note: 'Value passed' } },
});
check('missing real inputs block a call', blocked.status === 'blocked');
check('blocked call reports all six missing layers', blocked.blockers.length === 6);

const evidence = Object.fromEntries(
  CORE_VALUE_STRATEGY.required.map((key) => [key, { status: 'pass' as const, note: `${key} passed` }]),
);
const qualified = evaluateStrategy(CORE_VALUE_STRATEGY, { ...base, evidence });
check('all real layers qualify a call', qualified.status === 'qualified');
check('all real layers produce 100% compliance', qualified.compliance === 100);

const oneFailure = evaluateStrategy(CORE_VALUE_STRATEGY, {
  ...base,
  evidence: {
    ...evidence,
    h2h: { status: 'fail' as const, note: 'H2H did not support the call' },
  },
});
check('minimum compliance is honoured when all inputs are present', oneFailure.status === 'qualified');
check('one failed layer produces 86% compliance', oneFailure.compliance === 86);

const strict = evaluateStrategy(
  { ...CORE_VALUE_STRATEGY, id: 'strict', minimumCompliance: 100 },
  {
    ...base,
    evidence: {
      ...evidence,
      h2h: { status: 'fail' as const, note: 'H2H did not support the call' },
    },
  },
);
check('a stricter threshold rejects the same evidence', strict.status === 'rejected');

console.log('\nExtra bookmaker adapter');
const offers = normalizeOddAlertsValueBet({
  id: 99,
  home_name: 'Alpha FC',
  away_name: 'Bravo',
  unix: Math.floor(new Date(base.kickoff).getTime() / 1000),
  market: 'home_win',
  selection: 'Home Win',
  odds: [
    { bookmaker_name: 'Bet365', bookmaker_slug: 'bet365', latest: 2.2, opening: 2.0, value: 8 },
  ],
});
check('OddAlerts value line normalizes', offers.length === 1 && offers[0].decimal === 2.2);
const books = mergeProviderBookmakers([{ id: 1, name: 'Betway', slug: 'betway' }]);
check('priority book is promoted when provider exposes it', books.find((item) => item.id === 'betway')?.status === 'available_via_provider');

const hollywoodRow = {
  eventId: 1,
  fixture: 'Alpha vs Bravo',
  kickoff: base.kickoff,
  betTypeId: 15,
  marketName: 'Full Time',
  selection: 'Home',
  marketNumber: 1,
  decimal: 2,
  fair: 0.5,
  modelProb: 0.6,
  hasModel: true,
  edgePct: 20,
  agreement: 'umbono_munye',
  value,
  hbLeg: null,
} satisfies MarketRow;
const comparisons = compareHollywoodWithProvider([hollywoodRow], offers);
check('same fixture and market compare across books', comparisons.length === 1);
check('comparison selects the better price', comparisons[0]?.bestBookmaker === 'Bet365');

const pinnacleKickoff = Math.floor(new Date(base.kickoff).getTime() / 1000);
const pinnacleFixture = {
  eventId: hollywoodRow.eventId,
  fixture: hollywoodRow.fixture,
  kickoff: hollywoodRow.kickoff,
  oddAlertsFixtureId: 99,
  oddAlertsKickoffUnix: pinnacleKickoff + 60,
  latestPriceAt: '2026-11-21T09:05:00.000Z',
  historyRowCount: 0,
  markets: [
    {
      marketId: 6,
      marketKey: 'ft_result',
      marketName: 'Full Time Result',
      selections: [
        { key: 'home|', label: 'home', current: 2.3, opening: null, closing: null, peak: null },
      ],
    },
    {
      marketId: 21,
      marketKey: 'total_goals_25',
      marketName: 'Total Goals 2.5',
      selections: [
        { key: 'over|', label: 'over', current: 1.9, opening: null, closing: null, peak: null },
      ],
    },
  ],
};
const pinnacleMatches = matchHollywoodWithPinnacle(
  [hollywoodRow],
  [pinnacleFixture],
  '2026-11-21T09:05:30.000Z',
);
check('Pinnacle exact selection match requires the mapped fixture and a kickoff within five minutes',
  pinnacleMatches.length === 1
    && pinnacleMatches[0]?.pinnacleOdds === 2.3
    && pinnacleMatches[0]?.oddAlertsFixtureId === 99
    && pinnacleMatches[0]?.kickoffDeltaSeconds === 60);
check('Pinnacle match retains provider and app capture timestamps',
  pinnacleMatches[0]?.providerUpdatedAt === '2026-11-21T09:05:00.000Z'
    && pinnacleMatches[0]?.capturedAt === '2026-11-21T09:05:30.000Z');
check('Pinnacle closing history alone is not treated as a current comparison price',
  matchHollywoodWithPinnacle([hollywoodRow], [{
    ...pinnacleFixture,
    markets: [{
      ...pinnacleFixture.markets[0],
      selections: [{ ...pinnacleFixture.markets[0].selections[0], current: null, closing: 2.3 }],
    }],
  }]).length === 0);
check('Pinnacle fixture association outside the strict kickoff window is not price-matched',
  matchHollywoodWithPinnacle([hollywoodRow], [{
    ...pinnacleFixture,
    oddAlertsKickoffUnix: pinnacleKickoff + 301,
  }]).length === 0);
check('Pinnacle kickoff exactly at the five-minute boundary remains eligible',
  matchHollywoodWithPinnacle([hollywoodRow], [{
    ...pinnacleFixture,
    oddAlertsKickoffUnix: pinnacleKickoff + 5 * 60,
  }]).length === 1);
check('Pinnacle home prices do not match a different outcome',
  matchHollywoodWithPinnacle([hollywoodRow], [{
    ...pinnacleFixture,
    markets: [{
      ...pinnacleFixture.markets[0],
      selections: [{ ...pinnacleFixture.markets[0].selections[0], label: 'away' }],
    }],
  }]).length === 0);
check('Pinnacle first-half prices do not match a full-time selection',
  matchHollywoodWithPinnacle([hollywoodRow], [{
    ...pinnacleFixture,
    markets: [{
      ...pinnacleFixture.markets[0],
      marketName: 'First Half Result',
    }],
  }]).length === 0);

const hollywoodTotalsRow = {
  ...hollywoodRow,
  marketName: 'Total Goals 2.5',
  selection: 'OVER 2.5',
};
check('Pinnacle totals match when the line is carried by the market name',
  matchHollywoodWithPinnacle([hollywoodTotalsRow], [pinnacleFixture]).some(
    (match) => match.market === 'Total Goals 2.5' && match.pinnacleOdds === 1.9,
  ));
check('Pinnacle totals with a different line are not matched',
  matchHollywoodWithPinnacle([hollywoodTotalsRow], [{
    ...pinnacleFixture,
    markets: [{
      ...pinnacleFixture.markets[1],
      marketName: 'Total Goals 3.5',
    }],
  }]).length === 0);

console.log('\nBet-slip sharing');
const summary = buildBetSlipSummary(
  [{ id: '1', fixture: 'A vs B', market: 'Full Time', selection: 'Home', odds: 2.1, bookmaker: 'Betway' }],
  { mode: 'accumulator', stake: 50 },
);
check('share text retains the bookmaker', summary.includes('(Betway)'));
check('share text includes the selection and odds', summary.includes('Home @ 2.10'));
check('share text computes potential return', summary.includes('R 105.00'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
