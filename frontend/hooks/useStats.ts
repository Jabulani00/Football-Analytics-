import { useMemo } from 'react';

import { getTeamStatsTable } from '@/data/teamStatsLoader';
import { buildFixtureStats } from '@/mock/statsEngine';
import { getFixtureById } from '@/mock/fixturesData';
import type { TeamStatRow } from '@/types/data';
import type { FixtureStatsBundle } from '@/types/stats';

export type UseStatsOptions = {
  tableId?: string;
  teamName?: string;
  leagueId?: string;
};

/** Read team stats from bundled SQLite export; falls back to mock stats engine. */
export function useStats(fixtureId: string, options: UseStatsOptions = {}) {
  const { tableId = 'ordinary_ft_overall', teamName, leagueId } = options;

  const tableRows = useMemo(() => getTeamStatsTable(tableId), [tableId]);

  const teamRow = useMemo(() => {
    if (!tableRows || !teamName || !leagueId) return null;
    return (
      tableRows.find((r) => r.team_name === teamName && r.league_id === leagueId) ?? null
    );
  }, [tableRows, teamName, leagueId]);

  const fixtureStats: FixtureStatsBundle | null = useMemo(() => {
    const fixture = getFixtureById(fixtureId);
    if (!fixture) return null;
    return buildFixtureStats(fixture, tableId);
  }, [fixtureId, tableId]);

  return {
    tableId,
    tableRows: tableRows as TeamStatRow[] | null,
    teamRow,
    fixtureStats,
    source: tableRows ? ('assets' as const) : ('mock' as const),
  };
}

export function useStatValue(
  tableId: string,
  teamName: string,
  leagueId: string,
  statKey: string,
): { value: number | null; signal: string | null } {
  const rows = getTeamStatsTable(tableId);
  const row = rows?.find((r) => r.team_name === teamName && r.league_id === leagueId);
  if (!row) return { value: null, signal: null };
  const value = row[statKey];
  const signal = row[`${statKey}_signal`];
  return {
    value: typeof value === 'number' ? value : null,
    signal: typeof signal === 'string' ? signal : null,
  };
}
