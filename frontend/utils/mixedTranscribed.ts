/**
 * Mixed Stats · Last left-over stats (1–23) — the pure transcription engine.
 *
 * These 23 derived views are computed from data the app already builds: the
 * Ordinary FT / 1H / 2H tables (with their attached season games and half-time
 * scores), the FT-only patterns, and the PPG table. Nothing here is a new
 * statistic — each value reshapes goals the feed already reports.
 *
 * Extracted from MixedStatsPanel so the same engine can be reused by the
 * Strategy Builder (which feeds it source tables built from its league export)
 * without duplicating any calculation. Pure: no React, no network.
 */
import type { TeamStatsRow } from '@/types/analytics';
import { halfGoalShares, secondHalfLeagueRates, secondHalfTeamRates } from '@/utils/mixedStats';

/** The 23 transcribed stats: [key, short label, formula note]. Order is the document's 1–23. */
export const TRANSCRIBED_STATS = [
  ['sc_1h_share', 'SC* 1H%', '1H team goals ÷ FT team goals'], ['sc_2h_share', 'SC* 2H%', '2H team goals ÷ FT team goals'],
  ['avg_1h_share', 'AVG* 1H%', '1H match goals ÷ FT match goals'], ['conc_1h_share', 'Conc* 1H%', '1H conceded goals ÷ FT conceded goals'],
  ['conc_2h_share', 'Conc* 2H%', '2H conceded goals ÷ FT conceded goals'], ['avg_2h_share', 'AVG* 2H%', '2H match goals ÷ FT match goals'],
  ['shg_team_avg', '2H_T (AVG)', 'Team second-half goals ÷ valid matches'], ['shg_team_consistency', '2H_T (consistency)', 'Matches with team second-half goal ÷ valid matches'],
  ['shg_league_avg', '2H_L (AVG)', 'League second-half total goals ÷ fixtures'], ['shg_league_consistency', '2H_L (consistency)', 'Fixtures with second-half goal ÷ fixtures'],
  ['most_match_goals_half', 'Most goals · match', 'First half / second half / tie'], ['most_scored_half', 'Most goals scored', 'First half / second half / tie'],
  ['most_conceded_half', 'Most goals conceded', 'First half / second half / tie'], ['btts_win', 'BTTS · win', 'BTTS wins ÷ matches'],
  ['btts_draw', 'BTTS · draw', 'BTTS draws ÷ matches'], ['btts_loss', 'BTTS · loss', 'BTTS losses ÷ matches'],
  ['least_clean_sheet', 'Least clean sheets', 'Matches conceding ÷ matches'], ['best_form', 'Best form · high PPG', 'Full-time PPG'],
  ['worst_form', 'Worst form · low PPG', 'Full-time PPG'], ['best_performance', 'Best performance · high', 'FT goals scored avg − conceded avg'],
  ['worst_performance', 'Worst performance · low', 'FT goals scored avg − conceded avg'],
  ['scored_both_halves', 'Scores in both halves', 'Existing FT-Only calculation'], ['conceded_both_halves', 'Concedes in both halves', 'Existing FT-Only calculation'],
] as const;

export type TranscribedId = (typeof TRANSCRIBED_STATS)[number][0];

/** The three stats whose value is a half choice (1 → 1st, −1 → 2nd, 0 → tie), not a %/number. */
export const HALF_CHOICE_KEYS: readonly string[] = ['most_match_goals_half', 'most_scored_half', 'most_conceded_half'];

/** The source tables the transcription reads — all overall, full-time / 1H / 2H. */
export type TranscribedSources = {
  ordinaryByPeriod: { fulltime: TeamStatsRow[]; firsthalf: TeamStatsRow[]; secondhalf: TeamStatsRow[] };
  ftOnly: TeamStatsRow[];
  ppgFt: TeamStatsRow[];
};

