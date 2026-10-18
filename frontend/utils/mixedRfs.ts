import type { TimePeriod, TeamStatsRow } from '@/types/analytics';
import { buildFixtureRfs, type RfsOrdinaryRow, type RfsSeriesRow } from '@/utils/fixtureRfs';
import type { ResultOutcome, TeamResult } from '@/utils/teamResults';

export type TeamRfsRows = {
  team: string;
  ordinary: RfsOrdinaryRow[];
  series: RfsSeriesRow[];
};

function resultsFor(row: TeamStatsRow, period: TimePeriod): TeamResult[] {
  return (row.games ?? [])
    .flatMap((game): TeamResult[] => {
      if (game.ftFor == null || game.ftAgainst == null) return [];
      let gf = game.ftFor;
      let ga = game.ftAgainst;
      if (period === 'firsthalf') {
        if (game.htFor == null || game.htAgainst == null) return [];
        gf = game.htFor;
        ga = game.htAgainst;
      } else if (period === 'secondhalf') {
        if (game.htFor == null || game.htAgainst == null || game.ftFor < game.htFor || game.ftAgainst < game.htAgainst) return [];
        gf -= game.htFor;
        ga -= game.htAgainst;
      }
      const outcome: ResultOutcome = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
      return [{
        fixtureId: game.id,
        unix: game.unix,
        teamId: game.teamId ?? 0,
        opponentId: game.opponentId ?? null,
        opponentName: game.opponentName ?? 'Opponent',
        isHome: game.isHome ?? true,
        gf,
        ga,
        outcome,
        opponentRank: null,
        teamRank: null,
        opponentAbove: null,
        goalDiff: gf - ga,
        htGf: game.htFor,
        htGa: game.htAgainst,
      }];
    })
    .sort((a, b) => b.unix - a.unix);
}

/** Use the existing RFS engine for each team and selected table sample. */
export function buildMixedRfs(
  ordinaryRows: TeamStatsRow[],
  seriesRows: TeamStatsRow[],
  period: TimePeriod,
): TeamRfsRows[] {
  const teams = new Set([...ordinaryRows, ...seriesRows].map((row) => row.team));
  return [...teams].map((team) => {
    const ordinaryResults = resultsFor(ordinaryRows.find((row) => row.team === team) ?? { team, metrics: [] }, period);
    const seriesResults = resultsFor(seriesRows.find((row) => row.team === team) ?? { team, metrics: [] }, period);
    const ordinary = buildFixtureRfs({ homeResults: ordinaryResults, awayResults: [] }).ordinary;
    const series = buildFixtureRfs({ homeResults: seriesResults, awayResults: [] }).series;
    return { team, ordinary, series };
  });
}
