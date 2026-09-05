import { useEffect, useState } from 'react';

import {
  fetchAllFixturesBetween,
  normaliseStatus,
  seasonWindowUnix,
  type Competition,
  type Season,
} from '@/services/oddAlerts';
import type { SeasonMatch } from '@/utils/bhozomaEngine';

type State = {
  matches: SeasonMatch[];
  loading: boolean;
  error: string | null;
};

/**
 * Finished same-competition fixtures for a season — fuels Bhozoma / Imbanpi.
 * Only runs when `enabled` so league/tier tabs stay untouched and cheap.
 */
export function useSeasonFixtures(
  competition: Competition | null,
  season: Season | null | undefined,
  enabled: boolean,
): State {
  const [state, setState] = useState<State>({
    matches: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!enabled || !competition || !season) {
      setState({ matches: [], loading: false, error: null });
      return;
    }

    const ctrl = new AbortController();
    setState({ matches: [], loading: true, error: null });

    const { fromUnix, toUnix } = seasonWindowUnix(season.seasonName);
    fetchAllFixturesBetween(
      {
        fromUnix,
        toUnix,
        competitions: String(competition.id),
        maxPages: 8,
      },
      ctrl.signal,
    )
      .then((raw) => {
        if (ctrl.signal.aborted) return;
        const matches: SeasonMatch[] = [];
        for (const f of raw) {
          if (normaliseStatus(f.status) !== 'FT') continue;
          if (f.home_id == null || f.away_id == null) continue;
          if (f.home_goals == null || f.away_goals == null) continue;
          if (f.season_id != null && f.season_id !== season.seasonId) continue;
          matches.push({
            homeId: f.home_id,
            awayId: f.away_id,
            homeGoals: f.home_goals,
            awayGoals: f.away_goals,
            unix: f.unix,
          });
        }
        setState({ matches, loading: false, error: null });
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setState({
          matches: [],
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load season fixtures.',
        });
      });

    return () => ctrl.abort();
  }, [enabled, competition?.id, season?.seasonId, season?.seasonName]);

  return state;
}
