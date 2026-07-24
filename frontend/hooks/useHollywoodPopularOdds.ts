import { useEffect, useState } from 'react';

import { buildFusionRows, type FusionRow } from '@/services/hollywoodFusion';
import {
  BET_TYPE,
  fetchEvents,
  fetchSoccerCategories,
  fetchTournaments,
} from '@/services/hollywoodbets';

type State = {
  rows: FusionRow[];
  source: { tournamentName: string; categoryName: string } | null;
  loading: boolean;
  error: string | null;
};

const EMPTY: State = { rows: [], source: null, loading: false, error: null };

/**
 * Self-navigating live odds: walks the Hollywoodbets soccer tree (categories →
 * tournaments → events) and returns fusion rows for the first tournament that
 * has priced events. No hardcoded (volatile) IDs. Callers should fall back to
 * sample data when `rows` is empty (e.g. when the network is unavailable).
 */
export function useHollywoodPopularOdds(enabled = true): State {
  const [state, setState] = useState<State>(EMPTY);

  useEffect(() => {
    if (!enabled) {
      setState(EMPTY);
      return;
    }
    const controller = new AbortController();
    setState({ ...EMPTY, loading: true });

    (async () => {
      try {
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
            const rows = buildFusionRows(
              events,
              { tournamentId: tournament.id, tournamentName: tournament.name, countryId: category.id },
            );
            if (rows.length > 0) {
              setState({
                rows,
                source: { tournamentName: tournament.name, categoryName: category.name },
                loading: false,
                error: null,
              });
              return;
            }
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
