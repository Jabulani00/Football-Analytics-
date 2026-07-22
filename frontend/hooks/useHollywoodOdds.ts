import { useEffect, useState } from 'react';

import { buildFusionRows, type FusionRow } from '@/services/hollywoodFusion';
import { BET_TYPE, fetchEvents, type HbEvent } from '@/services/hollywoodbets';

type State = { rows: FusionRow[]; events: HbEvent[]; loading: boolean; error: string | null };

const EMPTY: State = { rows: [], events: [], loading: false, error: null };

/**
 * Loads live Hollywoodbets 1X2 odds for a soccer tournament and turns them into
 * odds-fusion rows (decimal odds, de-vigged fair probabilities, Share-A-Bet
 * legs). Pass a `modelProbFor` to fuse in your own model probabilities for a
 * real betting edge; omit it and the rows use the book's own fair prices.
 */
export function useHollywoodOdds(
  ctx: { categoryId: number; tournamentId: number; tournamentName: string; countryId: number } | null,
  modelProbFor?: (event: HbEvent) => { home: number; draw: number; away: number } | null,
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
        const events = await fetchEvents(ctx.categoryId, ctx.tournamentId, BET_TYPE.FULL_TIME, controller.signal);
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
