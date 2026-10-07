import type { TeamStatRow } from '@/types/data';
import type { TeamTiming } from '@/utils/standingsAnalytics';

export type CellKind = 'percent' | 'average' | 'points';

export type BoardColumn = {
  key: string;
  label: string;
  kind: CellKind;
  /** Append this team's half average in brackets. */
  withAvg?: boolean;
};

export const BOARD_LIMIT = 200;

export const PERIODS = [
  { value: 'ft', label: 'Full-time' },
  { value: 'ht', label: '1st half' },
  { value: '2h', label: '2nd half' },
] as const;

export const SCOPES = [
  { value: 'overall', label: 'Overall' },
  { value: 'home', label: 'Home' },
  { value: 'away', label: 'Away' },
] as const;

export const MINIMUMS = [
  { value: '0', label: 'Any games' },
  { value: '5', label: '5+ games' },
  { value: '8', label: '8+ games' },
  { value: '10', label: '10+ games' },
];

export const FT_GROUPS = [
  { value: 'ft', label: 'Full-time only' },
  { value: 'ht', label: '1st half only' },
  { value: '2h', label: '2nd half only' },
] as const;

/** Scoreline stats already counted from finished results. */
export const ORDINARY_COLUMNS: BoardColumn[] = [
  { key: 'sc_pct', label: 'SC%', kind: 'percent' },
  { key: 'conc_pct', label: 'Conc%', kind: 'percent' },
  { key: 'sc_avg', label: 'SC/m', kind: 'average' },
  { key: 'conc_avg', label: 'Conc/m', kind: 'average' },
  { key: 'btts_yes', label: 'BTTS', kind: 'percent' },
  { key: 'btts_no', label: 'BTTS no', kind: 'percent' },
  { key: 'cs_pct', label: 'CS', kind: 'percent' },
  { key: 'avg_goals', label: 'AVG', kind: 'average' },
  { key: 'fts_pct', label: 'FTS', kind: 'percent' },
  { key: 'w_pct', label: 'W', kind: 'percent' },
  { key: 'd_pct', label: 'D', kind: 'percent' },
  { key: 'l_pct', label: 'L', kind: 'percent' },
  { key: 'over05', label: 'O0.5', kind: 'percent' },
  { key: 'under05', label: 'U0.5', kind: 'percent' },
  { key: 'over15', label: 'O1.5', kind: 'percent' },
  { key: 'under15', label: 'U1.5', kind: 'percent' },
  { key: 'over25', label: 'O2.5', kind: 'percent' },
  { key: 'under25', label: 'U2.5', kind: 'percent' },
  { key: 'over35', label: 'O3.5', kind: 'percent' },
  { key: 'under35', label: 'U3.5', kind: 'percent' },
  { key: 'over45', label: 'O4.5', kind: 'percent' },
  { key: 'under45', label: 'U4.5', kind: 'percent' },
  { key: 'scoring_05', label: 'Scr 0.5', kind: 'percent' },
  { key: 'scoring_15', label: 'Scr 1.5', kind: 'percent' },
  { key: 'scoring_25', label: 'Scr 2.5', kind: 'percent' },
  { key: 'conceding_05', label: 'Cnc 0.5', kind: 'percent' },
  { key: 'conceding_15', label: 'Cnc 1.5', kind: 'percent' },
  { key: 'conceding_25', label: 'Cnc 2.5', kind: 'percent' },
];

export const FT_COLUMNS: BoardColumn[] = [
  { key: 'btts_both_halves', label: 'BTTS both halves', kind: 'percent' },
  { key: 'scored_both_halves', label: 'Scored both halves', kind: 'percent' },
  { key: 'btts_over25', label: 'BTTS & over 2.5', kind: 'percent' },
  { key: 'conceded_both_halves', label: 'Conceded both halves', kind: 'percent' },
  { key: 'won_both_halves', label: 'Won both halves', kind: 'percent' },
  { key: 'win_to_nil', label: 'Win to nil', kind: 'percent' },
  { key: 'lost_to_nil', label: 'Lost to nil', kind: 'percent' },
  { key: 'rescued_points', label: 'Rescued pts', kind: 'points' },
  { key: 'blown_points', label: 'Blown pts', kind: 'points' },
  { key: 'htft_ww', label: 'HT/FT W/W', kind: 'percent' },
  { key: 'htft_wd', label: 'HT/FT W/D', kind: 'percent' },
  { key: 'htft_wl', label: 'HT/FT W/L', kind: 'percent' },
  { key: 'htft_dw', label: 'HT/FT D/W', kind: 'percent' },
  { key: 'htft_dd', label: 'HT/FT D/D', kind: 'percent' },
  { key: 'htft_dl', label: 'HT/FT D/L', kind: 'percent' },
  { key: 'htft_lw', label: 'HT/FT L/W', kind: 'percent' },
  { key: 'htft_ld', label: 'HT/FT L/D', kind: 'percent' },
  { key: 'htft_ll', label: 'HT/FT L/L', kind: 'percent' },
];

export const HALF_COLUMNS: BoardColumn[] = [
  { key: 'half_nil', label: '0–0', kind: 'percent' },
  { key: 'half_under05', label: 'Under 0.5', kind: 'percent', withAvg: true },
  { key: 'half_over15', label: 'Over 1.5', kind: 'percent', withAvg: true },
];

/** Full-time results that do not need a half-time score. */
const FT_ALL_MATCH_KEYS = new Set(['btts_over25', 'win_to_nil', 'lost_to_nil']);

export function sampleKeyFor(stat: string, family: 'ordinary' | 'ft'): 'sample_size' | 'ht_sample' {
  if (family === 'ordinary' || FT_ALL_MATCH_KEYS.has(stat)) return 'sample_size';
  return 'ht_sample';
}

export function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Highest first, teams without a figure last, then cut to the top 200. */
export function rankRows(
  rows: TeamStatRow[],
  stat: string,
  minimum: number,
  sampleKey: 'sample_size' | 'ht_sample',
): TeamStatRow[] {
  const eligible = rows.filter((row) => {
    const sample = finiteNumber(row[sampleKey]) ?? 0;
    return sample >= minimum;
  });
  eligible.sort((a, b) => {
    const av = finiteNumber(a[stat]);
    const bv = finiteNumber(b[stat]);
    if (av == null && bv == null) return a.team_name.localeCompare(b.team_name);
    if (av == null) return 1;
    if (bv == null) return -1;
    if (bv !== av) return bv - av;
    return a.team_name.localeCompare(b.team_name);
  });
  return eligible.slice(0, BOARD_LIMIT);
}

export function formatStat(row: TeamStatRow, column: BoardColumn): string {
  const value = finiteNumber(row[column.key]);
  if (value == null) return '—';
  const body =
    column.kind === 'percent'
      ? `${Math.round(value)}%`
      : column.kind === 'points'
        ? value.toFixed(2)
        : value.toFixed(1);
  if (!column.withAvg) return body;
  const avg = finiteNumber(row.half_avg);
  return `${body} (${avg == null ? '—' : avg.toFixed(1)})`;
}

export function formatTiming(
  timing: TeamTiming | undefined,
  key: keyof TeamTiming,
  enabled: boolean,
): string {
  if (!enabled || !timing) return '—';
  if (key === 'firstGoalFor' || key === 'firstGoalAgainst') {
    const minute = timing[key];
    return minute == null ? '—' : `${minute}'`;
  }
  if (key === 'scoredIn15' || key === 'concededIn15' || key === 'scoredAfter70' || key === 'concededAfter70') {
    return `${Math.round(timing[key].pct)}%`;
  }
  return '—';
}
