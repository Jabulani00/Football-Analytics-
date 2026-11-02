import { useCallback, useEffect, useState } from 'react';
import { useHollywoodNav } from '@/hooks/useHollywoodNav';
import { mergeCompetitionEvents } from '@/services/hollywoodFusionView';

import {
  buildMarketRows,
  buildFusionRows,
  type FusionRow,
  type MarketRow,
  type ModelProbs,
} from '@/services/hollywoodFusion';
import { pairFixturesToEvents } from '@/services/hollywoodHunt';
import {
  BET_TYPE,
  CORE_BET_TYPE_IDS,
  fetchEvents,
  fetchEventsAllMarkets,
  type HbEvent,
} from '@/services/hollywoodbets';
import {
  fetchAllUpcomingFixtures,
  fetchAllUpcomingValue,
  fetchAllFixturesBetween,
  fetchBookmakers,
  fetchFixtureDetail,
  fetchSeasonStandings,
  type RawFixtureDetail,
  type StandingRow,
} from '@/services/oddAlerts';
import {
  mergeProviderBookmakers,
  normalizeOddAlertsValueBet,
  PRIORITY_BOOKMAKERS,
  compareHollywoodWithProvider,
  type BookmakerCatalogItem,
  type CrossBookComparison,
  type NormalizedBookmakerOffer,
} from '@/services/bookmakerAdapter';
import { predictionFromApiProbability } from '@/utils/apiRecommendationAdapter';
import type { StrategyFixtureContext } from '@/services/strategyEngine';

type Probs = ModelProbs;

export type HollywoodPopularOddsState = {
  events: HbEvent[];
  observedAt: string | null;
  navigation: ReturnType<typeof useHollywoodNav>;
  categoryId: number | null;
  tournamentId: number | null;
  selectCategory: (id: number) => void;
  selectTournament: (id: number) => void;
  refresh: () => void;
  enriching: boolean;
  warning: string | null;
  fixtureCount: number;
  pricedFixtureCount: number;
  modelFixtureCount: number;
  strategyFixtureCount: number;
  rows: FusionRow[];
  /** One row per market selection we can price — the value view. */
  marketRows: MarketRow[];
  source: { tournamentName: string; categoryName: string } | null;
  bookmakers: BookmakerCatalogItem[];
  extraOffers: NormalizedBookmakerOffer[];
  comparisons: CrossBookComparison[];
  strategyContexts: Map<number, StrategyFixtureContext>;
  loading: boolean;
  error: string | null;
};

type OddsData = Omit<HollywoodPopularOddsState,
  'navigation' | 'categoryId' | 'tournamentId' | 'selectCategory' | 'selectTournament' | 'refresh'>;

const EMPTY: OddsData = {
  events: [],
  observedAt: null,
  enriching: false,
  warning: null,
  fixtureCount: 0,
  pricedFixtureCount: 0,
  modelFixtureCount: 0,
  strategyFixtureCount: 0,
  rows: [],
  marketRows: [],
  source: null,
  bookmakers: PRIORITY_BOOKMAKERS,
  extraOffers: [],
  comparisons: [],
  strategyContexts: new Map(),
  loading: false,
  error: null,
};

/**
 * Ceiling on per-fixture detail calls. Model probabilities are only available
 * one fixture at a time (`include=probability`), so this is a hard cap on the
 * request burst rather than a tuning knob — rows beyond it simply render with
 * no model, which the panel shows as "—".
 */
const MAX_MODEL_LOOKUPS = 12;
const MAX_STRATEGY_CONTEXTS = 6;

type ModelEvidenceBundle = {
  models: Map<number, Probs>;
  strategyContexts: Map<number, StrategyFixtureContext>;
};

/**
 * Resolve our model's 1X2 probabilities for a set of Hollywoodbets events.
 *
 * The two providers share no ids, so events are paired to our fixtures through
 * the Section 10 matcher (`pairFixturesToEvents`) — which is what enforces the
 * country gate, kick-off tolerance and the squad-tier rules, so a reserve side
 * can never pick up the senior fixture's model.
 *
 * Fetches are sequential and capped: an unmatched or unfetched event yields no
 * entry, and `buildFusionRows` reports that as "no model" rather than a zero.
 */
async function modelProbsForEvents(
  events: HbEvent[],
  signal: AbortSignal,
): Promise<ModelEvidenceBundle> {
  const models = new Map<number, Probs>();
  const strategyContexts = new Map<number, StrategyFixtureContext>();

  const fixtures = await fetchAllUpcomingFixtures({ days: 3, maxPages: 2 }, signal);
  if (fixtures.length === 0) return { models, strategyContexts };

  const keyed = fixtures.map((f) => ({
    homeName: f.home_name,
    awayName: f.away_name,
    kickoffUnix: f.unix,
    country: f.competition_country,
    league: f.competition_name,
    fixtureId: f.id,
    raw: f,
  }));

  const pairs = pairFixturesToEvents(keyed, events).slice(0, MAX_MODEL_LOOKUPS);
  const details: { eventId: number; detail: RawFixtureDetail }[] = [];

  for (const pair of pairs) {
    if (signal.aborted) return { models, strategyContexts };
    let detail;
    try {
      detail = await fetchFixtureDetail(pair.fixture.fixtureId, signal);
    } catch {
      continue; // one bad fixture must not sink the panel
    }
    if (!detail) continue;
    details.push({ eventId: pair.event.id, detail });
    if (detail.probability) {
      const p = predictionFromApiProbability(detail.probability);
      const rawOver05 = detail.probability.o05;
      models.set(pair.event.id, {
        home: p.homeWin,
        draw: p.draw,
        away: p.awayWin,
        btts: p.btts,
        over05: typeof rawOver05 === 'number' && Number.isFinite(rawOver05) ? rawOver05 / 100 : undefined,
        over15: p.over15,
        over25: p.over25,
        over35: p.over35,
      });
    }
  }

  const standingsCache = new Map<string, Promise<StandingRow[]>>();
  for (const item of details.slice(0, MAX_STRATEGY_CONTEXTS)) {
    if (signal.aborted) return { models, strategyContexts };
    const detail = item.detail;
    let standings: StandingRow[] = [];
    let recentFixtures = [] as Awaited<ReturnType<typeof fetchAllFixturesBetween>>;
    try {
      if (detail.season_id != null) {
        const key = String(detail.season_id);
        let pending = standingsCache.get(key);
        if (!pending) {
          pending = fetchSeasonStandings(detail.season_id, signal);
          standingsCache.set(key, pending);
        }
        standings = await pending;
      }
      const teamIds = [detail.home_id, detail.away_id].filter((id): id is number => id != null);
      if (teamIds.length > 0) {
        const now = Math.floor(Date.now() / 1000);
        recentFixtures = await fetchAllFixturesBetween(
          {
            fromUnix: now - 370 * 24 * 60 * 60,
            toUnix: now,
            teams: teamIds.join(','),
            maxPages: 4,
          },
          signal,
        );
      }
    } catch {
      // Retain the detail/H2H even when a supporting endpoint is unavailable.
    }
    strategyContexts.set(item.eventId, { detail, standings, recentFixtures });
  }

  return { models, strategyContexts };
}

