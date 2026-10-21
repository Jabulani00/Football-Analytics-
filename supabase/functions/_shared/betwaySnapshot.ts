export const BETWAY_UPCOMING_URL = 'https://www.betway.co.za/sport/soccer/upcoming';
export const BETWAY_UPCOMING_API_URL =
  'https://www.betway.co.za/sportsapi/br/v1/BetBook/Upcoming/';

const MARKET_TYPES = ['[Win/Draw/Win]', 'Total Goals', '[Both Teams To Score]'];
const PAGE_SIZE = 500;
const PAGE_LIMIT = 40;

type Row = Record<string, unknown>;

export type BetwayFixture = {
  bookmaker: 'Betway';
  provider_event_id: string;
  home_name: string;
  away_name: string;
  competition: string | null;
  kickoff_label: string;
  kickoff_timezone: 'Africa/Johannesburg';
  kickoff_utc: string;
  fixture_status: 'active' | 'suspended';
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
  market_open: boolean;
  market_suspended: boolean;
};

export type BetwaySnapshot = {
  bookmaker: 'Betway';
  source_url: string;
  captured_at: string;
  complete: true;
  pages_captured: number;
  source_event_count: number;
  excluded_event_count: number;
  fixtures: BetwayFixture[];
};

export class IncompleteSnapshotError extends Error {
  override name = 'IncompleteSnapshotError';
}

function eventId(event: Row): string {
  const value = event.eventId;
  if (typeof value === 'boolean' || value == null || !String(value).trim()) {
    throw new IncompleteSnapshotError('Betway event is missing its provider event ID');
  }
  return String(value).trim();
}

function isEsports(event: Row): boolean {
  const labels = ['region', 'league', 'displayName', 'name']
    .map((key) => String(event[key] ?? ''))
    .join(' ')
    .toLocaleLowerCase('en');
  return [
    'esoccer', 'e-soccer', 'esports', 'e-sports', 'efootball', 'e-football',
    'virtual soccer', 'virtual football',
  ].some((marker) => labels.includes(marker));
}

function kickoffFromEpoch(value: unknown, id: string): Date {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new IncompleteSnapshotError(`Betway event ${id} has no valid scheduled kickoff`);
  }
  const epochMs = value >= 1_000_000_000_000 ? value : value * 1_000;
  const kickoff = new Date(epochMs);
  if (!Number.isFinite(kickoff.getTime())) {
    throw new IncompleteSnapshotError(`Betway event ${id} has an out-of-range scheduled kickoff`);
  }
  return kickoff;
}

function decimalPrice(value: unknown): number | null {
  if (typeof value === 'boolean' || value == null) return null;
  const odds = Number(value);
  return Number.isFinite(odds) && odds >= 1 ? odds : null;
}

function selectionPrices(
  id: string,
  homeName: string,
  awayName: string,
  markets: Row[],
  outcomesByMarket: Map<string, Row[]>,
  priceByOutcome: Map<string, unknown>,
): { odds: [number | null, number | null, number | null]; suspended: boolean } {
  const candidates = markets.filter((market) =>
    String(market.marketTypeCName ?? '').toLocaleLowerCase('en') === 'win-draw-win'
  );
  if (candidates.length === 0) return { odds: [null, null, null], suspended: false };

  const active = candidates.filter((market) =>
    market.isActive === true && market.isSuspended !== true && market.shouldDisplay === true
  );
  if (active.length > 1 || (active.length === 0 && candidates.length > 1)) {
    throw new IncompleteSnapshotError(`Betway event ${id} has ambiguous 1X2 markets`);
  }
  const market = active[0] ?? candidates[0];
  const suspended = market.isSuspended === true || market.isActive !== true ||
    market.shouldDisplay !== true;
  const marketId = String(market.marketId ?? '');
  const selections = outcomesByMarket.get(marketId) ?? [];
  if (selections.length !== 3) return { odds: [null, null, null], suspended };

  const label = (outcome: Row) =>
    String(outcome.displayName ?? outcome.name ?? '').trim().toLocaleLowerCase('en');
  const homeKey = homeName.trim().toLocaleLowerCase('en');
  const awayKey = awayName.trim().toLocaleLowerCase('en');
  const named: Partial<Record<'home' | 'draw' | 'away', Row>> = {};
  for (const selection of selections) {
    const value = label(selection);
    if (value === homeKey) named.home = selection;
    else if (value === awayKey) named.away = selection;
    else if (['draw', 'the draw', 'x'].includes(value)) named.draw = selection;
  }

  let ordered: Row[];
  if (named.home && named.draw && named.away) {
    ordered = [named.home, named.draw, named.away];
  } else {
    if (selections.some((selection) => !Number.isInteger(Number(selection.index)))) {
      return { odds: [null, null, null], suspended };
    }
    ordered = [...selections].sort((left, right) => Number(left.index) - Number(right.index));
  }

  const odds = ordered.map((selection) =>
    selection.isTradingActive === true && selection.shouldDisplay === true
      ? decimalPrice(priceByOutcome.get(String(selection.outcomeId)))
      : null
  ) as [number | null, number | null, number | null];
  return { odds, suspended };
}

