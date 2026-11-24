export type OddsFilter = string | number;
export type OddAlertsOddsType = 'opening' | 'closing' | 'peak';

export type UpcomingOddsRequestOptions = {
  bookmakers: readonly OddsFilter[];
  markets: readonly OddsFilter[];
  oddsType?: OddAlertsOddsType;
  from?: number;
  to?: number;
  page?: number;
  perPage?: number;
};

export type OddsHistoryRequestOptions = {
  bookmakers: readonly OddsFilter[];
  markets: readonly number[];
};

export type OddAlertsOddsMarket = {
  id?: number | string;
  market_id?: number | string;
  key?: string;
  market_key?: string;
  name?: string;
  title?: string;
  title_short?: string;
  [key: string]: unknown;
};

export type OddAlertsOddsRequest = {
  path: string;
  params: Record<string, string | number | undefined>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** OddAlerts may return the market catalog directly or inside a data envelope. */
export function normalizeOddsMarketCatalogResponse(payload: unknown): OddAlertsOddsMarket[] {
  const rows = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : null;
  if (rows === null) {
    throw new TypeError('OddAlerts odds/markets response must be an array or contain a data array.');
  }

  return rows.map((row, index) => {
    if (!isRecord(row)) {
      throw new TypeError(`OddAlerts odds/markets row ${index} must be an object.`);
    }
    return row;
  });
}

function filterList(values: readonly OddsFilter[], name: string): string {
  if (!values.length) throw new RangeError(`${name} must include at least one value.`);
  const normalized = [...new Set(values.map((value) => String(value).trim()))];
  if (normalized.some((value) => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value))) {
    throw new TypeError(`${name} contains an invalid value.`);
  }
  return normalized.join(',');
}

function requireUnixSeconds(value: number | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive Unix timestamp in seconds.`);
  }
  return value;
}

function requirePage(value: number | undefined, name: string, max?: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 1 || (max !== undefined && value > max)) {
    throw new RangeError(`${name} must be an integer from 1${max ? ` to ${max}` : ''}.`);
  }
  return value;
}

export function buildUpcomingOddsRequest(
  opts: UpcomingOddsRequestOptions,
): OddAlertsOddsRequest {
  const bookmakers = filterList(opts.bookmakers, 'bookmakers');
  const markets = filterList(opts.markets, 'markets');
  const from = requireUnixSeconds(opts.from, 'from');
  const to = requireUnixSeconds(opts.to, 'to');
  const page = requirePage(opts.page, 'page');
  const perPage = requirePage(opts.perPage, 'perPage', 250);
  const oddsType = opts.oddsType ?? 'closing';

  if (from != null && to != null) {
    if (to < from) throw new RangeError('to must be greater than or equal to from.');
    if (to - from > 14 * 24 * 60 * 60) {
      throw new RangeError('Odds upcoming supports date windows of at most 14 days.');
    }
  }
  if (!['opening', 'closing', 'peak'].includes(oddsType)) {
    throw new TypeError('oddsType must be opening, closing, or peak.');
  }

  return {
    path: 'odds/upcoming',
    params: {
      bookmakers,
      markets,
      odds_type: oddsType,
      from,
      to,
      page,
      per_page: perPage,
    },
  };
}

export function buildOddsHistoryRequest(
  fixtureIds: readonly number[],
  opts: OddsHistoryRequestOptions,
): OddAlertsOddsRequest {
  const ids = [...new Set(fixtureIds)];
  if (
    ids.length < 1 ||
    ids.length > 50 ||
    ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
  ) {
    throw new RangeError('fixtureIds must contain 1 to 50 positive fixture IDs.');
  }

  const bookmakers = filterList(opts.bookmakers, 'bookmakers');
  const markets = filterList(opts.markets, 'markets');
  if (opts.markets.some((market) => !Number.isSafeInteger(market) || market <= 0)) {
    throw new RangeError('History market filters must be positive integer market IDs.');
  }

  const isSingle = ids.length === 1;
  return {
    path: isSingle ? `odds/history/${ids[0]}` : 'odds/history/multiple',
    params: {
      ids: isSingle ? undefined : ids.join(','),
      bookmakers,
      markets,
    },
  };
}

export function assertOddAlertsServerProxy(
  platform: string,
  proxyUrl: string,
  path: string,
): void {
  if (platform !== 'web' && !/^https?:\/\//i.test(proxyUrl)) {
    throw new Error(
      `OddAlerts ${path} requires EXPO_PUBLIC_ODDALERTS_PROXY to point to the server proxy.`,
    );
  }
}
