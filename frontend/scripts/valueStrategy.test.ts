import {
  assessValueSelection,
  classifyOppositionDelta,
} from '../services/hollywoodValueRules';
import { CORE_VALUE_STRATEGY, evaluateStrategy } from '../services/strategyEngine';
import {
  compareHollywoodWithProvider,
  diagnoseHollywoodWithProvider,
  matchHollywoodWithPinnacle,
  mergeProviderBookmakers,
  normalizeOddAlertsValueBet,
} from '../services/bookmakerAdapter';
import type { MarketRow } from '../services/hollywoodFusion';
import { buildBetSlipSummary } from '../services/betSlipShare';
import { compareReference, findPinnacleReference, parseMachineReference, supportedSelection } from '../services/bookmakerValue';
import { buildBookmakerValueTable } from '../services/bookmakerValueTable';
import { reviewBetSlip, ticketGroup, ticketReference } from '../services/betSlipReview';
import type { BetSlipLeg } from '../types/analytics';

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
}, '2026-11-21T09:00:00.000Z');
check('OddAlerts value line normalizes', offers.length === 1 && offers[0].decimal === 2.2);
check('normalized offer retains its local capture time', offers[0]?.capturedAt === '2026-11-21T09:00:00.000Z');
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
const exactMatchDiagnostics = diagnoseHollywoodWithProvider([hollywoodRow], offers);
check('match diagnostics count the fixture, kickoff, and exact selection stages',
  exactMatchDiagnostics.providerOffers === 1
    && exactMatchDiagnostics.usableProviderOffers === 1
    && exactMatchDiagnostics.comparableHollywoodSelections === 1
    && exactMatchDiagnostics.fixtureMatchedSelections === 1
    && exactMatchDiagnostics.kickoffMatchedSelections === 1
    && exactMatchDiagnostics.exactMarketSelectionMatches === 1);
check('comparison includes provider and Hollywood capture times',
  comparisons[0]?.providerPrices[0]?.capturedAt === '2026-11-21T09:00:00.000Z'
    && comparisons[0]?.hollywoodCapturedAt === null);

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
check('ambiguous Pinnacle markets are not reported as exact selection matches',
  matchHollywoodWithPinnacle([hollywoodRow], [{ ...pinnacleFixture,
    markets: [pinnacleFixture.markets[0], { ...pinnacleFixture.markets[0], marketId: 7 }],
  }]).length === 0);
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

console.log('\nPinnacle and machine reference calculations');
const completePinnacle = {
  ...pinnacleFixture,
  markets: [{
    ...pinnacleFixture.markets[0],
    selections: [
      { key: 'home', label: 'home', current: 1.8, opening: null, closing: null, peak: null },
      { key: 'draw', label: 'draw', current: 3.3, opening: null, closing: null, peak: null },
      { key: 'away', label: 'away', current: 4, opening: null, closing: null, peak: null },
    ],
  }],
};
const capture = '2026-11-21T09:05:30.000Z';
const reference = findPinnacleReference(hollywoodRow, [completePinnacle], capture);
const expectedFair = (1 / 1.8) / (1 / 1.8 + 1 / 3.3 + 1 / 4);
check('complete 1X2 market is de-vigged at full precision',
  reference.status === 'available' && Math.abs(reference.reference.probability - expectedFair) < 1e-14
    && reference.reference.outcomes.length === 3 && reference.reference.capturedAt === capture);
const result = compareReference(1.9, expectedFair);
check('signed reference value, odds difference, EV and shortfall are distinct',
  result != null && Math.abs(result.valuePp - 100 * (expectedFair - 1 / 1.9)) < 1e-12
    && Math.abs(result.benchmarkEvPct - 100 * (expectedFair * 1.9 - 1)) < 1e-12
    && Math.abs(result.oddsDifference! - (1.9 - 1 / expectedFair)) < 1e-12
    && result.shortfallPp === result.valuePp
    && Math.abs(result.shortfallUnitsPerUnit + result.benchmarkEvPct / 100) < 1e-12);
const mm = compareReference(1.9, 0.55);
check('an independent supplied MM probability can produce a positive comparison',
  mm != null && mm.valuePp > 0 && mm.shortfallPp === 0
    && Math.abs(mm.benchmarkEvPct - 4.5) < 1e-12 && mm.shortfallUnitsPerUnit === 0);
