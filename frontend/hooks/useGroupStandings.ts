import { useEffect, useState } from 'react';

import {
  fetchAllFixturesBetween,
  seasonWindowUnix,
  type Competition,
} from '@/services/oddAlerts';
import { buildGroupTablesFromFixtures, type GroupTable } from '@/utils/groupStandings';

type State = {
  groups: GroupTable[];
  loading: boolean;
  error: string | null;
};

export function useGroupStandings(
  competition: Competition | null,
  seasonId: number | null,
): State {
  const [state, setState] = useState<State>({ groups: [], loading: false, error: null });

  useEffect(() => {
    if (!competition || seasonId == null) {
      setState({ groups: [], loading: false, error: null });
      return;
    }

    const season = competition.seasons.find((s) => s.seasonId === seasonId);
    const controller = new AbortController();
    setState({ groups: [], loading: true, error: null });

    const { fromUnix, toUnix } = seasonWindowUnix(season?.seasonName ?? '');

    fetchAllFixturesBetween(
      {
        fromUnix,
        toUnix,
        competitions: String(competition.id),
        maxPages: 8,
      },
      controller.signal,
    )
      .then((fixtures) => {
        if (controller.signal.aborted) return;
        const groups = buildGroupTablesFromFixtures(fixtures, seasonId);
        setState({ groups, loading: false, error: groups.length ? null : 'No group-stage data yet.' });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setState({
          groups: [],
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load group tables.',
        });
      });

    return () => controller.abort();
  }, [competition, seasonId]);

  return state;
}
