import { useEffect, useMemo, useState } from 'react';

import { useLiveStatsTables } from '@/hooks/useLiveStatsTables';
import { useSlStats } from '@/hooks/useSlStats';
import { fetchSeasonStandings, type RawFixture } from '@/services/oddAlerts';
import { buildStatsTables } from '@/services/statsBuilder';
import type { FootyFixture } from '@/services/footyMarketStats';
import type { TeamStatRow } from '@/types/data';
import { timingByName } from '@/utils/standingsAdapter';
import type { TeamTiming } from '@/utils/standingsAnalytics';

function toRaw(fx: FootyFixture): RawFixture {
  const ht =
    fx.htHome != null && fx.htAway != null ? `${fx.htHome}-${fx.htAway}` : null;
  return {
    id: fx.id,
    unix: fx.unix,
    status: 'FT',
    home_name: fx.homeName,
    away_name: fx.awayName,
    home_id: null,
    away_id: null,
    competition_id: fx.competitionId,
    competition_country: fx.country,
    competition_name: fx.competitionName,
    competition_type: fx.isCup ? 'cup' : 'league',
    competition_predictability: null,
    season: '',
    home_goals: fx.homeGoals,
    away_goals: fx.awayGoals,
    ht_score: ht,
    elapsed: null,
    elapsed_seconds: null,
    time_added: null,
    home_position: null,
    away_position: null,
  };
}

/**
 * One competition uses the live stat-table load. No competition ranks the
 * finished fixtures SL-STATS already collects across the active leagues.
 */
export function useCatalogueTables(competitionId: number | null) {
  const sl = useSlStats({ country: null, competitionId: null, kind: 'domestic' });
  const selected = sl.catalog.find((comp) => comp.id === competitionId) ?? null;
  const readyId = competitionId != null && (selected != null || !sl.loading) ? competitionId : null;
  const live = useLiveStatsTables({
    competitionId: readyId,
    seasonName: selected?.seasonName ?? undefined,
  });
  const [timing, setTiming] = useState<Map<string, TeamTiming> | null>(null);

  const pooled = useMemo(() => {
    if (competitionId != null || sl.finished.length === 0) return null;
    return buildStatsTables({
      fixtures: sl.finished.map(toRaw),
      leagueKey: (fx) => String(fx.competition_id),
    }).tables;
  }, [competitionId, sl.finished]);

  const tables: Record<string, TeamStatRow[]> | null =
    competitionId != null ? (live.loading ? null : live.data?.tables ?? null) : pooled;

  useEffect(() => {
    const seasonId = selected?.seasonId;
    if (competitionId == null || seasonId == null) {
      setTiming(null);
      return;
    }
    let alive = true;
    fetchSeasonStandings(seasonId)
      .then((rows) => {
        if (alive) setTiming(timingByName(rows));
      })
      .catch(() => {
        if (alive) setTiming(null);
      });
    return () => {
      alive = false;
    };
  }, [competitionId, selected?.seasonId]);

  const loading = competitionId != null ? (sl.loading && selected == null) || live.loading : sl.loading;
  const error = competitionId != null ? live.error : sl.error;

  return {
    tables,
    loading,
    error,
    catalog: sl.catalog,
    timing,
    loadedLeagues: sl.loadedLeagues,
    capped: sl.capped,
  };
}