const zero = compareReference(1.9, 0);
check('zero probability has a defined signed gap and EV but no finite fair odds',
  zero != null && zero.fairOdds === null && zero.oddsDifference === null
    && zero.benchmarkEvPct === -100 && zero.shortfallUnitsPerUnit === 1);
check('invalid odds and probabilities never produce a comparison',
  compareReference(0, 0.5) === null && compareReference(2, 1.01) === null
    && compareReference(2, NaN) === null);
const emptyModel = { probabilityPct: '', source: '', version: '', capturedAt: '' };
check('MM remains blank without user input', parseMachineReference(emptyModel).status === 'empty');
check('MM input requires a probability, model source, version and zoned capture time',
  parseMachineReference({ ...emptyModel, probabilityPct: '55' }).status === 'invalid'
    && parseMachineReference({ probabilityPct: '101', source: 'MM', version: 'v1', capturedAt: capture }).status === 'invalid'
    && parseMachineReference({ probabilityPct: '55', source: 'MM', version: 'v1', capturedAt: '2026-11-21T09:05' }).status === 'invalid');
const suppliedModel = parseMachineReference({
  probabilityPct: '55', source: 'My model', version: 'v1', capturedAt: capture,
});
check('an explicit MM input retains its source, version and capture time',
  suppliedModel.status === 'available' && suppliedModel.reference.probability === 0.55
    && suppliedModel.reference.source === 'My model' && suppliedModel.reference.version === 'v1');
check('an incomplete Pinnacle market is not normalized',
  findPinnacleReference(hollywoodRow, [pinnacleFixture], capture).status === 'unavailable');
const incomplete = findPinnacleReference(hollywoodRow, [pinnacleFixture], capture);
check('an unambiguous single Pinnacle quote remains available even when no-vig is unavailable',
  incomplete.status === 'unavailable' && incomplete.quote?.odds === 2.3);
const duplicateOutcome = {
  ...completePinnacle,
  markets: [{ ...completePinnacle.markets[0], selections: [
    ...completePinnacle.markets[0].selections,
    { key: 'home win', label: 'home win', current: 1.9, opening: null, closing: null, peak: null },
  ] }],
};
check('duplicate canonical Pinnacle outcomes are not normalized',
  findPinnacleReference(hollywoodRow, [duplicateOutcome], capture).status === 'unavailable');
const unavailableHomeAlias = {
  ...completePinnacle,
  markets: [{ ...completePinnacle.markets[0], selections: [
    ...completePinnacle.markets[0].selections,
    { key: 'home win', label: 'home win', current: null, opening: null, closing: null, peak: null },
  ] }],
};
const duplicateSelectedReference = findPinnacleReference(hollywoodRow, [unavailableHomeAlias], capture);
check('an unavailable duplicate of the selected Pinnacle outcome blocks both the quote and no-vig reference',
  duplicateSelectedReference.status === 'unavailable' && duplicateSelectedReference.quote == null);
const unavailableDrawAlias = {
  ...completePinnacle,
  markets: [{ ...completePinnacle.markets[0], selections: [
    ...completePinnacle.markets[0].selections,
    { key: 'draw win', label: 'draw win', current: null, opening: null, closing: null, peak: null },
  ] }],
};
const duplicateOtherReference = findPinnacleReference(hollywoodRow, [unavailableDrawAlias], capture);
check('an unavailable duplicate opposing outcome blocks no-vig while preserving a unique selected quote',
  duplicateOtherReference.status === 'unavailable' && duplicateOtherReference.quote?.odds === 1.8);
check('multiple matching Pinnacle markets are treated as ambiguous',
  findPinnacleReference(hollywoodRow, [{ ...completePinnacle,
    markets: [...completePinnacle.markets, { ...completePinnacle.markets[0], marketId: 7 }],
  }], capture).status === 'unavailable');
check('reference requires a capture and a kickoff within five minutes',
  findPinnacleReference(hollywoodRow, [completePinnacle], null).status === 'unavailable'
    && findPinnacleReference(hollywoodRow, [{ ...completePinnacle,
      oddAlertsKickoffUnix: pinnacleKickoff + 301 }], capture).status === 'unavailable');
const binaryPinnacle = {
  ...pinnacleFixture,
  markets: [{ ...pinnacleFixture.markets[1], selections: [
    { key: 'over', label: 'over', current: 1.9, opening: null, closing: null, peak: null },
    { key: 'under', label: 'under', current: 2.1, opening: null, closing: null, peak: null },
  ] }],
};
const binary = findPinnacleReference(hollywoodTotalsRow, [binaryPinnacle], capture);
check('matching non-push totals use the complete same-line market',
  binary.status === 'available'
    && Math.abs(binary.reference.probability - (1 / 1.9) / (1 / 1.9 + 1 / 2.1)) < 1e-14);