function johannesburgLabel(kickoff: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(kickoff);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

type BetwayPageIndex = {
  marketsByEvent: Map<string, Row[]>;
  outcomesByMarket: Map<string, Row[]>;
  priceByOutcome: Map<string, unknown>;
};

function indexBetwayPage(page: BetwayPage): BetwayPageIndex {
  const marketsByEvent = new Map<string, Row[]>();
  const outcomesByMarket = new Map<string, Row[]>();
  const priceByOutcome = new Map<string, unknown>();
  for (const market of page.markets) {
    const key = String(market.eventId);
    marketsByEvent.set(key, [...(marketsByEvent.get(key) ?? []), market]);
  }
  for (const outcome of page.outcomes) {
    const key = String(outcome.marketId);
    outcomesByMarket.set(key, [...(outcomesByMarket.get(key) ?? []), outcome]);
  }
  for (const price of page.prices) {
    priceByOutcome.set(String(price.outcomeId), price.priceDecimal);
  }
  return { marketsByEvent, outcomesByMarket, priceByOutcome };
}

function parseFixture(
  pageIndex: BetwayPageIndex,
  event: Row,
  capturedAt: Date,
): BetwayFixture | null {
  const id = eventId(event);
  if (isEsports(event) || event.isOutright === true) return null;
  const kickoff = kickoffFromEpoch(event.expectedStartEpoch, id);
  if (typeof event.isLive !== 'boolean' || typeof event.isFinished !== 'boolean') {
    throw new IncompleteSnapshotError(`Betway event ${id} is missing lifecycle flags`);
  }
  if (event.isLive || event.isFinished || kickoff <= capturedAt) return null;

  const homeName = String(event.homeTeam ?? '').trim();
  const awayName = String(event.awayTeam ?? '').trim();
  if (!homeName || !awayName) {
    throw new IncompleteSnapshotError(`Betway event ${id} is missing a team name`);
  }
  if (typeof event.isActive !== 'boolean' || typeof event.shouldDisplay !== 'boolean') {
    throw new IncompleteSnapshotError(`Betway event ${id} is missing offer-status flags`);
  }
  const fixtureStatus = event.isActive && event.shouldDisplay ? 'active' : 'suspended';
  const eventMarkets = pageIndex.marketsByEvent.get(id) ?? [];
  const selection = selectionPrices(
    id,
    homeName,
    awayName,
    eventMarkets,
    pageIndex.outcomesByMarket,
    pageIndex.priceByOutcome,
  );
  const league = String(event.league ?? '').trim();
  const region = String(event.region ?? '').trim();
  const competition = [league, region].filter(Boolean).join(', ') || null;
  return {
    bookmaker: 'Betway', provider_event_id: id, home_name: homeName, away_name: awayName,
    competition, kickoff_label: johannesburgLabel(kickoff), kickoff_timezone: 'Africa/Johannesburg',
    kickoff_utc: kickoff.toISOString(), fixture_status: fixtureStatus,
    odds_home: selection.odds[0], odds_draw: selection.odds[1], odds_away: selection.odds[2],
    market_open: fixtureStatus === 'active' && !selection.suspended && selection.odds.every((odd) => odd != null),
    market_suspended: selection.suspended,
  };
}

type BetwayPage = {
  events: Row[];
  markets: Row[];
  outcomes: Row[];
  prices: Row[];
  isFinalPage: boolean;
};

export function validateBetwayPage(body: unknown, skip: number): BetwayPage {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new IncompleteSnapshotError(`Betway API returned an invalid page at offset ${skip}`);
  }
  const page = body as Row;
  for (const field of ['events', 'markets', 'outcomes', 'prices']) {
    const rows = page[field];
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new IncompleteSnapshotError(`Betway API page at offset ${skip} has an invalid ${field} list`);
    }
  }
  const result = page as unknown as BetwayPage;
  if (result.markets.some((row) => row.marketId == null || row.eventId == null)) {
    throw new IncompleteSnapshotError(`Betway API page at offset ${skip} has a market without identity`);
  }
  if (result.outcomes.some((row) => row.outcomeId == null || row.marketId == null || row.eventId == null)) {
    throw new IncompleteSnapshotError(`Betway API page at offset ${skip} has an outcome without identity`);
  }
  if (result.prices.some((row) => row.outcomeId == null)) {
    throw new IncompleteSnapshotError(`Betway API page at offset ${skip} has a price without identity`);
  }
  if (typeof result.isFinalPage !== 'boolean') {
    throw new IncompleteSnapshotError(`Betway API page at offset ${skip} has no terminal-page flag`);
  }
  return result;
}

