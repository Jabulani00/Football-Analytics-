export type PinnacleOddsRow = {
  fixture_id: number;
  market_key?: string;
  market_id?: number | string;
  outcome?: string;
  bet?: string;
  selection?: string;
  odds?: number | string | null;
  opening?: number | string | null;
  closing?: number | string | null;
  peak?: number | string | null;
  unix?: number;
  datetime?: string;
  bookmaker_id?: number | string;
  bookmaker_name?: string;
  bookmaker_slug?: string;
  [key: string]: unknown;
};

export type PinnacleMarketCatalogEntry = {
  id?: number | string;
  market_id?: number | string;
  key?: string;
  market_key?: string;
  name?: string;
  title?: string;
  title_short?: string;
};

export type PinnacleFixtureMatch = {
  eventId: number;
  fixture: string;
  kickoff: string;
  oddAlertsFixtureId: number;
};

export type PinnacleSelectionPrice = {
  key: string;
  label: string;
  current: number | null;
  opening: number | null;
  closing: number | null;
  peak: number | null;
};

export type PinnacleMarketOdds = {
  marketId: number | null;
  marketKey: string;
  marketName: string;
  selections: PinnacleSelectionPrice[];
};

export type PinnacleFixtureOdds = PinnacleFixtureMatch & {
  markets: PinnacleMarketOdds[];
  latestPriceAt: string | null;
};

export type PinnacleOddsEnvelope = {
  data: PinnacleOddsRow[];
  info?: Record<string, unknown>;
};

export type PinnacleUpcomingScan = {
  rows: PinnacleOddsRow[];
  pagesFetched: number;
  truncated: boolean;
};

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function marketKey(entry: PinnacleMarketCatalogEntry): string | null {
  const value = entry.market_key ?? entry.key;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Use the live OddAlerts catalog rather than assuming a fixed set of markets. */
export function pinnacleMarketFilters(
  catalog: readonly PinnacleMarketCatalogEntry[],
): { upcoming: (string | number)[]; history: number[] } {
  const upcoming = new Set<string | number>();
  const history = new Set<number>();

  for (const entry of catalog) {
    const id = positiveInteger(entry.market_id ?? entry.id);
    const key = marketKey(entry);
    if (id != null) {
      upcoming.add(id);
      history.add(id);
    } else if (key) {
      upcoming.add(key);
    }
  }

  return { upcoming: [...upcoming], history: [...history] };
}

/** Bound board pagination and stop once all target fixture IDs have appeared. */
export async function collectPinnacleUpcomingPages(
  fetchPage: (page: number) => Promise<PinnacleOddsEnvelope>,
  targetFixtureIds: ReadonlySet<number>,
  maxPages: number,
): Promise<PinnacleUpcomingScan> {
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) {
    throw new RangeError('maxPages must be a positive integer.');
  }
  if (targetFixtureIds.size === 0) {
    return { rows: [], pagesFetched: 0, truncated: false };
  }

  const rows: PinnacleOddsRow[] = [];
  const foundFixtureIds = new Set<number>();

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await fetchPage(page);
    rows.push(...response.data);
    for (const row of response.data) {
      if (targetFixtureIds.has(row.fixture_id)) foundFixtureIds.add(row.fixture_id);
    }

    if (foundFixtureIds.size === targetFixtureIds.size) {
      return { rows, pagesFetched: page, truncated: false };
    }

    const nextPageUrl = response.info?.next_page_url;
    if (typeof nextPageUrl !== 'string' || nextPageUrl.length === 0) {
      return { rows, pagesFetched: page, truncated: false };
    }
    if (page === maxPages) {
      return { rows, pagesFetched: page, truncated: true };
    }
  }

  return { rows, pagesFetched: maxPages, truncated: false };
}