console.log('\nReference calculation table');
const reviewTable = buildBookmakerValueTable({
  bookmaker: 'Hollywoodbets', bookOdds: 1.9, pinnacle: reference, machine: suppliedModel,
  counterpart: { bookmaker: 'Betway', decimal: 2.4 },
});
const row = (id: string) => reviewTable.steps.find((step) => step.id === id);
check('table shows each 1X2 input and the actual no-vig denominator',
  row('book-implied')?.calculation === '(1 / 1.90) x 100'
    && row('book-implied')?.result === '52.6316%'
    && row('pinnacle-input-home')?.result === '55.5556%'
    && row('pinnacle-input-draw')?.result === '30.3030%'
    && row('pinnacle-input-away')?.result === '25.0000%'
    && row('pinnacle-input-total')?.calculation === '(1 / 1.80 + 1 / 3.30 + 1 / 4.00) x 100'
    && row('pinnacle-input-total')?.result === '110.8586%'
    && row('reference1-probability')?.result === '50.1139%');
check('table distinguishes signed value, shortfall, EV, odds and units for both references',
  row('reference1-fair-odds')?.result === '1.9955'
    && row('reference1-fair-odds')?.calculation === `1 / ${expectedFair}`
    && row('reference1-value')?.result === '-2.5177 pp'
    && row('reference1-shortfall')?.result === '-2.5177 pp'
    && row('reference1-ev')?.result === '-4.7836%'
    && row('reference1-units')?.result === '0.0478 units per unit staked'
    && row('reference2-value')?.result === '+2.3684 pp'
    && row('reference2-shortfall')?.result === '0.0000 pp'
    && row('reference2-ev')?.result === '+4.5000%'
    && row('other-gap')?.result === '0.50 (small)');
const incompleteTable = buildBookmakerValueTable({
  bookmaker: 'Hollywoodbets', bookOdds: 1.9, pinnacle: incomplete, machine: suppliedModel, counterpart: null,
});
check('incomplete no-vig keeps the matched quote and independent MM, with a reason instead of zero',
  incompleteTable.steps.find((step) => step.id === 'pinnacle-odds')?.result === '2.30'
    && incompleteTable.steps.find((step) => step.id === 'pinnacle-implied')?.result === '43.4783%'
    && incompleteTable.steps.find((step) => step.id === 'reference1-unavailable')?.result === 'Unavailable'
    && incompleteTable.steps.find((step) => step.id === 'reference1-unavailable')?.calculation ===
      (incomplete.status === 'unavailable' ? incomplete.reason : '')
    && incompleteTable.steps.find((step) => step.id === 'reference2-value')?.result === '+2.3684 pp');
const zeroTable = buildBookmakerValueTable({
  bookmaker: 'Hollywoodbets', bookOdds: 1.9, pinnacle: reference,
  machine: parseMachineReference({ probabilityPct: '0', source: 'MM', version: 'v1', capturedAt: capture }),
  counterpart: null,
});
check('zero MM probability retains its value and EV without inventing finite fair odds',
  zeroTable.steps.find((step) => step.id === 'reference2-fair-odds')?.result === 'Unavailable at 0% probability'
    && zeroTable.steps.find((step) => step.id === 'reference2-odds-difference')?.result === 'Unavailable'
    && zeroTable.steps.find((step) => step.id === 'reference2-value')?.result === '-52.6316 pp'
    && zeroTable.steps.find((step) => step.id === 'reference2-ev')?.result === '-100.0000%');
const tinyTable = buildBookmakerValueTable({
  bookmaker: 'Hollywoodbets', bookOdds: 1.9, pinnacle: reference,
  machine: parseMachineReference({ probabilityPct: '0.00000001', source: 'MM', version: 'v1', capturedAt: capture }),
  counterpart: null,
});
check('a tiny positive MM probability is not displayed as zero in the calculation',
  tinyTable.steps.find((step) => step.id === 'reference2-probability')?.result === '1.000e-8%'
    && tinyTable.steps.find((step) => step.id === 'reference2-fair-odds')?.calculation === '1 / 1e-10'
    && tinyTable.steps.find((step) => step.id === 'reference2-fair-odds')?.result === '10000000000.0000');
