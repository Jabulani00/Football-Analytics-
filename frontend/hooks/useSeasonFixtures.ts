import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  fetchAllFixturesBetween,
  normaliseStatus,
  seasonWindowUnix,
  type Competition,
  type Season,
} from '@/services/oddAlerts';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { oddAlertsKeys } from '@/services/oddAlertsKeys';
import type { SeasonMatch } from '@/utils/bhozomaEngine';

function parseHtScore(ht: string | null | undefined): { home: number; away: number } | null {
  if (!ht) return null;
  const m = ht.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}

type State = {
  matches: SeasonMatch[];
  loading: boolean;
  error: string | null;
};

/**
 * Finished same-competition fixtures for a season — fuels Bhozoma / Imbangi.
 * Only runs when `enabled` so league/tier tabs stay untouched and cheap.
 */
export function useSeasonFixtures(
  competition: Competition | null,
  season: Season | null | undefined,
  enabled: boolean,
): State {
  const active = enabled && competition != null && season != null;
  const competitionId = competition?.id ?? 0;
  const seasonId = season?.seasonId ?? 0;
  const seasonName = season?.seasonName ?? '';

  const query = useQuery({
    queryKey: oddAlertsKeys.between({
      competitions: String(competitionId),
      seasonId,
      seasonName,
      maxPages: 8,
    }),
    queryFn: ({ signal }) => {
      const window = seasonWindowUnix(seasonName);
      return fetchAllFixturesBetween(
        {
          fromUnix: window.fromUnix,
          toUnix: window.toUnix,
          competitions: String(competitionId),
          maxPages: 8,
        },
        signal,
      );
    },
    enabled: active,
    staleTime: clientStaleTime('fixtures/between'),
  });

  const matches = useMemo(() => {
    if (!active || !query.data || !season) return [];
    const rows: SeasonMatch[] = [];
    for (const fixture of query.data) {
      if (normaliseStatus(fixture.status) !== 'FT') continue;
      if (fixture.home_id == null || fixture.away_id == null) continue;
      if (fixture.home_goals == null || fixture.away_goals == null) continue;
      if (fixture.season_id != null && fixture.season_id !== season.seasonId) continue;
      const ht = parseHtScore(fixture.ht_score);
      const usable = ht != null && ht.home <= fixture.home_goals && ht.away <= fixture.away_goals;
      rows.push({
        homeId: fixture.home_id,
        awayId: fixture.away_id,
        homeGoals: fixture.home_goals,
        awayGoals: fixture.away_goals,
        homeGoalsHt: usable ? ht!.home : null,
        awayGoalsHt: usable ? ht!.away : null,
        unix: fixture.unix,
      });
    }
    return rows;
  }, [active, query.data, season]);

  if (!active) return { matches: [], loading: false, error: null };

  return {
    matches,
    loading: query.isPending,
    error:
      query.error instanceof Error
        ? query.error.message
        : query.error
          ? 'Failed to load season fixtures.'
          : null,
  };
}