/** Browse the same country/competition tree as Hollywood; never silently pick a league. */
export function useHollywoodPopularOdds(enabled = true): HollywoodPopularOddsState {
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [tournamentId, setTournamentId] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<OddsData>(EMPTY);
  const navigation = useHollywoodNav(categoryId, enabled);
  const category = navigation.categories.find((item) => item.id === categoryId);
  const tournament = navigation.tournaments.find((item) => item.id === tournamentId);

  const selectCategory = useCallback((id: number) => {
    setCategoryId(id);
    setTournamentId(null);
    setState(EMPTY);
  }, []);
  const selectTournament = useCallback((id: number) => {
    setTournamentId(id);
    setState(EMPTY);
  }, []);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!enabled || !category || !tournament) {
      setState(EMPTY);
      return;
    }
    const controller = new AbortController();
    const signal = controller.signal;
    const ctx = { tournamentId: tournament.id, tournamentName: tournament.name, countryId: category.id };
    const source = { tournamentName: tournament.name, categoryName: category.name };
    setState({ ...EMPTY, source, loading: true });

    void (async () => {
      try {
        // Require a successful listing request: a transport failure is not an empty competition.
        const initial = await fetchEvents(category.id, tournament.id, BET_TYPE.FULL_TIME, signal);
        if (signal.aborted) return;
        const initialRows = buildFusionRows(initial, ctx);
        const observedAt = new Date().toISOString();
        setState({ ...EMPTY, source, events: initial, observedAt, rows: initialRows,
          marketRows: initial.flatMap((event) => buildMarketRows(event, null, ctx)),
          fixtureCount: initial.length, pricedFixtureCount: initialRows.length,
          loading: true });

        // Keep every fixture returned for this competition, including those without model evidence.
        const widened = await fetchEventsAllMarkets(category.id, tournament.id, CORE_BET_TYPE_IDS, signal);
        if (signal.aborted) return;
        const events = mergeCompetitionEvents(initial, widened);
        const rows = buildFusionRows(events, ctx);
        const marketRows = events.flatMap((event) => buildMarketRows(event, null, ctx));
        const pricedFixtureCount = new Set(marketRows.map((row) => row.eventId)).size;
        setState({ ...EMPTY, source, events, observedAt, rows, marketRows,
          fixtureCount: events.length, pricedFixtureCount, enriching: events.length > 0 });
        if (events.length === 0) return;

        // Optional evidence must not delay the display of Hollywood's own prices.
        const [evidence, books, offers] = await Promise.allSettled([
          modelProbsForEvents(events, signal),
          fetchBookmakers(signal),
          fetchAllUpcomingValue({ maxPages: 5 }, signal),
        ]);
        if (signal.aborted) return;
        const bundle = evidence.status === 'fulfilled' ? evidence.value : null;
        const extraOffers = offers.status === 'fulfilled'
          ? offers.value.flatMap(normalizeOddAlertsValueBet) : [];
        const lookup = (event: HbEvent) => bundle?.models.get(event.id) ?? null;
        const enrichedRows = events.flatMap((event) => buildMarketRows(event, lookup(event), ctx));
        setState({
          ...EMPTY, source, events, observedAt,
          rows: buildFusionRows(events, ctx, lookup), marketRows: enrichedRows,
          fixtureCount: events.length, pricedFixtureCount,
          modelFixtureCount: bundle?.models.size ?? 0,
          strategyFixtureCount: bundle?.strategyContexts.size ?? 0,
          strategyContexts: bundle?.strategyContexts ?? new Map(),
          bookmakers: books.status === 'fulfilled' ? mergeProviderBookmakers(books.value) : PRIORITY_BOOKMAKERS,
          extraOffers,
          comparisons: compareHollywoodWithProvider(enrichedRows, extraOffers),
          warning: evidence.status === 'rejected'
            ? 'Model evidence could not be loaded. Hollywood prices are still available.' : null,
        });
      } catch (error) {
        if (!signal.aborted) setState({ ...EMPTY, source,
          error: error instanceof Error ? error.message : 'Could not load this Hollywood competition.' });
      }
    })();
    return () => controller.abort();
  }, [enabled, category, tournament, revision]);

  return { ...state, navigation, categoryId, tournamentId, selectCategory, selectTournament, refresh };
}