function rowMetric(rows: TeamStatsRow[], team: string, key: string): number | null {
  const value = rows.find((row) => row.team === team)?.metrics.find((metric) => metric.key === key)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function comparePeriods(first: number | null, second: number | null): number | null {
  return first == null || second == null ? null : first === second ? 0 : first > second ? 1 : -1;
}
function goalDiffAverage(row: TeamStatsRow | undefined): number | null {
  if (!row?.games?.length) return null;
  const games = row.games.filter((game) => game.ftFor != null && game.ftAgainst != null);
  return games.length ? games.reduce((sum, game) => sum + (game.ftFor! - game.ftAgainst!), 0) / games.length : null;
}
function bttsOutcomeRate(row: TeamStatsRow | undefined, outcome: 'win' | 'draw' | 'loss'): number | null {
  const games = row?.games?.filter((game) => game.ftFor != null && game.ftAgainst != null) ?? [];
  if (!games.length) return null;
  const hits = games.filter((game) => game.ftFor! > 0 && game.ftAgainst! > 0 && (outcome === 'win' ? game.ftFor! > game.ftAgainst! : outcome === 'draw' ? game.ftFor === game.ftAgainst : game.ftFor! < game.ftAgainst!)).length;
  return hits / games.length * 100;
}

/** Build the 23 transcribed stats for every team present in the supplied tables. */
export function transcribedTeamRows(sources: TranscribedSources): TeamStatsRow[] {
  const full = sources.ordinaryByPeriod.fulltime;
  const first = sources.ordinaryByPeriod.firsthalf;
  const second = sources.ordinaryByPeriod.secondhalf;
  const teams = [...new Set([...full, ...first, ...second].map((row) => row.team))];
  const allGames = full.flatMap((row) => row.games ?? []);
  const leagueSecondHalf = secondHalfLeagueRates(allGames);
  const valueFor = (team: string, id: TranscribedId): { value: number | null; raw?: boolean } => {
    const fhAvg = rowMetric(first, team, 'avg_goals'); const shAvg = rowMetric(second, team, 'avg_goals');
    const fhScAvg = rowMetric(first, team, 'sc_avg');
    const ftConc = rowMetric(full, team, 'conc_pct');
    const games = full.find((row) => row.team === team)?.games ?? [];
    const shares = halfGoalShares(games);
    const secondHalf = secondHalfTeamRates(games);
    const values: Record<TranscribedId, { value: number | null; raw?: boolean }> = {
      sc_1h_share: { value: shares.scFirst }, sc_2h_share: { value: shares.scSecond },
      avg_1h_share: { value: shares.avgFirst }, conc_1h_share: { value: shares.concFirst },
      conc_2h_share: { value: shares.concSecond }, avg_2h_share: { value: shares.avgSecond },
      shg_team_avg: { value: secondHalf.teamAverage, raw: true }, shg_team_consistency: { value: secondHalf.teamConsistency },
      shg_league_avg: { value: leagueSecondHalf.leagueAverage, raw: true }, shg_league_consistency: { value: leagueSecondHalf.leagueConsistency },
      most_match_goals_half: { value: comparePeriods(fhAvg, shAvg) }, most_scored_half: { value: comparePeriods(fhScAvg, rowMetric(second, team, 'sc_avg')) },
      most_conceded_half: { value: comparePeriods(rowMetric(first, team, 'conc_avg'), rowMetric(second, team, 'conc_avg')) },
      btts_win: { value: bttsOutcomeRate(full.find((row) => row.team === team), 'win') },
      btts_draw: { value: bttsOutcomeRate(full.find((row) => row.team === team), 'draw') },
      btts_loss: { value: bttsOutcomeRate(full.find((row) => row.team === team), 'loss') },
      least_clean_sheet: { value: ftConc }, best_form: { value: rowMetric(sources.ppgFt, team, 'ppg'), raw: true },
      worst_form: { value: rowMetric(sources.ppgFt, team, 'ppg'), raw: true },
      best_performance: { value: goalDiffAverage(full.find((row) => row.team === team)), raw: true },
      worst_performance: { value: goalDiffAverage(full.find((row) => row.team === team)), raw: true },
      scored_both_halves: { value: rowMetric(sources.ftOnly, team, 'scored_both_halves') },
      conceded_both_halves: { value: rowMetric(sources.ftOnly, team, 'conceded_both_halves') },
    };
    return values[id];
  };
  return teams.map((team) => ({
    team,
    metrics: TRANSCRIBED_STATS.map(([key, label]) => {
      const result = valueFor(team, key);
      return { key, label, value: result.value == null ? null : Math.round(result.value * 10) / 10, compliance: null, raw: result.raw };
    }),
  }));
}

/** Render a transcribed value for display: half choices read 1st/2nd/Tie, raw show the number, the rest a %. */
export function renderMixedValue(key: string, value: number, raw: boolean): string {
  if (HALF_CHOICE_KEYS.includes(key)) return value > 0 ? '1st Half' : value < 0 ? '2nd Half' : 'Tie';
  return `${value.toFixed(1)}${raw ? '' : '%'}`;
}