function requestUrl(baseUrl: string, skip: number, take: number): string {
  const url = new URL(baseUrl);
  const params: [string, string][] = [
    ['countryCode', 'ZA'], ['sportId', 'soccer'], ['Skip', String(skip)], ['Take', String(take)],
    ['cultureCode', 'en-US'], ['isEsport', 'false'], ['boostedOnly', 'false'],
    ...MARKET_TYPES.map((market): [string, string] => ['marketTypes', market]),
  ];
  for (const [key, value] of params) url.searchParams.append(key, value);
  return url.toString();
}

export async function captureBetwaySnapshot(options: {
  capturedAt?: Date;
  pageSize?: number;
  pageLimit?: number;
  runBudgetMs?: number;
  fetchImpl?: typeof fetch;
  url?: string;
} = {}): Promise<BetwaySnapshot> {
  const capturedAt = options.capturedAt ?? new Date();
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const pageLimit = options.pageLimit ?? PAGE_LIMIT;
  const runBudgetMs = options.runBudgetMs ?? 120_000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = options.url ?? BETWAY_UPCOMING_API_URL;
  if (!Number.isFinite(capturedAt.getTime())) throw new Error('capturedAt must be valid');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE) {
    throw new Error(`pageSize must be between 1 and ${PAGE_SIZE}`);
  }
  if (!Number.isInteger(pageLimit) || pageLimit < 1) throw new Error('pageLimit must be positive');

  const startedAt = Date.now();
  const fixtures: BetwayFixture[] = [];
  const seen = new Set<string>();
  let pagesCaptured = 0;
  let sourceEventCount = 0;
  let paginationOffset = 0;
  let excludedEventCount = 0;
  let reachedFinalPage = false;

  for (let pageNumber = 0; pageNumber < pageLimit; pageNumber += 1) {
    const remaining = runBudgetMs - (Date.now() - startedAt);
    if (remaining < 2_000) throw new IncompleteSnapshotError('Betway run budget expired before the final page');
    const skip = paginationOffset;
    let response: Response;
    try {
      response = await fetchImpl(requestUrl(url, skip, pageSize), {
        headers: { Accept: 'application/json', Referer: BETWAY_UPCOMING_URL },
        signal: AbortSignal.timeout(Math.max(1_000, Math.min(30_000, remaining - 1_000))),
      });
    } catch (error) {
      throw new IncompleteSnapshotError(`Betway API request failed at offset ${skip}: ${String(error)}`);
    }
    if (!response.ok) throw new IncompleteSnapshotError(`Betway API returned HTTP ${response.status} at offset ${skip}`);
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new IncompleteSnapshotError(`Betway API response was not valid JSON at offset ${skip}: ${String(error)}`);
    }
    const page = validateBetwayPage(body, skip);
    const ids = page.events.map(eventId);
    const pageIdSet = new Set<string>();
    const pageDuplicates = ids.filter((id) => {
      if (pageIdSet.has(id)) return true;
      pageIdSet.add(id);
      return false;
    });
    if (pageDuplicates.length) {
      throw new IncompleteSnapshotError(`Repeated Betway event IDs within offset ${skip}: ${[...new Set(pageDuplicates)].sort().join(', ')}`);
    }
    if (page.events.length === 0 && (pageNumber !== 0 || !page.isFinalPage)) {
      throw new IncompleteSnapshotError(`Betway API returned an empty page at offset ${skip}; refusing to infer removals`);
    }
    const pageIndex = indexBetwayPage(page);
    for (const event of page.events) {
      if (seen.has(eventId(event))) continue;
      const fixture = parseFixture(pageIndex, event, capturedAt);
      if (fixture) fixtures.push(fixture);
      else excludedEventCount += 1;
    }
    ids.forEach((id) => seen.add(id));
    paginationOffset += page.events.length;
    sourceEventCount = seen.size;
    pagesCaptured += 1;
    if (page.isFinalPage) {
      reachedFinalPage = true;
      break;
    }
  }
  if (!reachedFinalPage) throw new IncompleteSnapshotError(`Betway page limit ${pageLimit} reached before the final page`);
  if (fixtures.length === 0 && sourceEventCount > 0) {
    throw new IncompleteSnapshotError('Betway API completed without any eligible pre-match soccer fixtures');
  }
  return {
    bookmaker: 'Betway', source_url: url, captured_at: capturedAt.toISOString(), complete: true,
    pages_captured: pagesCaptured, source_event_count: sourceEventCount,
    excluded_event_count: excludedEventCount, fixtures,
  };
}

