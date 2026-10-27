import type {
  BetwayChange,
  BetwayCrawlRun,
  BetwayEvent,
  BetwayMarket,
  BetwayRemovalEpisode,
  BetwayVerifiedRemoval,
} from '@/services/betwayHunt';

type Row = Record<string, unknown>;
type LiveCapture = {
  capturedAt: string;
  pages: number;
  sourceEvents: number;
  excludedEvents: number;
  events: BetwayEvent[];
};

let directCache: { expiresAt: number; value: Promise<LiveCapture> } | null = null;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function publicSupabaseEnvironment(): { url: string; key: string } | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return url && key ? { url, key } : null;
}

function createReader(environment: { url: string; key: string }) {
  const base = `${environment.url.replace(/\/+$/, '')}/rest/v1`;
  const headers = {
    apikey: environment.key,
    ...(environment.key.startsWith('eyJ')
      ? { Authorization: `Bearer ${environment.key}` }
      : {}),
  };
  return async function read<T>(path: string): Promise<T> {
    const response = await fetch(`${base}${path}`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Supabase Betway read ${path.split('?')[0]}: HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  };
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}

function isEsports(event: Row): boolean {
  const label = [event.region, event.league, event.displayName, event.name]
    .map((value) => String(value ?? ''))
    .join(' ')
    .toLowerCase();
  return ['esoccer', 'e-soccer', 'esports', 'e-sports', 'efootball', 'virtual soccer', 'virtual football']
    .some((marker) => label.includes(marker));
}

function betwayApiUrl(skip: number): string {
  const url = new URL('https://www.betway.co.za/sportsapi/br/v1/BetBook/Upcoming/');
  const values: [string, string][] = [
    ['countryCode', 'ZA'], ['sportId', 'soccer'], ['Skip', String(skip)], ['Take', '50'],
    ['cultureCode', 'en-US'], ['isEsport', 'false'], ['boostedOnly', 'false'],
    ['marketTypes', '[Win/Draw/Win]'],
    ['marketTypes', 'Total Goals'],
    ['marketTypes', '[Both Teams To Score]'],
    ['marketTypes', '[Draw No Bet]'],
    ['marketTypes', 'Correct Score'],
  ];
  for (const [key, value] of values) url.searchParams.append(key, value);
  return url.toString();
}

function eventMarkets(
  eventId: string,
  markets: Row[],
  outcomes: Row[],
  priceByOutcome: Map<string, unknown>,
): BetwayMarket[] {
  return markets
    .filter((market) => String(market.eventId) === eventId && market.isSquashedMarket !== true)
    .flatMap((market): BetwayMarket[] => {
      const marketId = String(market.marketId ?? '').trim();
      if (!marketId) return [];
      const seen = new Set<string>();
      const selections = outcomes
        .filter((outcome) => String(outcome.marketId) === marketId)
        .sort((left, right) => Number(left.index ?? 0) - Number(right.index ?? 0))
        .flatMap((outcome) => {
          const outcomeId = String(outcome.outcomeId ?? '').trim();
          if (!outcomeId || seen.has(outcomeId)) return [];
          seen.add(outcomeId);
          const baseName = String(outcome.displayName ?? outcome.name ?? '').trim();
          const qualifier = String(outcome.sbv ?? '').trim();
          const name = `${baseName}${qualifier ? ` ${qualifier}` : ''}`.replace(/\s+/g, ' ').trim();
          if (!name) return [];
          const price = numberOrNull(priceByOutcome.get(outcomeId));
          const available = outcome.isTradingActive === true && outcome.shouldDisplay === true && price != null;
          return [{ outcome_id: outcomeId, name, odds: available ? price : null, available }];
        });
      if (selections.length === 0) return [];
      const suspended = market.isSuspended === true || market.isActive !== true || market.shouldDisplay !== true;
      const lineValue = Number(market.handicap);
      return [{
        market_id: marketId,
        market_type: String(market.marketTypeCName ?? market.name ?? '').trim(),
        name: String(market.displayName ?? market.name ?? market.marketTypeCName ?? 'Market').trim(),
        line: Number.isFinite(lineValue) && lineValue !== 0 ? lineValue : null,
        open: !suspended && selections.some((selection) => selection.available),
        suspended,
        selections,
      }];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function captureLiveBetway(): Promise<LiveCapture> {
  const capturedAt = new Date();
  const events: BetwayEvent[] = [];
  let skip = 0;
  let pages = 0;
  let sourceEvents = 0;
  let excludedEvents = 0;

  for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
    const response = await fetch(betwayApiUrl(skip), {
      headers: { Accept: 'application/json', Referer: 'https://www.betway.co.za/sport/soccer/upcoming' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Betway API returned HTTP ${response.status}`);
    const body = await response.json() as Row;
    const sourceRows = Array.isArray(body.events) ? body.events as Row[] : null;
    const markets = Array.isArray(body.markets) ? body.markets as Row[] : null;
    const outcomes = Array.isArray(body.outcomes) ? body.outcomes as Row[] : null;
    const prices = Array.isArray(body.prices) ? body.prices as Row[] : null;
    if (!sourceRows || !markets || !outcomes || !prices || typeof body.isFinalPage !== 'boolean') {
      throw new Error('Betway API returned an invalid page');
    }

    const priceByOutcome = new Map(prices.map((price) => [String(price.outcomeId), price.priceDecimal]));
    for (const event of sourceRows) {
      sourceEvents += 1;
      const eventId = String(event.eventId ?? '').trim();
      const epoch = Number(event.expectedStartEpoch);
      const kickoffMs = epoch >= 1_000_000_000_000 ? epoch : epoch * 1_000;
      const home = String(event.homeTeam ?? '').trim();
      const away = String(event.awayTeam ?? '').trim();
      if (
        !eventId || !Number.isFinite(kickoffMs) || kickoffMs <= capturedAt.getTime() ||
        !home || !away || isEsports(event) || event.isOutright === true ||
        event.isLive === true || event.isFinished === true
      ) {
        excludedEvents += 1;
        continue;
      }

      const winDrawMarkets = markets.filter((market) =>
        String(market.eventId) === eventId &&
        String(market.marketTypeCName ?? '').toLowerCase() === 'win-draw-win'
      );
      const market = winDrawMarkets.find((row) =>
        row.isActive === true && row.isSuspended !== true && row.shouldDisplay === true
      ) ?? winDrawMarkets[0];
      const marketId = String(market?.marketId ?? '');
      const selections = outcomes
        .filter((outcome) => String(outcome.marketId) === marketId)
        .sort((left, right) => Number(left.index ?? 0) - Number(right.index ?? 0));
      const named = new Map(selections.map((selection) => [
        String(selection.displayName ?? selection.name ?? '').trim().toLowerCase(), selection,
      ]));
      const ordered = [named.get(home.toLowerCase()), named.get('draw') ?? named.get('the draw') ?? named.get('x'), named.get(away.toLowerCase())]
        .every(Boolean)
        ? [named.get(home.toLowerCase())!, named.get('draw') ?? named.get('the draw') ?? named.get('x')!, named.get(away.toLowerCase())!]
        : selections.slice(0, 3);
      const selectedOdds = ordered.length === 3
        ? ordered.map((selection) =>
          selection.isTradingActive === true && selection.shouldDisplay === true
            ? numberOrNull(priceByOutcome.get(String(selection.outcomeId)))
            : null
        )
        : [null, null, null];
      const fixtureStatus = event.isActive === true && event.shouldDisplay === true ? 'active' : 'suspended';
      const marketSuspended = !market || market.isActive !== true || market.isSuspended === true || market.shouldDisplay !== true;
      const competition = [event.league, event.region].map((value) => String(value ?? '').trim()).filter(Boolean).join(', ') || null;
      events.push({
        provider_event_id: eventId,
        home_team: home,
        away_team: away,
        competition,
        start_time: new Date(kickoffMs).toISOString(),
        fixture_status: fixtureStatus,
        lifecycle_state: fixtureStatus,
        odds_home: selectedOdds[0],
        odds_draw: selectedOdds[1],
        odds_away: selectedOdds[2],
        market_open: fixtureStatus === 'active' && !marketSuspended && selectedOdds.every((value) => value != null),
        market_suspended: marketSuspended,
        missing_count: 0,
        missing_since: null,
        last_seen_at: capturedAt.toISOString(),
        removed_at: null,
        updated_at: capturedAt.toISOString(),
        markets: eventMarkets(eventId, markets, outcomes, priceByOutcome),
      });
    }
    pages += 1;
    skip += sourceRows.length;
    // Live fallback is display-only and never infers removals. One bounded page
    // keeps the Vercel response below its request deadline; the scheduled
    // Supabase worker remains responsible for exhaustive pagination/history.
    if (body.isFinalPage || pageNumber === 0) {
      return { capturedAt: capturedAt.toISOString(), pages, sourceEvents, excludedEvents, events };
    }
    if (sourceRows.length === 0) throw new Error('Betway API returned an incomplete empty page');
  }
  throw new Error('Betway API page limit reached before the final page');
}

function directBetwaySnapshot(): Promise<LiveCapture> {
  if (!directCache || directCache.expiresAt <= Date.now()) {
    directCache = {
      expiresAt: Date.now() + 60_000,
      value: captureLiveBetway(),
    };
    directCache.value.catch(() => {
      directCache = null;
    });
  }
  return directCache.value;
}

async function liveFallback(): Promise<Response> {
  try {
    const captured = await directBetwaySnapshot();
    const currentEvents = captured.events;
    const runs: BetwayCrawlRun[] = [{
      run_id: `live-${captured.capturedAt}`,
      captured_at: captured.capturedAt,
      completed_at: captured.capturedAt,
      status: 'complete',
      pages_captured: captured.pages,
      source_event_count: captured.sourceEvents,
      excluded_event_count: captured.excludedEvents,
      fixture_count: captured.events.length,
    }];
    return json({
      bookmaker: 'Betway',
      historyAvailable: false,
      runs,
      currentEvents,
      verifiedRemovals: [],
      pendingRemovals: [],
      changes: [],
      classifiedEvents: [],
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
}

export async function GET(): Promise<Response> {
  const environment = publicSupabaseEnvironment();
  if (!environment) return liveFallback();
  const read = createReader(environment);
  const now = new Date().toISOString();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const runsQuery = new URLSearchParams({ order: 'captured_at.desc', limit: '10' });
  const currentQuery = new URLSearchParams({
    start_time: `gt.${now}`,
    lifecycle_state: 'in.(active,suspended,pending_removal)',
    order: 'start_time.asc',
    limit: '5000',
  });
  const removedQuery = new URLSearchParams({
    start_time: `gt.${now}`,
    lifecycle_state: 'eq.removed_pre_kickoff',
    order: 'removed_at.desc',
    limit: '500',
  });
  const episodesQuery = new URLSearchParams({
    state: 'in.(pending,confirmed)',
    order: 'last_missing_at.desc',
    limit: '500',
  });
  const changesQuery = new URLSearchParams({
    observed_at: `gte.${since}`,
    order: 'observed_at.desc',
    limit: '200',
  });
  const marketQuery = new URLSearchParams({
    order: 'observed_at.desc',
    limit: '5000',
  });
  const classifiedQuery = new URLSearchParams({
    lifecycle_state: 'in.(started,expired,cancelled,postponed,rescheduled,abandoned)',
    updated_at: `gte.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}`,
    order: 'updated_at.desc',
    limit: '100',
  });

  try {
    const [runs, currentEventsRaw, removedEventsRaw, removalEpisodes, changes, marketRows, classifiedEventsRaw] = await Promise.all([
      read<BetwayCrawlRun[]>(`/bw_public_crawl_run?${runsQuery}`),
      read<BetwayEvent[]>(`/bw_public_event?${currentQuery}`),
      read<BetwayEvent[]>(`/bw_public_event?${removedQuery}`),
      read<BetwayRemovalEpisode[]>(`/bw_public_removal_episode?${episodesQuery}`),
      read<BetwayChange[]>(`/bw_public_change?${changesQuery}`),
      read<{ provider_event_id: string; markets: BetwayMarket[] }[]>(`/bw_public_event_market?${marketQuery}`),
      read<BetwayEvent[]>(`/bw_public_event?${classifiedQuery}`),
    ]);
    const marketsByEvent = new Map(marketRows.map((row) => [row.provider_event_id, row.markets]));
    const withMarkets = (event: BetwayEvent): BetwayEvent => ({
      ...event,
      markets: marketsByEvent.get(event.provider_event_id) ?? [],
    });
    const currentEvents = currentEventsRaw.map(withMarkets);
    const removedEvents = removedEventsRaw.map(withMarkets);
    const classifiedEvents = classifiedEventsRaw.map(withMarkets);
    const removedById = new Map(removedEvents.map((event) => [event.provider_event_id, event]));
    const verifiedRemovals = removalEpisodes
      .filter((episode) => episode.state === 'confirmed' && episode.verification_status === 'verified')
      .map((episode): BetwayVerifiedRemoval | null => {
        const event = removedById.get(episode.provider_event_id);
        return event ? { ...episode, event } : null;
      })
      .filter((episode): episode is BetwayVerifiedRemoval => episode != null);
    const pendingRemovals = removalEpisodes.filter((episode) =>
      episode.state === 'pending' ||
      (episode.state === 'confirmed' && episode.verification_status === 'unverified')
    );
    return json({ bookmaker: 'Betway', historyAvailable: true, runs, currentEvents, verifiedRemovals, pendingRemovals, changes, classifiedEvents });
  } catch (error) {
    console.warn('Betway history read unavailable; using the live public feed.', error);
    return liveFallback();
  }
}

