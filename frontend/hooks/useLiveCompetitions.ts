import { useEffect, useState } from 'react';

import { fetchUpcomingFixtures, type RawFixture } from '@/services/oddAlerts';

export type LiveCompetition = { id: number; name: string; season: string; country: string };

/**
 * Distinct competitions that have upcoming fixtures — i.e. leagues currently
 * active, sourced live from the API. Used to scope the live stat/prediction
 * builders to a competition the user picks.
 */
export function useLiveCompetitions(days = 3): LiveCompetition[] {
  const [competitions, setCompetitions] = useState<LiveCompetition[]>([]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchUpcomingFixtures({ days }, ctrl.signal)
      .then((env) => {
        const seen = new Map<number, LiveCompetition>();
        for (const fx of env.data as RawFixture[]) {
          if (fx.competition_id && fx.competition_name && !seen.has(fx.competition_id)) {
            seen.set(fx.competition_id, {
              id: fx.competition_id,
              name: fx.competition_name,
              season: fx.season,
              country: fx.competition_country,
            });
          }
        }
        if (!ctrl.signal.aborted) setCompetitions(Array.from(seen.values()));
      })
      .catch(() => {
        /* leave empty */
      });
    return () => ctrl.abort();
  }, [days]);

  return competitions;
}
