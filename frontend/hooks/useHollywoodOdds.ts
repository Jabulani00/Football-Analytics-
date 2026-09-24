import { useEffect, useState } from 'react';

import { buildFusionRows, type FusionRow } from '@/services/hollywoodFusion';
import {
  CORE_BET_TYPE_IDS,
  fetchEventsAllMarkets,
  type HbEvent,
} from '@/services/hollywoodbets';

type State = { rows: FusionRow[]; events: HbEvent[]; loading: boolean; error: string | null };

const EMPTY: State = { rows: [], events: [], loading: false, error: null };

/**
 * Loads live Hollywoodbets odds for a soccer tournament and turns them into
 * odds-fusion rows (decimal odds, de-vigged fair probabilities, Share-A-Bet
 * legs). Pass a `modelProbFor` to fuse in your own model probabilities for a
 * real betting edge; omit it and rows report `hasModel: false`.
 *
 * `betTypeIds` defaults to `CORE_BET_TYPE_IDS` — 1X2, BTTS, Over/Under, correct
 * score, double chance and HT/FT — because the value rules in the analysis notes
 * need all of them, not just 1X2. Hollywood serves one market per request, so
 * this costs one round trip per id; narrow the list if latency matters more than
 * coverage. `state.events` carries every market that came back, readable with
 * `marketOdds` / `bttsDecimal` / `totalsDecimal`.
 */
export function useHollywoodOdds(
  ctx: { categoryId: number; tournamentId: number; tournamentName: string; countryId: number } | null,
  modelProbFor?: (event: HbEvent) => { home: number; draw: number; away: number } | null,
  betTypeIds: readonly number[] = CORE_BET_TYPE_IDS,
): State {
  const [state, setState] = useState<State>(EMPTY);

  useEffect(() => {
    if (!ctx) {
      setState(EMPTY);
      return;
    }
    const controller = new AbortController();
    setState({ ...EMPTY, loading: true });

    (async () => {
      try {
        const events = await fetchEventsAllMarkets(
          ctx.categoryId,
          ctx.tournamentId,
          betTypeIds,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const rows = buildFusionRows(
          events,
          { tournamentId: ctx.tournamentId, tournamentName: ctx.tournamentName, countryId: ctx.countryId },
          modelProbFor,
        );
        setState({ rows, events, loading: false, error: null });
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({ ...EMPTY, error: err instanceof Error ? err.message : 'Failed to load Hollywoodbets odds.' });
      }
    })();

    return () => controller.abort();
    // modelProbFor is intentionally excluded — callers should memoize it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.categoryId, ctx?.tournamentId, ctx?.tournamentName, ctx?.countryId]);

  return state;
}
