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

export type BoardNote = {
  label: string;
  choice: string;
  detail: string;
};

const RESULT_WORD: Record<string, string> = {
  w: 'winning',
  d: 'drawing',
  l: 'losing',
};

function whenPhrase(period: string): string {
  if (period === 'ht') return 'in the first half';
  if (period === '2h') return 'in the second half';
  return 'in the finished match';
}

/** Plain meaning of the stat currently used to sort the board. */
export function statMeaning(key: string, period: string): string {
  const when = whenPhrase(period);
  const half = period === '2h' ? 'second half' : 'first half';
  if (key.startsWith('over') || key.startsWith('under')) {
    const mark = `${key.replace(/\D/g, '')[0]}.5`;
    const direction = key.startsWith('over') ? 'more than' : 'fewer than';
    return `How often the match had ${direction} ${mark} goals ${when}. Sorted as a percentage of this team's games.`;
  }
  if (key.startsWith('scoring_') || key.startsWith('conceding_')) {
    const mark = `${key.slice(-2, -1)}.5`;
    const who = key.startsWith('scoring_') ? 'scored' : 'conceded';
    return `How often this team ${who} more than ${mark} goals ${when}. Sorted as a percentage of their games.`;
  }
  const htft = /^htft_([wdl])([wdl])$/.exec(key);
  if (htft) {
    return `How often this team was ${RESULT_WORD[htft[1]]} at half-time and ${RESULT_WORD[htft[2]]} at full time. Counted only in matches that have a half-time score.`;
  }
  const meanings: Record<string, string> = {
    sc_pct: `How often this team scored at least one goal ${when}.`,
    conc_pct: `How often this team conceded at least one goal ${when}.`,
    sc_avg: `Average goals this team scored ${when}. A raw average, shown to one decimal.`,
    conc_avg: `Average goals this team conceded ${when}. A raw average, shown to one decimal.`,
    btts_yes: `How often both teams scored ${when}.`,
    btts_no: `How often at least one team failed to score ${when}.`,
    cs_pct: `How often this team kept a clean sheet ${when}.`,
    avg_goals: `Average total goals ${when}, both teams together.`,
    fts_pct: `How often this team failed to score ${when}.`,
    w_pct: `How often this team won ${when}.`,
    d_pct: `How often this team drew ${when}.`,
    l_pct: `How often this team lost ${when}.`,
    btts_both_halves: 'How often both teams scored in the first half and both scored again in the second half.',
    scored_both_halves: 'How often this team scored at least once in each half.',
    btts_over25: 'How often both teams scored and the match had more than 2.5 goals. Uses the full-time score.',
    conceded_both_halves: 'How often this team conceded in the first half and conceded again in the second half.',
    won_both_halves: 'How often this team was winning at half-time and won the second half as well.',
    win_to_nil: 'How often this team won the match without conceding. Uses the full-time score.',
    lost_to_nil: 'How often this team lost the match without scoring. Uses the full-time score.',
    rescued_points: 'Average points taken after trailing at half-time. A later draw counts 1, a later win counts 3, and a game they were not trailing counts 0. This is a raw average, not a percentage.',
    blown_points: 'Average points dropped after leading at half-time. A later draw counts 2, a later loss counts 3, and a game they were not leading counts 0. This is a raw average, not a percentage.',
    led_ht: 'How often this team was ahead at half-time.',
    half_nil: `How often the ${half} finished 0–0.`,
    half_under05: `How often the ${half} had fewer than 0.5 goals, which is a 0–0 half. The number in brackets is this team's average goals in that half.`,
    half_over15: `How often the ${half} had more than 1.5 goals. The number in brackets is this team's average goals in that half.`,
  };
  return meanings[key] ?? 'This figure is counted from finished scores and the board sorts it from highest to lowest.';
}