const exactGapTable = buildBookmakerValueTable({
  bookmaker: 'Hollywoodbets', bookOdds: 3.795, pinnacle: incomplete, machine: suppliedModel, counterpart: null,
});
check('displayed 1.495 gap is not rounded across the 1.50 classification boundary',
  exactGapTable.steps.find((step) => step.id === 'pinnacle-gap')?.result === '1.495 (small)');
const binaryTable = buildBookmakerValueTable({
  bookmaker: 'Hollywoodbets', bookOdds: 1.9, pinnacle: binary, machine: parseMachineReference(emptyModel), counterpart: null,
});
check('binary markets show their own complete two-outcome no-vig inputs',
  binaryTable.steps.filter((step) => step.id.startsWith('pinnacle-input-') && step.id !== 'pinnacle-input-total').length === 2
    && binaryTable.steps.find((step) => step.id === 'pinnacle-input-over')?.result === '52.6316%'
    && binaryTable.steps.find((step) => step.id === 'pinnacle-input-under')?.result === '47.6190%');
check('push, quarter-line, team-total, and conflicting-line markets are not normalized',
  supportedSelection('Total Goals 2', 'Over 2') === null
    && supportedSelection('Asian Total Goals 2.25', 'Over 2.25') === null
    && supportedSelection('Home Team Total Goals 2.5', 'Over 2.5') === null
    && supportedSelection('Total Goals 2.5', 'Over 3.5') === null);
check('team totals cannot be mistaken for match totals by the price matcher',
  matchHollywoodWithPinnacle([hollywoodTotalsRow], [{
    ...binaryPinnacle,
    markets: [{ ...binaryPinnacle.markets[0], marketName: 'Home Team Total Goals 2.5' }],
  }]).length === 0);

const multiBookOffers = normalizeOddAlertsValueBet({
  id: 100,
  home_name: 'Alpha FC',
  away_name: 'Bravo',
  unix: Math.floor(new Date(base.kickoff).getTime() / 1000),
  market: 'home_win',
  selection: 'Home Win',
  odds: [
    { bookmaker_name: 'Bet365', bookmaker_slug: 'bet365', latest: 2.2 },
    { bookmaker_name: 'Betway', bookmaker_slug: 'betway', latest: 2.4 },
  ],
}, '2026-11-21T09:01:00.000Z');
const multiBookComparison = compareHollywoodWithProvider(
  [hollywoodRow],
  multiBookOffers,
  '2026-11-21T09:00:30.000Z',
);
check('comparison keeps every matched bookmaker price',
  multiBookComparison[0]?.providerPrices.length === 2);
check('comparison chooses the best price across all matching books',
  multiBookComparison[0]?.bestBookmaker === 'Betway'
    && multiBookComparison[0]?.bestOdds === 2.4);
check('price spread uses the highest and lowest matched prices',
  Math.abs((multiBookComparison[0]?.difference ?? 0) - 0.4) < 1e-9);

const lateOffer = [{ ...multiBookOffers[0], kickoffUnix: multiBookOffers[0].kickoffUnix! + 6 * 60 }];
check('different kickoffs are not compared',
  compareHollywoodWithProvider([hollywoodRow], lateOffer).length === 0);
const lateDiagnostics = diagnoseHollywoodWithProvider([hollywoodRow], lateOffer);
check('match diagnostics isolate a kickoff mismatch',
  lateDiagnostics.fixtureMatchedSelections === 1
    && lateDiagnostics.kickoffMatchedSelections === 0
    && lateDiagnostics.exactMarketSelectionMatches === 0);
check('missing provider kickoff is not compared',
  compareHollywoodWithProvider([hollywoodRow], [{ ...multiBookOffers[0], kickoffUnix: null }]).length === 0);
check('different 1X2 selections are not compared',
  compareHollywoodWithProvider([hollywoodRow], [{ ...multiBookOffers[0], selection: 'Away Win' }]).length === 0);
check('different match periods are not compared',
  compareHollywoodWithProvider([hollywoodRow], [{
    ...multiBookOffers[0],
    market: 'First Half Result',
  }]).length === 0);

const totalRow = {
  ...hollywoodRow,
  marketName: 'Total Goals 2.5',
  selection: 'OVER 2.5',
};
check('different totals lines are not compared',
  compareHollywoodWithProvider([totalRow], [{
    ...multiBookOffers[0],
    market: 'Total Goals 3.5',
    selection: 'Over 3.5',
  }]).length === 0);

