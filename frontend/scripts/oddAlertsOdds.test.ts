import {
  assertOddAlertsServerProxy,
  buildOddsHistoryRequest,
  buildUpcomingOddsRequest,
  normalizeOddsMarketCatalogResponse,
} from '../services/oddAlertsOddsRequests';

function check(name: string, value: boolean): void {
  if (!value) throw new Error(`Failed: ${name}`);
  console.log(`✓ ${name}`);
}

const bareCatalog = [{ id: 6, market_key: 'ft_result' }, { id: 9, market_key: 'btts' }];
const normalizedBareCatalog = normalizeOddsMarketCatalogResponse(bareCatalog);
check('market catalog accepts the provider bare-array response',
  normalizedBareCatalog.length === 2 && normalizedBareCatalog[1].market_key === 'btts');
const normalizedEnvelopeCatalog = normalizeOddsMarketCatalogResponse({ data: bareCatalog });
check('market catalog also accepts a data envelope',
  normalizedEnvelopeCatalog.length === 2 && normalizedEnvelopeCatalog[0].id === 6);
let invalidCatalogRejected = false;
try {
  normalizeOddsMarketCatalogResponse({ data: 'not-an-array' });
} catch (error) {
  invalidCatalogRejected = error instanceof TypeError && error.message.includes('odds/markets');
}
check('invalid market catalog payloads fail with an explicit schema error', invalidCatalogRejected);

const upcoming = buildUpcomingOddsRequest({
  bookmakers: ['pinnacle', 'bet365', 'pinnacle'],
  markets: ['ft_result'],
  from: 1_800_000_000,
  to: 1_800_086_400,
});
check('upcoming odds defaults to closing and deduplicates filters',
  upcoming.path === 'odds/upcoming'
    && upcoming.params.bookmakers === 'pinnacle,bet365'
    && upcoming.params.markets === 'ft_result'
    && upcoming.params.odds_type === 'closing');
check('upcoming odds builds a proxy URL without a token parameter',
  !('api_token' in upcoming.params));
const catalogMarkets = buildUpcomingOddsRequest({
  bookmakers: ['pinnacle'],
  markets: [6, 9, 21],
  from: 1_800_000_000,
  to: 1_800_086_400,
  perPage: 250,
});
check('upcoming odds accepts catalog market IDs for multi-market requests',
  catalogMarkets.params.markets === '6,9,21'
    && catalogMarkets.params.per_page === 250);
check('native odds requests require an absolute server proxy',
  (() => {
    try {
      assertOddAlertsServerProxy('android', '/oddalerts', 'odds/upcoming');
      return false;
    } catch (error) {
      return error instanceof Error && error.message.includes('server proxy');
    }
  })());
assertOddAlertsServerProxy('android', 'https://proxy.example.test/oddalerts', 'odds/upcoming');
check('native odds requests accept an absolute server proxy', true);
assertOddAlertsServerProxy('web', '/oddalerts', 'odds/history/77');
check('web odds requests use the same-origin server proxy', true);

const multipleHistory = buildOddsHistoryRequest([41, 42, 42], {
  bookmakers: ['pinnacle'],
  markets: [1, 9],
});
check('history deduplicates IDs and uses the batch endpoint',
  multipleHistory.path === 'odds/history/multiple'
    && multipleHistory.params.ids === '41,42');
check('history market IDs stay integer-filtered',
  multipleHistory.params.markets === '1,9');

const singleHistory = buildOddsHistoryRequest([77], {
  bookmakers: [1],
  markets: [1],
});
check('single-fixture history uses the direct fixture path',
  singleHistory.path === 'odds/history/77'
    && singleHistory.params.ids === undefined);

for (const [name, run] of [
  ['over-14-day window', () => buildUpcomingOddsRequest({
    bookmakers: ['pinnacle'],
    markets: ['ft_result'],
    from: 1_800_000_000,
    to: 1_801_296_001,
  })],
  ['unfiltered upcoming request', () => buildUpcomingOddsRequest({
    bookmakers: ['pinnacle'],
    markets: [],
  })],
  ['history batch over 50 fixtures', () => buildOddsHistoryRequest(
    Array.from({ length: 51 }, (_, index) => index + 1),
    { bookmakers: ['pinnacle'], markets: [1] },
  )],
  ['non-integer history market', () => buildOddsHistoryRequest(
    [1],
    { bookmakers: ['pinnacle'], markets: [1.5] },
  )],
] as const) {
  let rejected = false;
  try {
    run();
  } catch {
    rejected = true;
  }
  check(`${name} is rejected before a network call`, rejected);
}
