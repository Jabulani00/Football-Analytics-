import { useEffect, useState } from 'react';

import {
  buildAllMarketRows,
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
  fetchSoccerCategories,
  fetchTournaments,
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

const EMPTY: HollywoodPopularOddsState = {
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

/**
 * Self-navigating live odds: walks the Hollywoodbets soccer tree (categories →
 * tournaments → events) and returns fusion rows for the first tournament that
 * has priced events. No hardcoded (volatile) IDs. Callers should fall back to
 * sample data when `rows` is empty (e.g. when the network is unavailable).
 */
export function useHollywoodPopularOdds(enabled = true): HollywoodPopularOddsState {
  const [state, setState] = useState<HollywoodPopularOddsState>(EMPTY);

  useEffect(() => {
    if (!enabled) {
      setState(EMPTY);
      return;
    }
    const controller = new AbortController();
    setState({ ...EMPTY, loading: true });

    (async () => {
      try {
        let bookmakers = PRIORITY_BOOKMAKERS;
        let extraOffers: NormalizedBookmakerOffer[] = [];
        const [bookResult, valueResult] = await Promise.allSettled([
          fetchBookmakers(controller.signal),
          fetchAllUpcomingValue({ maxPages: 5 }, controller.signal),
        ]);
        if (bookResult.status === 'fulfilled') {
          bookmakers = mergeProviderBookmakers(bookResult.value);
        }
        if (valueResult.status === 'fulfilled') {
          extraOffers = valueResult.value.flatMap(normalizeOddAlertsValueBet);
        }

        const categories = await fetchSoccerCategories(controller.signal);
        // Try categories in order until one yields a tournament with events.
        for (const category of categories.slice(0, 8)) {
          if (controller.signal.aborted) return;
          let tournaments: Awaited<ReturnType<typeof fetchTournaments>>['tournaments'] = [];
          try {
            tournaments = (await fetchTournaments(category.id, controller.signal)).tournaments;
          } catch {
            continue;
          }
          for (const tournament of tournaments.slice(0, 5)) {
            if (controller.signal.aborted) return;
            let events;
            try {
              events = await fetchEvents(category.id, tournament.id, BET_TYPE.FULL_TIME, controller.signal);
            } catch {
              continue;
            }
            const ctx = {
              tournamentId: tournament.id,
              tournamentName: tournament.name,
              countryId: category.id,
            };

            // Cheap first pass: does this tournament have priced events at all?
            // Only then is it worth spending the extra market + model calls.
            const priced = buildFusionRows(events, ctx);
            if (priced.length === 0) continue;

            // Now widen to the markets the value rules need (BTTS, O/U, …).
            let full = events;
            try {
              full = await fetchEventsAllMarkets(
                category.id,
                tournament.id,
                CORE_BET_TYPE_IDS,
                controller.signal,
              );
            } catch {
              // Keep the 1X2-only set rather than dropping the tournament.
            }
            if (controller.signal.aborted) return;

            let models = new Map<number, Probs>();
            let strategyContexts = new Map<number, StrategyFixtureContext>();
            try {
              const bundle = await modelProbsForEvents(full, controller.signal);
              models = bundle.models;
              strategyContexts = bundle.strategyContexts;
            } catch {
              // No model available — rows still render, marked as having none.
            }
            if (controller.signal.aborted) return;

            const lookup = (e: HbEvent) => models.get(e.id) ?? null;
            const rows = buildFusionRows(full, ctx, lookup);
            const marketRows = buildAllMarketRows(full, lookup, ctx);
            const comparisons = compareHollywoodWithProvider(marketRows, extraOffers);
            setState({
              rows,
              marketRows,
              source: { tournamentName: tournament.name, categoryName: category.name },
              bookmakers,
              extraOffers,
              comparisons,
              strategyContexts,
              loading: false,
              error: null,
            });
            return;
          }
        }
        if (!controller.signal.aborted) setState({ ...EMPTY, error: 'No live Hollywoodbets soccer odds available.' });
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({ ...EMPTY, error: err instanceof Error ? err.message : 'Failed to load Hollywoodbets odds.' });
      }
    })();

    return () => controller.abort();
  }, [enabled]);

  return state;
}
