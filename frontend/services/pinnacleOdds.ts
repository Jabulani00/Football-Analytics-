export type ResultSelection = 'home' | 'draw' | 'away';

export type PinnacleOddsRow = {
  fixture_id: number;
  market_key?: string;
  market_id?: number;
  outcome?: string;
  bet?: string;
  selection?: string;
  odds?: number;
  opening?: number | null;
  closing?: number | null;
  peak?: number | null;
  unix?: number;
  datetime?: string;
  bookmaker_id?: number;
  bookmaker_slug?: string;
};

export type PinnacleFixtureOdds = {
  eventId: number;
  fixture: string;
  kickoff: string;
  oddAlertsFixtureId: number;
  current: Record<ResultSelection, number | null>;
  opening: Record<ResultSelection, number | null>;
  closing: Record<ResultSelection, number | null>;
  peak: Record<ResultSelection, number | null>;
  latestPriceAt: string | null;
};

type MarketSelectionRow = {
  eventId: number;
  fixture: string;
  kickoff: string;
  marketName: string;
  selection: string;
};

function finitePrice(value: unknown): number | null {
  if (typeof value === 'string') value = Number(value);
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? value : null;
}

function resultSelection(value: string | undefined): ResultSelection | null {
  const normalized = value?.trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (normalized === 'home' || normalized === 'home win' || normalized === '1') return 'home';
  if (normalized === 'draw' || normalized === 'x') return 'draw';
  if (normalized === 'away' || normalized === 'away win' || normalized === '2') return 'away';
  return null;
}

function emptyPrices(): Record<ResultSelection, number | null> {
  return { home: null, draw: null, away: null };
}

function isPinnacle(row: PinnacleOddsRow, pinnacleBookmakerId?: number): boolean {
  return row.bookmaker_slug?.toLowerCase() === 'pinnacle'
    || (pinnacleBookmakerId != null && row.bookmaker_id === pinnacleBookmakerId);
}

/** Join Pinnacle's provider fixture IDs to the already-matched Hollywood rows. */
export function buildPinnacleFixtureOdds(
  marketRows: MarketSelectionRow[],
  oddAlertsFixtureByEvent: ReadonlyMap<number, number>,
  currentRows: PinnacleOddsRow[],
  historyRows: PinnacleOddsRow[],
  fullTimeMarketId: number,
  pinnacleBookmakerId?: number,
): PinnacleFixtureOdds[] {
  const fixtures = new Map<number, PinnacleFixtureOdds>();
  for (const row of marketRows) {
    if (row.marketName !== 'Full Time') continue;
    const oddAlertsFixtureId = oddAlertsFixtureByEvent.get(row.eventId);
    if (oddAlertsFixtureId == null) continue;
    if (!fixtures.has(row.eventId)) {
      fixtures.set(row.eventId, {
        eventId: row.eventId,
        fixture: row.fixture,
        kickoff: row.kickoff,
        oddAlertsFixtureId,
        current: emptyPrices(),
        opening: emptyPrices(),
        closing: emptyPrices(),
        peak: emptyPrices(),
        latestPriceAt: null,
      });
    }
  }

  const eventByProviderFixture = new Map(
    [...fixtures.values()].map((fixture) => [fixture.oddAlertsFixtureId, fixture]),
  );
  const latestUnixByKey = new Map<string, number>();
  let latestOverallUnix = -Infinity;

  for (const row of currentRows) {
    if (!isPinnacle(row, pinnacleBookmakerId) || row.market_key !== 'ft_result') continue;
    const fixture = eventByProviderFixture.get(row.fixture_id);
    const outcome = resultSelection(row.outcome ?? row.bet ?? row.selection);
    const price = finitePrice(row.odds);
    if (!fixture || !outcome || price == null) continue;

    const key = `${fixture.eventId}:${outcome}`;
    const unix = Number.isFinite(row.unix) ? Number(row.unix) : 0;
    if (unix < (latestUnixByKey.get(key) ?? -Infinity)) continue;
    latestUnixByKey.set(key, unix);
    fixture.current[outcome] = price;
    if (row.datetime && unix >= latestOverallUnix) {
      latestOverallUnix = unix;
      fixture.latestPriceAt = row.datetime;
    }
  }

  for (const row of historyRows) {
    if (!isPinnacle(row, pinnacleBookmakerId) || row.market_id !== fullTimeMarketId) continue;
    const fixture = eventByProviderFixture.get(row.fixture_id);
    const outcome = resultSelection(row.outcome ?? row.bet ?? row.selection);
    if (!fixture || !outcome) continue;
    fixture.opening[outcome] = finitePrice(row.opening);
    fixture.closing[outcome] = finitePrice(row.closing);
    fixture.peak[outcome] = finitePrice(row.peak);
  }

  return [...fixtures.values()];
}
