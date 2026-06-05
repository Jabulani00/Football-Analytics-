import type { TeamStatsExport } from '@/types/data';

let cache: TeamStatsExport | null = null;

function loadTeamStats(): TeamStatsExport | null {
  if (cache) return cache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const data = require('@/assets/data/team_stats.json') as TeamStatsExport | undefined;
    if (!data?.tables) return null;
    cache = data;
    return cache;
  } catch {
    return null;
  }
}

export function getTeamStatsTable(tableId: string) {
  const data = loadTeamStats();
  return data?.tables[tableId] ?? null;
}
