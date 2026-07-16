import { useEffect, useState } from 'react';

import { fetchAllFixturesBetween, seasonWindowUnix } from '@/services/oddAlerts';
import { buildLeagueStatsLive } from '@/services/statsBuilder';
import type { TeamStatsExport } from '@/types/data';

export type UseLiveStatsTables = {
  data: TeamStatsExport | null;
  loading: boolean;
  error: string | null;
};

/**
 * Build the 72-style stat tables in real time from the OddAlerts API — no
 * database. Fetches a competition's finished results for the season window and
 * derives the `TeamStatsExport` representation on the client.
 *
 * Usage:
 *   const { data, loading, error } = useLiveStatsTables({ competitionId, seasonName });
 *   const rows = data?.tables['ordinary_ft_overall'];
 */
export function useLiveStatsTables(opts: {
  competitionId?: number | string | null;
  seasonName?: string;
  maxPages?: number;
}): UseLiveStatsTables {
  const { competitionId, seasonName, maxPages } = opts;
  const [data, setData] = useState<TeamStatsExport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (competitionId == null) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    const { fromUnix, toUnix } = seasonWindowUnix(seasonName ?? '');
    buildLeagueStatsLive(
      (o) => fetchAllFixturesBetween(o, ctrl.signal),
      { competitionId, fromUnix, toUnix, season: seasonName, maxPages },
    )
      .then((res) => {
        if (!ctrl.signal.aborted) setData(res);
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [competitionId, seasonName, maxPages]);

  return { data, loading, error };
}