export function explainBoard(input: {
  mode: 'ordinary' | 'ft';
  statKey: string;
  statLabel: string;
  period: string;
  scope: string;
  competitionName: string | null;
  minimum: number;
  query: string;
  loading: boolean;
  error: string | null;
  shown: number;
  capped: boolean;
  loadedLeagues: number;
}): BoardNote[] {
  const sample = sampleKeyFor(input.statKey, input.mode);
  const games =
    sample === 'ht_sample'
      ? 'The games column counts matches that included a half-time score.'
      : 'The games column counts every finished match in this scope.';
  const scopeDetail =
    input.scope === 'home'
      ? 'Only matches this team played at home are counted.'
      : input.scope === 'away'
        ? 'Only matches this team played away are counted.'
        : 'Home and away matches are both counted.';
  const periodDetail =
    input.mode === 'ft'
      ? input.period === 'ht'
        ? 'The group uses the half-time score. Under 0.5 and over 1.5 also show the average first-half goals in brackets.'
        : input.period === '2h'
          ? 'The group uses full time minus half time. Both-halves rates use matches that have a half-time score.'
          : 'Both-halves patterns and the nine HT/FT results use matches that have a half-time score. Win to nil, lost to nil, and BTTS & over 2.5 use the full-time score.'
      : input.period === 'ht'
        ? 'Goals and the result are taken from the half-time score.'
        : input.period === '2h'
          ? 'Goals and the result are the full-time score minus the half-time score.'
          : 'Goals and the result are taken from the full-time score.';
  const competitionDetail = input.competitionName
    ? `Finished results for ${input.competitionName} are loaded the same way as Additional stats: that competition's season scores. The board counts those scores here.`
    : input.capped
      ? `No single league is selected. Finished domestic games come from the ${input.loadedLeagues} busiest leagues already loaded for SL-STATS, then teams are ranked across them.`
      : 'No single league is selected. Finished domestic games come from the leagues already loaded for SL-STATS, then teams are ranked across them.';
  const timingDetail =
    input.mode !== 'ordinary'
      ? ''
      : input.period === 'ft' && input.competitionName
        ? ' With one competition on full time, the timing columns also read that season’s recorded first-goal minute, goals in the first 15 minutes, and goals after 70, for and against. Scored first, handicap, and the 20, 35, 60, and 75 minute lines stay blank because that feed does not measure them.'
        : ' Timing columns stay blank on this view. Those minutes are recorded for a full-time look at one competition.';
  const minimumDetail =
    input.minimum <= 0
      ? `Every team with a counted game can be ranked, including a one-game 100%. ${games}`
      : `Teams with fewer than ${input.minimum} counted games are left off before the sort. ${games}`;
  const teamDetail = input.query.trim()
    ? `After the top ${BOARD_LIMIT} are ranked, only names containing “${input.query.trim()}” stay on screen.`
    : `No name is typed, so the list is the top ${BOARD_LIMIT} after the sort.`;
  const fetchDetail = input.loading
    ? 'Fetching the finished scores for this choice.'
    : input.error
      ? input.error
      : `Showing ${input.shown} team${input.shown === 1 ? '' : 's'}, highest ${input.statLabel} first.`;

  const notes: BoardNote[] = [
    {
      label: 'Stat',
      choice: input.statLabel,
      detail: `${statMeaning(input.statKey, input.period)} The board sorts this from highest to lowest.`,
    },
    {
      label: 'Competition',
      choice: input.competitionName ?? 'All loaded leagues',
      detail: competitionDetail + timingDetail,
    },
    {
      label: 'Scope',
      choice: input.scope === 'home' ? 'Home' : input.scope === 'away' ? 'Away' : 'Overall',
      detail: scopeDetail,
    },
  ];
  notes.push({
    label: input.mode === 'ft' ? 'Group' : 'Period',
    choice:
      input.mode === 'ft'
        ? input.period === 'ht'
          ? '1st half only'
          : input.period === '2h'
            ? '2nd half only'
            : 'Full-time only'
        : input.period === 'ht'
          ? '1st half'
          : input.period === '2h'
            ? '2nd half'
            : 'Full-time',
    detail: periodDetail,
  });
  notes.push(
    {
      label: 'Minimum games',
      choice: input.minimum <= 0 ? 'Any games' : `${input.minimum}+ games`,
      detail: minimumDetail,
    },
    { label: 'Team', choice: input.query.trim() || 'All names in the top 200', detail: teamDetail },
    { label: 'Result', choice: input.loading ? 'Loading' : input.error ? 'Feed error' : `${input.shown} shown`, detail: fetchDetail },
  );
  return notes;
}
