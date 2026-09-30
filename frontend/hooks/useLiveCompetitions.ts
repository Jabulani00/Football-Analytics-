import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { oddAlertsKeys } from '@/services/oddAlertsKeys';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { fetchUpcomingFixtures, type RawFixture } from '@/services/oddAlerts';

export type LiveCompetition = {
  id: number;
  name: string;
  season: string;
  country: string;
  /** Number of upcoming fixtures — a proxy for how active the competition is. */
  upcoming: number;
  /** Default-ordering tier: 0 = domestic league, 1 = cup, 2 = friendly/youth. */
  rank: number;
};

/**
 * Default-ordering tier. Domestic leagues predict best (self-contained results),
 * cups less so (teams' form lives in their domestic league), friendlies/youth
 * worst. Used only to pick a sensible default — search reaches everything.
 */
function competitionRank(fx: RawFixture): number {
  if (
    fx.is_friendly === true ||
    /friendl|reserve|\bu1\d\b|\bu2\d\b|youth/i.test(fx.competition_name ?? '')
  ) {
    return 2;
  }
  if (fx.is_cup === true) return 1;
  return 0;
}

function competitionsFrom(rows: RawFixture[] | undefined): LiveCompetition[] {
  const seen = new Map<number, LiveCompetition>();
  for (const fx of rows ?? []) {
    if (!fx.competition_id || !fx.competition_name) continue;
    const existing = seen.get(fx.competition_id);
    if (existing) {
      existing.upcoming += 1;
    } else {
      seen.set(fx.competition_id, {
        id: fx.competition_id,
        name: fx.competition_name,
        season: fx.season,
        country: fx.competition_country,
        upcoming: 1,
        rank: competitionRank(fx),
      });
    }
  }
  return Array.from(seen.values()).sort(
    (a, b) => a.rank - b.rank || b.upcoming - a.upcoming || a.name.localeCompare(b.name),
  );
}

/**
 * Distinct competitions that have upcoming fixtures — i.e. leagues currently
 * active, sourced live from the API. Sorted by activity (most upcoming fixtures
 * first) so the default selection is a competition likely to have results.
 */
export function useLiveCompetitions(days = 3): LiveCompetition[] {
  const query = useQuery({
    queryKey: oddAlertsKeys.upcoming({ days }),
    queryFn: ({ signal }) => fetchUpcomingFixtures({ days }, signal),
    staleTime: clientStaleTime('fixtures/upcoming'),
  });

  return useMemo(() => competitionsFrom(query.data?.data), [query.data]);
}