console.log('\nBet-slip sharing');
const summary = buildBetSlipSummary(
  [{ id: '1', fixture: 'A vs B', market: 'Full Time', selection: 'Home', odds: 2.1, bookmaker: 'Betway' }],
  { mode: 'accumulator', stake: 50 },
);
check('share text retains the bookmaker', summary.includes('(Betway)'));
check('share text includes the selection and odds', summary.includes('Home @ 2.10'));
check('share text computes potential return', summary.includes('R 105.00'));
const machine = (probability: number) => ({
  version: 'reference-comparison-v1' as const,
  bookmakerCapturedAt: capture,
  machine: { probability, source: 'Test model', version: '1', capturedAt: capture },
});
const firstLeg: BetSlipLeg = {
  id: 'a', fixture: 'A vs B', market: 'Full Time', selection: 'Home', odds: 1.9,
  bookmaker: 'Hollywoodbets', references: machine(0.5),
};
const secondLeg: BetSlipLeg = {
  id: 'b', fixture: 'C vs D', market: 'Full Time', selection: 'Away', odds: 2.4,
  bookmaker: 'Hollywoodbets', references: machine(0.4),
};
const mixedReview = reviewBetSlip([firstLeg, { ...secondLeg, bookmaker: 'Betway' }], 'accumulator', 50);
check('mixed bookmakers become separate tickets with separate stakes and returns',
  mixedReview.tickets.length === 2 && mixedReview.totalStake === 100
    && mixedReview.potentialReturn === 215
    && mixedReview.tickets[0].combinedOdds === 1.9
    && mixedReview.tickets[1].combinedOdds === 2.4);
const mixedSummary = buildBetSlipSummary([firstLeg, { ...secondLeg, bookmaker: 'Betway' }],
  { mode: 'accumulator', stake: 50 });
check('shared mixed-bookmaker summary never invents a cross-bookmaker accumulator',
  mixedSummary.includes('Hollywoodbets ticket') && mixedSummary.includes('Betway ticket')
    && !mixedSummary.includes('combined odds 4.56') && mixedSummary.includes('Total stake: R 100.00'));
const ticket = reviewBetSlip([firstLeg, secondLeg], 'accumulator', 1).tickets[0];
check('requested ticket sizes map to the six operational groups',
  ticketGroup(1) === 1 && ticketGroup(5) === 2 && ticketGroup(10) === 3
    && ticketGroup(20) === 4 && ticketGroup(30) === 5 && ticketGroup(50) === 6
    && ticketGroup(6) === null);
check('multi-leg probability stays unavailable until independence is explicitly assumed',
  ticketReference(ticket, 'machine', false).status === 'unavailable');
const ticketMetrics = ticketReference(ticket, 'machine', true);
check('independent ticket probabilities compound rather than summing leg gaps',
  ticketMetrics.status === 'available' && Math.abs(ticket.combinedOdds! - 4.56) < 1e-12
    && Math.abs(ticketMetrics.metrics.probability - 0.2) < 1e-12
    && Math.abs(ticketMetrics.metrics.valuePp - 100 * (0.2 - 1 / 4.56)) < 1e-12
    && Math.abs(ticketMetrics.metrics.benchmarkEvPct + 8.8) < 1e-12
    && Math.abs(ticketMetrics.metrics.shortfallUnitsPerUnit - 0.088) < 1e-12);
check('missing per-leg reference blocks only the corresponding ticket comparison',
  ticketReference(ticket, 'pinnacle', true).status === 'unavailable');
const sameMatch = reviewBetSlip([firstLeg, { ...secondLeg, fixture: 'A vs B' }], 'accumulator', 1);
check('same-match ordinary prices are never multiplied as a builder quote',
  sameMatch.tickets[0].combinedOdds === null && sameMatch.potentialReturn === null
    && sameMatch.tickets[0].issue?.includes('builder quote') === true);
const unassigned = reviewBetSlip([firstLeg, { ...secondLeg, bookmaker: undefined }], 'accumulator', 1);
check('an unassigned selection is not silently combined or counted as a ticket',
  unassigned.tickets.length === 2 && unassigned.totalStake === null && unassigned.tickets[1].issue != null);
check('invalid stake and invalid prices are explicitly unavailable',
  reviewBetSlip([firstLeg], 'accumulator', NaN).issue != null
    && reviewBetSlip([{ ...firstLeg, odds: 0 }], 'accumulator', 1).potentialReturn == null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
