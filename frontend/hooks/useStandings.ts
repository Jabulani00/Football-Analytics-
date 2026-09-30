import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  computeTieredTables,
  fetchSeasonResults,
  fetchSeasonStandings,
  type Competition,
  type StandingRow,
  type TieredTables,
} from '@/services/oddAlerts';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { oddAlertsKeys } from '@/services/oddAlertsKeys';
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
  const season =
    competition && seasonId != null
      ? (competition.seasons.find((item) => item.seasonId === seasonId) ?? null)
      : null;
  const enabled = competition != null && seasonId != null;

  const standingsQuery = useQuery({
    queryKey: oddAlertsKeys.seasonStats(seasonId ?? 0),
    queryFn: ({ signal }) => fetchSeasonStandings(seasonId as number, signal),
    enabled,
    staleTime: clientStaleTime('stats/season'),
  });

  const standings = standingsQuery.data ?? [];
  const canDerive = enabled && season != null && standings.length > 0;

  const resultsQuery = useQuery({
    queryKey: ['oddalerts', 'season-results', competition?.id ?? 0, season?.seasonId ?? 0] as const,
    queryFn: ({ signal }) =>
      fetchSeasonResults({ competitionId: competition!.id, season: season! }, signal),
    enabled: canDerive,
    staleTime: clientStaleTime('fixtures/between'),
  });

  const tieredQuery = useQuery({
    queryKey: ['oddalerts', 'tiered-tables', competition?.id ?? 0, season?.seasonId ?? 0] as const,
    queryFn: ({ signal }) =>
      computeTieredTables(
        { competitionId: competition!.id, season: season!, standings },
        signal,
      ),
    enabled: canDerive,
    staleTime: clientStaleTime('fixtures/between'),
  });

  const feed = useMemo(() => {
    if (!canDerive || !resultsQuery.data || !competition || seasonId == null) return null;
    return buildMatchFeed({
      competitionId: competition.id,
      seasonId,
      standings: standings.map((row) => ({
        teamId: row.teamId,
        name: row.name,
        rank: row.rank,
      })),
      results: resultsQuery.data,
    });
  }, [canDerive, resultsQuery.data, competition, seasonId, standings]);

  if (!enabled) return empty;

  return {
    standings,
    tiered: tieredQuery.data ?? null,
    feed,
    loading: standingsQuery.isPending,
    error:
      standingsQuery.error instanceof Error
        ? standingsQuery.error.message
        : standingsQuery.error
          ? 'Failed to load standings.'
          : null,
  };
}