export function pinnacleOddsWindow(
  kickoffs: readonly string[],
  toleranceSeconds: number,
): { from: number; to: number } | null {
  if (!Number.isSafeInteger(toleranceSeconds) || toleranceSeconds < 0) {
    throw new RangeError('toleranceSeconds must be a non-negative integer.');
  }

  const kickoffSeconds = kickoffs
    .map((kickoff) => Date.parse(kickoff) / 1000)
    .filter(Number.isFinite);
  if (kickoffSeconds.length === 0) return null;

  return {
    from: Math.max(1, Math.floor(Math.min(...kickoffSeconds)) - toleranceSeconds),
    to: Math.ceil(Math.max(...kickoffSeconds)) + toleranceSeconds,
  };
}

function finitePrice(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}

function isPinnacle(row: PinnacleOddsRow, pinnacleBookmakerId?: number): boolean {
  const slug = row.bookmaker_slug?.trim().toLowerCase();
  if (slug) return slug === 'pinnacle';

  const bookmakerId = positiveInteger(row.bookmaker_id);
  if (bookmakerId != null && pinnacleBookmakerId != null) {
    return bookmakerId === pinnacleBookmakerId;
  }
  return row.bookmaker_name?.trim().toLowerCase() === 'pinnacle';
}

function selectionValue(row: PinnacleOddsRow): string | null {
  const value = row.outcome ?? row.bet ?? row.selection;
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().replace(/\s+/g, ' ');
}

