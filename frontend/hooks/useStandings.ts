import { useEffect, useState } from 'react';

import {
  computeTierPoints,
  fetchSeasonStandings,
  type Competition,
  type StandingRow,
  type TierPoints,
} from '@/services/oddAlerts';

type State = {
  standings: StandingRow[];
  tier: Map<number, TierPoints> | null;
  loading: boolean;
  error: string | null;
};

/** Loads a season's standings, then the (heavier) points-vs-tier breakdown. */
export function useStandings(competition: Competition | null, seasonId: number | null): State {
  const [state, setState] = useState<State>({
    standings: [],
    tier: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!competition || seasonId == null) {
      setState({ standings: [], tier: null, loading: false, error: null });
      return;
    }
    const season = competition.seasons.find((s) => s.seasonId === seasonId);
    const controller = new AbortController();
    setState({ standings: [], tier: null, loading: true, error: null });

    (async () => {
      try {
        const standings = await fetchSeasonStandings(seasonId, controller.signal);
        if (controller.signal.aborted) return;
        setState({ standings, tier: null, loading: false, error: null });

        // Points-vs-tier needs the full season results — fetch in the background.
        if (season && standings.length > 0) {
          computeTierPoints({ competitionId: competition.id, season, standings }, controller.signal)
            .then((tier) => {
              if (!controller.signal.aborted) setState((s) => ({ ...s, tier }));
            })
            .catch(() => {});
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({
          standings: [],
          tier: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load standings.',
        });
      }
    })();

    return () => controller.abort();
  }, [competition, seasonId]);

  return state;
}
