import { useCallback, useEffect, useRef, useState } from 'react';

import { cachedFetch, setCachedFetch } from '@/services/fixtureCache';
import { fetchAllFixturesBetween, seasonWindowUnix } from '@/services/oddAlerts';
import { buildLeagueStatsLive } from '@/services/statsBuilder';
import type { TeamStatsExport } from '@/types/data';

export type UseLiveStatsTables = {
  data: TeamStatsExport | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => void;
};

const STATS_TTL_MS = 60_000; // re-selecting a competition within 60s is instant

/**
 * Build the 81 stat tables in real time from the OddAlerts API — no
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
  teamRanks?: { teamId: number; rank: number }[];
}): UseLiveStatsTables {
  const { competitionId, seasonName, maxPages, teamRanks } = opts;
  const [data, setData] = useState<TeamStatsExport | null>(null);
  const [dataKey, setDataKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const ranksKey = teamRanks?.map((team) => `${team.teamId}-${team.rank}`).join(',') ?? 'no-ranks';
  const requestKey = competitionId == null
    ? ''
    : `stats:${competitionId}:${seasonName ?? ''}:${maxPages ?? ''}:${ranksKey}`;
  const refreshTarget = useRef<{ key: string; version: number } | null>(null);
  const refresh = useCallback(() => {
    setRefreshVersion((version) => {
      const next = version + 1;
      refreshTarget.current = { key: requestKey, version: next };
      return next;
    });
  }, [requestKey]);

  useEffect(() => {
    if (competitionId == null) {
      setLoading(false);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    const { fromUnix, toUnix } = seasonWindowUnix(seasonName ?? '');
    // A refreshed request gets a distinct cache key so it bypasses prior data
    // and any earlier in-flight request for the same competition.
    const forceRefresh = refreshTarget.current?.key === requestKey && refreshTarget.current.version === refreshVersion;
    const key = forceRefresh ? `${requestKey}:refresh:${refreshVersion}` : requestKey;
    // No abort signal inside the cached fetch: let it finish + cache so a shared/
    // repeat selection reuses it. We just ignore the result if this effect aborted.
    cachedFetch(key, STATS_TTL_MS, () =>
      buildLeagueStatsLive((o) => fetchAllFixturesBetween(o), {
        competitionId,
        fromUnix,
        toUnix,
        season: seasonName,
        maxPages,
        teamRanks,
        cache: forceRefresh ? 'off' : undefined,
      }),
    )
      .then((res) => {
        if (!ctrl.signal.aborted) {
          setData(res);
          setDataKey(requestKey);
          if (forceRefresh) {
            setCachedFetch(requestKey, STATS_TTL_MS, res);
            if (refreshTarget.current?.key === requestKey && refreshTarget.current.version === refreshVersion) {
              refreshTarget.current = null;
            }
          }
        }
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [competitionId, seasonName, maxPages, teamRanks, requestKey, refreshVersion]);

  const dataIsCurrent = dataKey === requestKey;
  return { data: dataIsCurrent ? data : null, loading, refreshing: loading && dataIsCurrent, error, refresh };
}