function selectionLine(row: PinnacleOddsRow): string | null {
  for (const value of [row.line, row.handicap, row.total, row.specifier]) {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function marketInfo(
  row: PinnacleOddsRow,
  byId: ReadonlyMap<number, PinnacleMarketCatalogEntry>,
  byKey: ReadonlyMap<string, PinnacleMarketCatalogEntry>,
): { id: number | null; key: string; name: string } {
  const rowId = positiveInteger(row.market_id);
  const rowKey = typeof row.market_key === 'string' ? row.market_key.trim() : '';
  const entry = (rowId != null ? byId.get(rowId) : undefined)
    ?? (rowKey ? byKey.get(rowKey.toLowerCase()) : undefined);
  const id = rowId ?? (entry ? positiveInteger(entry.market_id ?? entry.id) : null);
  const key = rowKey || (entry ? marketKey(entry) : null) || (id != null ? `market_${id}` : 'unknown_market');
  const name = entry?.title_short || entry?.title || entry?.name || key;
  return { id, key, name };
}

function marketIdentityFromInfo(info: { id: number | null; key: string }): string {
  return info.id != null ? String(info.id) : info.key.toLowerCase();
}

function selectionIdentity(row: PinnacleOddsRow, selection: string): string {
  return `${selection.toLowerCase()}|${selectionLine(row)?.toLowerCase() ?? ''}`;
}

function selectionLabel(row: PinnacleOddsRow, selection: string): string {
  const line = selectionLine(row);
  if (!line || selection.toLowerCase().includes(line.toLowerCase())) return selection;
  return `${selection} (${line})`;
}

/** Join Pinnacle market rows to the already-matched OddAlerts fixture IDs. */
export function buildPinnacleFixtureOdds(
  matchedFixtures: readonly PinnacleFixtureMatch[],
  currentRows: readonly PinnacleOddsRow[],
  historyRows: readonly PinnacleOddsRow[],
  catalog: readonly PinnacleMarketCatalogEntry[],
  pinnacleBookmakerId?: number,
): PinnacleFixtureOdds[] {
  const fixtures = new Map<number, PinnacleFixtureOdds>();
  for (const match of matchedFixtures) {
    if (!fixtures.has(match.eventId)) {
      fixtures.set(match.eventId, { ...match, markets: [], latestPriceAt: null });
    }
  }

  const fixtureByProviderId = new Map(
    [...fixtures.values()].map((fixture) => [fixture.oddAlertsFixtureId, fixture]),
  );
  const byId = new Map<number, PinnacleMarketCatalogEntry>();
  const byKey = new Map<string, PinnacleMarketCatalogEntry>();
  for (const entry of catalog) {
    const id = positiveInteger(entry.market_id ?? entry.id);
    const key = marketKey(entry);
    if (id != null) byId.set(id, entry);
    if (key) byKey.set(key.toLowerCase(), entry);
  }

  const marketMaps = new Map<number, Map<string, Map<string, PinnacleSelectionPrice>>>();
  const latestUnixBySelection = new Map<string, number>();
  const latestUnixByFixture = new Map<number, number>();

  const getSelection = (
    row: PinnacleOddsRow,
  ): { fixture: PinnacleFixtureOdds; market: PinnacleMarketOdds; selection: PinnacleSelectionPrice } | null => {
    const fixture = fixtureByProviderId.get(row.fixture_id);
    const value = selectionValue(row);
    if (!fixture || !value) return null;

    const info = marketInfo(row, byId, byKey);
    const marketKeyId = marketIdentityFromInfo(info);
    let fixtureMarkets = marketMaps.get(fixture.eventId);
    if (!fixtureMarkets) {
      fixtureMarkets = new Map();
      marketMaps.set(fixture.eventId, fixtureMarkets);
    }
    let selections = fixtureMarkets.get(marketKeyId);
    let market = fixture.markets.find((item) => marketIdentityFromMarket(item) === marketKeyId);
    if (!market) {
      market = {
        marketId: info.id,
        marketKey: info.key,
        marketName: info.name,
        selections: [],
      };
      fixture.markets.push(market);
    }
    if (!selections) {
      selections = new Map();
      fixtureMarkets.set(marketKeyId, selections);
    }
    const line = selectionLine(row);
    const key = selectionIdentity(row, value);
    let selection = selections.get(key);
    if (!selection) {
      selection = {
        key,
        label: selectionLabel(row, value),
        current: null,
        opening: null,
        closing: null,
        peak: null,
      };
      selections.set(key, selection);
      market.selections.push(selection);
    } else if (line && !selection.label.toLowerCase().includes(line.toLowerCase())) {
      selection.label = selectionLabel(row, value);
    }

    return {
      fixture,
      market,
      selection,
    };
  };

  for (const row of currentRows) {
    if (!isPinnacle(row, pinnacleBookmakerId)) continue;
    const price = finitePrice(row.odds);
    if (price == null) continue;
    const match = getSelection(row);
    if (!match) continue;

    const unix = Number.isFinite(row.unix) ? Number(row.unix) : 0;
    const key = `${match.fixture.eventId}:${marketIdentityFromMarket(match.market)}:${match.selection.key}`;
    if (unix < (latestUnixBySelection.get(key) ?? -Infinity)) continue;
    latestUnixBySelection.set(key, unix);
    match.selection.current = price;

    if (row.datetime && unix >= (latestUnixByFixture.get(match.fixture.eventId) ?? -Infinity)) {
      latestUnixByFixture.set(match.fixture.eventId, unix);
      match.fixture.latestPriceAt = row.datetime;
    }
  }

  for (const row of historyRows) {
    if (!isPinnacle(row, pinnacleBookmakerId)) continue;
    const match = getSelection(row);
    if (!match) continue;
    match.selection.opening = finitePrice(row.opening) ?? match.selection.opening;
    match.selection.closing = finitePrice(row.closing) ?? match.selection.closing;
    match.selection.peak = finitePrice(row.peak) ?? match.selection.peak;
  }

  for (const fixture of fixtures.values()) {
    fixture.markets.sort((a, b) => a.marketName.localeCompare(b.marketName));
    for (const market of fixture.markets) {
      market.selections.sort((a, b) => a.label.localeCompare(b.label));
    }
  }

  return [...fixtures.values()];
}

function marketIdentityFromMarket(market: PinnacleMarketOdds): string {
  return market.marketId != null ? String(market.marketId) : market.marketKey.toLowerCase();
}
