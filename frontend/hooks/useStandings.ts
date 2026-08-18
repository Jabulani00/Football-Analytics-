import { useEffect, useState } from 'react';

import {
  computeTieredTables,
  fetchSeasonStandings,
  type Competition,
  type StandingRow,
  type TieredTables,
} from '@/services/oddAlerts';

type State = {
  standings: StandingRow[];
  tiered: TieredTables | null;
  loading: boolean;
  error: string | null;
};

/** Loads a season's standings, then the (heavier) tiered green/yellow/red tables. */
export function useStandings(competition: Competition | null, seasonId: number | null): State {
  const [state, setState] = useState<State>({
    standings: [],
    tiered: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!competition || seasonId == null) {
      setState({ standings: [], tiered: null, loading: false, error: null });
      return;
    }
    const season = competition.seasons.find((s) => s.seasonId === seasonId);
    const controller = new AbortController();
    setState({ standings: [], tiered: null, loading: true, error: null });

    (async () => {
      try {
        const standings = await fetchSeasonStandings(seasonId, controller.signal);
        if (controller.signal.aborted) return;
        setState({ standings, tiered: null, loading: false, error: null });

        // Tiered tables need the full season results — fetch in the background.
        if (season && standings.length > 0) {
          computeTieredTables({ competitionId: competition.id, season, standings }, controller.signal)
            .then((tiered) => {
              if (!controller.signal.aborted) setState((s) => ({ ...s, tiered }));
            })
            .catch(() => {});
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({
          standings: [],
          tiered: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load standings.',
        });
      }
    })();

    return () => controller.abort();
  }, [competition, seasonId]);

  return state;
}
