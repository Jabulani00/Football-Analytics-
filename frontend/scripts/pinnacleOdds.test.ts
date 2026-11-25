import {
  buildPinnacleFixtureOdds,
  collectPinnacleUpcomingPages,
  oddAlertsFixtureLookupOptions,
  pinnacleMarketFilters,
  pinnacleOddsWindow,
  pinnacleRowsFromFixtureOdds,
  type PinnacleOddsEnvelope,
} from '../services/pinnacleOdds';
import { supportedSelection } from '../services/bookmakerValue';
import { normalizeTeam } from '../services/hollywoodMatch';

function check(name: string, value: boolean): void {
  if (!value) throw new Error(`Failed: ${name}`);
  console.log(`✓ ${name}`);
}

async function run(): Promise<void> {
  const catalog = [
    { id: 6, market_key: 'ft_result', title: 'Full Time Result' },
    { id: 9, market_key: 'btts', title: 'Both Teams to Score' },
    { id: 21, market_key: 'total_goals_25', title: 'Total Goals 2.5' },
  ];
  const fixtures = [
    { eventId: 7, fixture: 'Alpha vs Bravo', kickoff: '2026-11-23T12:00:00Z', oddAlertsFixtureId: 101 },
    { eventId: 8, fixture: 'Charlie vs Delta', kickoff: '2026-11-23T14:00:00Z', oddAlertsFixtureId: 102 },
  ];
  const result = buildPinnacleFixtureOdds(
    fixtures,
    [
      { fixture_id: 101, market_key: 'ft_result', market_id: 6, outcome: 'home', odds: 2.1, unix: 1, bookmaker_id: 47, datetime: '2026-11-22T10:00:00Z' },
      { fixture_id: 101, market_key: 'btts', market_id: 9, outcome: 'yes', odds: 1.8, unix: 2, bookmaker_slug: 'pinnacle', datetime: '2026-11-22T10:01:00Z' },
      { fixture_id: 101, market_key: 'ft_result', market_id: 6, outcome: 'draw', odds: 3.2, unix: 2, bookmaker_id: 47 },
      { fixture_id: 101, market_key: 'btts', market_id: 9, outcome: 'no', odds: 2.1, unix: 2, bookmaker_id: 47 },
      { fixture_id: 101, market_key: 'total_goals_25', market_id: 21, outcome: 'over', odds: 1.9, unix: 2, bookmaker_id: 47 },
      { fixture_id: 101, market_key: 'total_goals_25', market_id: 21, outcome: 'under', odds: 1.9, unix: 2, bookmaker_id: 47 },
      { fixture_id: 101, market_key: 'ft_result', market_id: 6, outcome: 'home', odds: 2.3, unix: 3, bookmaker_slug: 'bet365', bookmaker_id: 47 },
      { fixture_id: 101, market_key: 'ft_result', market_id: 6, outcome: 'away', odds: 3.5, unix: 3, bookmaker_id: 2 },
    ],
    [
      { fixture_id: 101, market_id: 6, outcome: 'home', opening: 2.0, closing: 2.2, peak: 2.4, bookmaker_id: 47 },
      { fixture_id: 101, market_id: 6, outcome: 'draw', opening: 3.1, closing: 3.2, peak: 3.4, bookmaker_id: 47 },
      { fixture_id: 101, market_id: 9, outcome: 'yes', opening: 1.7, closing: 1.8, peak: 1.9, bookmaker_id: 47 },
      { fixture_id: 101, market_id: 21, outcome: 'over', opening: 1.8, closing: 1.9, peak: 2.0, bookmaker_id: 47 },
      { fixture_id: 101, market_id: 6, outcome: 'home', opening: 2.2, closing: 2.3, peak: 2.5, bookmaker_id: 2 },
    ],
    catalog,
    47,
  );

  check('matched fixtures are retained even without Pinnacle prices', result.length === 2);
  const alpha = result[0];
  const fullTime = alpha.markets.find((market) => market.marketKey === 'ft_result');
  const btts = alpha.markets.find((market) => market.marketKey === 'btts');
  const totals = alpha.markets.find((market) => market.marketKey === 'total_goals_25');
  check('more than one Pinnacle market is grouped by catalog key',
    alpha.markets.length === 3 && fullTime != null && btts != null && totals != null);
  check('market selections remain in their own market group',
    fullTime != null
      && btts != null
      && fullTime.selections.some((selection) => selection.label === 'draw')
      && btts.selections.some((selection) => selection.label === 'no'));
  check('latest Pinnacle FT home snapshot is retained',
    fullTime?.selections.find((selection) => selection.label === 'home')?.current === 2.1);
  check('Pinnacle market titles are resolved from the catalog',
    btts?.marketName === 'Both Teams to Score');
  check('non-Pinnacle prices are ignored even when their bookmaker ID collides',
    fullTime != null && fullTime.selections.every((selection) => selection.label !== 'away'));
  check('opening, closing, and peak history maps for non-result markets',
    btts?.selections.find((selection) => selection.label === 'yes')?.opening === 1.7
      && totals?.selections.find((selection) => selection.label === 'over')?.closing === 1.9);
  check('Pinnacle history rows are counted per matched fixture',
    alpha.historyRowCount === 4 && result[1].historyRowCount === 0);
  check('latest price timestamp is retained',
    alpha.latestPriceAt === '2026-11-22T10:01:00Z');
  check('fixture with no odds remains identified',
    result[1].oddAlertsFixtureId === 102 && result[1].markets.length === 0);

  const fixtureOdds = pinnacleRowsFromFixtureOdds([
    {
      id: 201,
      odds: {
        Pinnacle: {
          markets: {
            ft_result: { home: '2.1', draw: 3.2, away: 3.7 },
            total_goals_25: { over_25: '1.9', under_25: 2 },
          },
        },
      },
    },
    { id: 202, odds: { ft_result: { home: 2.2, draw: 3.1, away: 3.5 } } },
  ]);
  check('fixture-scoped odds normalize Pinnacle and filtered market payloads',
    fixtureOdds.length === 8
      && fixtureOdds.every((row) => row.bookmaker_slug === 'pinnacle')
      && fixtureOdds.some((row) => row.fixture_id === 201 && row.outcome === 'over_25'));
  check('encoded total selections and half-time market names normalize',
    supportedSelection('Total Goals 2.5', 'over_25')?.key === 'totals:ft:2.5:over'
      && supportedSelection('1H Goals', 'under_25')?.period === 'h1'
      && supportedSelection('1h_goals_25', 'over_25')?.period === 'h1');
  check('Brighton short name resolves to its full provider name',
    normalizeTeam('Brighton') === normalizeTeam('Brighton & Hove Albion'));

  const repeatedRow = { fixture_id: 101, market_id: 6, outcome: 'home', odds: 2.1, unix: 1, bookmaker_id: 47 };
  const ambiguous = buildPinnacleFixtureOdds(fixtures, [
    repeatedRow, { ...repeatedRow, odds: 2.3 },
  ], [], catalog, 47);
  check('conflicting prices with the same provider timestamp are unavailable',
    ambiguous[0].markets[0].selections[0].current === null);
  const resolved = buildPinnacleFixtureOdds(fixtures, [
    repeatedRow, { ...repeatedRow, odds: 2.3 }, { ...repeatedRow, unix: 2, odds: 2.4 },
  ], [], catalog, 47);
  check('a later unambiguous price can replace an earlier conflict',
    resolved[0].markets[0].selections[0].current === 2.4);

  const filters = pinnacleMarketFilters([
    ...catalog,
    { id: '9', market_key: 'btts' },
    { market_key: 'fallback_key' },
    { title: 'Not filterable' },
  ]);
  check('all catalog market IDs become deduplicated upcoming and history filters',
    filters.upcoming.join(',') === '6,9,21,fallback_key'
      && filters.history.join(',') === '6,9,21');

  const window = pinnacleOddsWindow(
    ['2026-11-23T12:00:00Z', '2026-11-23T14:00:00Z'],
    10,
  );
  check('upcoming request window covers matched kickoffs and tolerance',
    window?.from === Date.parse('2026-11-23T11:59:50Z') / 1000
      && window.to === Date.parse('2026-11-23T14:00:10Z') / 1000);
  check('invalid fixture kickoffs do not create a request window',
    pinnacleOddsWindow(['not-a-date'], 10) === null);

  const fixtureLookup = oddAlertsFixtureLookupOptions(
    ['2026-11-24T12:00:00Z', '2026-11-30T12:00:00Z'],
    Date.parse('2026-11-23T12:00:00Z'),
  );
  check('fixture lookup covers the latest selected kickoff and paginates beyond page two',
    fixtureLookup.days === 8 && fixtureLookup.maxPages > 2);
  check('fixture lookup retains a bounded baseline for missing or past kickoffs',
    oddAlertsFixtureLookupOptions(
      ['not-a-date', '2026-11-22T12:00:00Z'],
      Date.parse('2026-11-23T12:00:00Z'),
    ).days === 3);

  const fetchedPages: number[] = [];
  const paged = await collectPinnacleUpcomingPages(
    async (page): Promise<PinnacleOddsEnvelope> => {
      fetchedPages.push(page);
      return page === 1
        ? { data: [{ fixture_id: 101 }], info: { next_page_url: 'next' } }
        : { data: [{ fixture_id: 102 }], info: { next_page_url: 'next' } };
    },
    new Set([101, 102]),
    4,
  );
  check('board pagination stops after finding every matched fixture',
    fetchedPages.join(',') === '1,2' && paged.pagesFetched === 2 && !paged.truncated);

  const capped = await collectPinnacleUpcomingPages(
    async (page) => ({
      data: [{ fixture_id: 101 }],
      info: { next_page_url: page < 2 ? 'next' : 'next' },
    }),
    new Set([101, 999]),
    2,
  );
  check('board pagination reports when its request cap is reached',
    capped.pagesFetched === 2 && capped.truncated);
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