export async function captureBetwaySnapshotWithRetries(options: {
  capturedAt?: Date;
  runBudgetMs?: number;
  maxAttempts?: number;
  fetchImpl?: typeof fetch;
  url?: string;
} = {}): Promise<BetwaySnapshot> {
  const startedAt = Date.now();
  const runBudgetMs = options.runBudgetMs ?? 120_000;
  const maxAttempts = options.maxAttempts ?? 3;
  let lastError: unknown;
  const completePasses: BetwaySnapshot[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const remaining = runBudgetMs - (Date.now() - startedAt);
    if (remaining < 5_000) break;
    try {
      const pass = await captureBetwaySnapshot({
        capturedAt: options.capturedAt,
        runBudgetMs: remaining,
        fetchImpl: options.fetchImpl,
        url: options.url,
      });
      completePasses.push(pass);
      if (completePasses.length === 2) {
        const fixtures = new Map<string, BetwayFixture>();
        for (const snapshot of completePasses) {
          for (const fixture of snapshot.fixtures) fixtures.set(fixture.provider_event_id, fixture);
        }
        const latest = completePasses[completePasses.length - 1];
        return {
          ...latest,
          pages_captured: completePasses.reduce((total, snapshot) => total + snapshot.pages_captured, 0),
          source_event_count: Math.max(...completePasses.map((snapshot) => snapshot.source_event_count)),
          excluded_event_count: Math.max(...completePasses.map((snapshot) => snapshot.excluded_event_count)),
          fixtures: [...fixtures.values()],
        };
      }
    } catch (error) {
      lastError = error;
      if (!(error instanceof IncompleteSnapshotError) || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError ?? new IncompleteSnapshotError('Betway could not complete two stabilization passes within the run budget');
}
