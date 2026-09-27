import { useEffect, useState } from 'react';

import {
  computeTieredTables,
  fetchSeasonResults,
  fetchSeasonStandings,
  type Competition,
  type StandingRow,
  type TieredTables,
} from '@/services/oddAlerts';
import { buildMatchFeed, type MatchFeed } from '@/utils/leagueTables';

type State = {
  standings: StandingRow[];
  tiered: TieredTables | null;
  /** Per-team finished results — what every analytics table is counted from. */
  feed: MatchFeed | null;
  loading: boolean;
  error: string | null;
};

const empty: State = {
  standings: [],
  tiered: null,
  feed: null,
  loading: false,
  error: null,
};

/**
 * Loads a season's standings, then the (heavier) season results behind the
 * tiered green/yellow/red tables and the league-table analytics. Both share one
 * cached fetch in `fetchSeasonResults`.
 */
export function useStandings(competition: Competition | null, seasonId: number | null): State {
  const [state, setState] = useState<State>(empty);

  useEffect(() => {
    if (!competition || seasonId == null) {
      setState(empty);
      return;
    }
    const season = competition.seasons.find((s) => s.seasonId === seasonId);
    const controller = new AbortController();
    setState({ ...empty, loading: true });

    (async () => {
      try {
        const standings = await fetchSeasonStandings(seasonId, controller.signal);
        if (controller.signal.aborted) return;
        setState({ ...empty, standings });

        // The derived tables need the full season results — fetch in the
        // background so the plain table is on screen immediately.
        if (season && standings.length > 0) {
          const opts = { competitionId: competition.id, season, standings };
          fetchSeasonResults(opts, controller.signal)
            .then((results) => {
              if (controller.signal.aborted) return;
              const feed = buildMatchFeed({
                competitionId: competition.id,
                seasonId,
                standings: standings.map((r) => ({
                  teamId: r.teamId,
                  name: r.name,
                  rank: r.rank,
                })),
                results,
              });
              setState((s) => ({ ...s, feed }));
            })
            .catch(() => {});
          computeTieredTables(opts, controller.signal)
            .then((tiered) => {
              if (!controller.signal.aborted) setState((s) => ({ ...s, tiered }));
            })
            .catch(() => {});
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({
          ...empty,
          error: err instanceof Error ? err.message : 'Failed to load standings.',
        });
      }
    })();

    return () => controller.abort();
  }, [competition, seasonId]);

  return state;
}
