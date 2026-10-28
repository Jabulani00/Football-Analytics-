/**
 * Strategy Filter (Stats Grading · Method 3) — a fixture scanner.
 *
 * Each strategy is a list of conditions on the live stats we already pull. A
 * fixture matches when BOTH teams satisfy every condition for their side, read
 * from the right window/period/scope table (e.g. last-10 2nd-half home). Named
 * presets ("Leaky Leaky", "2nd Half Delight", "High Over 2.5") are encoded from
 * the strategy notes; a custom builder covers any stat.
 *
 * Out of scope (no data in the app): live in-play rules (live odds, shots on
 * target, attacking pressure) and a true probability model — "BTTS model %" is
 * approximated with the historical BTTS% rate.
 *
 * Pure: no network, no React.
 */
import type { TeamStatRow, TeamStatsExport } from '@/types/data';

export type Side = 'home' | 'away' | 'both';
export type FilterWindow = 'all' | 'last10' | 'last8' | 'last6' | 'last5';
export type FilterPeriod = 'ft' | 'ht' | '2h';
export type FilterScope = 'overall' | 'home' | 'away';
export type Cmp = 'gte' | 'lte';

export type Condition = {
  id: string;
  side: Side;
  statKey: string;
  window: FilterWindow;
  period: FilterPeriod;
  scope: FilterScope;
  cmp: Cmp;
  value: number;
};

export const SIDES: { value: Side; label: string }[] = [
  { value: 'both', label: 'Both teams' },
  { value: 'home', label: 'Home team' },
  { value: 'away', label: 'Away team' },
];
export const WINDOWS: { value: FilterWindow; label: string }[] = [
  { value: 'all', label: 'All games' },
  { value: 'last10', label: 'Last 10' },
  { value: 'last8', label: 'Last 8' },
  { value: 'last6', label: 'Last 6' },
  { value: 'last5', label: 'Last 5' },
];
export const PERIODS: { value: FilterPeriod; label: string }[] = [
  { value: 'ft', label: 'Full time' },
  { value: 'ht', label: '1st half' },
  { value: '2h', label: '2nd half' },
];
export const SCOPES: { value: FilterScope; label: string }[] = [
  { value: 'overall', label: 'Overall' },
  { value: 'home', label: 'Home' },
  { value: 'away', label: 'Away' },
];
export const CMPS: { value: Cmp; label: string }[] = [
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
];

export type FilterStat = { key: string; label: string; kind: 'pct' | 'avg' };
/** Stats a condition can read. Percentages render with %, averages plain. */
export const FILTER_STATS: FilterStat[] = [
  { key: 'sc_pct', label: 'Scored %', kind: 'pct' },
  { key: 'conc_pct', label: 'Conceded %', kind: 'pct' },
  { key: 'scoring_05', label: 'Scored 0.5+ %', kind: 'pct' },
  { key: 'conceding_05', label: 'Conceded 0.5+ %', kind: 'pct' },
  { key: 'scoring_15', label: 'Scored 1.5+ %', kind: 'pct' },
  { key: 'conceding_15', label: 'Conceded 1.5+ %', kind: 'pct' },
  { key: 'btts_yes', label: 'BTTS %', kind: 'pct' },
  { key: 'cs_pct', label: 'Clean sheet %', kind: 'pct' },
  { key: 'fts_pct', label: 'Failed to score %', kind: 'pct' },
  { key: 'w_pct', label: 'Win %', kind: 'pct' },
  { key: 'd_pct', label: 'Draw %', kind: 'pct' },
  { key: 'l_pct', label: 'Loss %', kind: 'pct' },
  { key: 'over15', label: 'Over 1.5 %', kind: 'pct' },
  { key: 'over25', label: 'Over 2.5 %', kind: 'pct' },
  { key: 'over35', label: 'Over 3.5 %', kind: 'pct' },
  { key: 'under15', label: 'Under 1.5 %', kind: 'pct' },
  { key: 'under25', label: 'Under 2.5 %', kind: 'pct' },
  { key: 'ppg', label: 'PPG', kind: 'avg' },
  { key: 'sc_avg', label: 'Goals for /game', kind: 'avg' },
  { key: 'conc_avg', label: 'Goals against /game', kind: 'avg' },
  { key: 'avg_goals', label: 'Total goals /game', kind: 'avg' },
];

export function filterStat(key: string): FilterStat {
  return FILTER_STATS.find((s) => s.key === key) ?? { key, label: key, kind: 'pct' };
}

/* ---- presets, straight from the strategy notes ---- */
let seq = 0;
const c = (side: Side, statKey: string, window: FilterWindow, period: FilterPeriod, scope: FilterScope, cmp: Cmp, value: number): Condition => ({
  id: `c${(seq += 1)}`,
  side, statKey, window, period, scope, cmp, value,
});

export type Preset = { id: string; label: string; note: string; minGames: number; conditions: Condition[] };

export const PRESETS: Preset[] = [
  {
    id: 'leaky',
    label: 'Leaky Leaky (BTTS & goals)',
    note: 'Both teams concede often; home not toothless, away scores on the road.',
    minGames: 10,
    conditions: [
      c('both', 'conceding_05', 'last10', 'ft', 'overall', 'gte', 80),
      c('home', 'ppg', 'all', 'ft', 'home', 'gte', 1.2),
      c('away', 'sc_pct', 'all', 'ft', 'away', 'gte', 80),
      c('both', 'btts_yes', 'all', 'ft', 'overall', 'gte', 55),
    ],
  },
  {
    id: 'secondhalf',
    label: '2nd Half Delight',
    note: 'Home leaks in 2nd halves at home; away is in scoring form. (2nd-half 0-0 rate is a match stat we can’t read per team.)',
    minGames: 10,
    conditions: [
      c('home', 'conceding_05', 'all', '2h', 'home', 'gte', 60),
      c('away', 'scoring_05', 'last5', 'ft', 'overall', 'gte', 70),
    ],
  },
  {
    id: 'over25',
    label: 'High Over 2.5',
    note: 'Both teams score freely and concede often over the last 10.',
    minGames: 10,
    conditions: [
      c('both', 'sc_avg', 'last10', 'ft', 'overall', 'gte', 1.5),
      c('both', 'conceding_05', 'last10', 'ft', 'overall', 'gte', 80),
    ],
  },
];

export function newCondition(): Condition {
  return c('both', 'conceding_05', 'last10', 'ft', 'overall', 'gte', 80);
}

/* ---- evaluation ---- */
function teamKey(name: string): string {
  return name.trim().toLowerCase();
}
function numAt(row: TeamStatRow | undefined, key: string): number | null {
  if (!row) return null;
  const cell = row[key];
  return typeof cell === 'number' && Number.isFinite(cell) ? cell : null;
}
function tablePrefix(statKey: string, window: FilterWindow): string {
  if (statKey === 'ppg') return 'ppg'; // PPG lives in its own tables, all-games only
  return window === 'all' ? 'ordinary' : window;
}
function readStat(stats: TeamStatsExport, team: string, cond: Condition, scope: FilterScope): number | null {
  const rows = stats.tables[`${tablePrefix(cond.statKey, cond.window)}_${cond.period}_${scope}`] ?? [];
  return numAt(rows.find((r) => teamKey(String(r.team_name)) === teamKey(team)), cond.statKey);
}
function seasonGames(stats: TeamStatsExport, team: string): number {
  const rows = stats.tables['ordinary_ft_overall'] ?? [];
  return numAt(rows.find((r) => teamKey(String(r.team_name)) === teamKey(team)), 'sample_size') ?? 0;
}
function passes(value: number, cmp: Cmp, target: number): boolean {
  return cmp === 'gte' ? value >= target : value <= target;
}

export type Reason = { side: 'H' | 'A'; label: string; value: number; cmp: Cmp; target: number; kind: 'pct' | 'avg' };

export type FixtureMatch = { matched: boolean; reasons: Reason[] };

/**
 * Evaluate the conditions for one fixture against its league's stats export.
 * `matched` is true only when every condition holds for the right side(s) and
 * both teams have at least `minGames` season games.
 */
export function matchFixture(
  stats: TeamStatsExport,
  homeTeam: string,
  awayTeam: string,
  conditions: Condition[],
  minGames: number,
): FixtureMatch {
  const reasons: Reason[] = [];
  if (conditions.length === 0) return { matched: false, reasons };
  if (seasonGames(stats, homeTeam) < minGames || seasonGames(stats, awayTeam) < minGames) return { matched: false, reasons };

  for (const cond of conditions) {
    const stat = filterStat(cond.statKey);
    const sides: ('home' | 'away')[] = cond.side === 'both' ? ['home', 'away'] : [cond.side];
    for (const s of sides) {
      const team = s === 'home' ? homeTeam : awayTeam;
      const v = readStat(stats, team, cond, cond.scope);
      if (v == null || !passes(v, cond.cmp, cond.value)) return { matched: false, reasons: [] };
      reasons.push({ side: s === 'home' ? 'H' : 'A', label: stat.label, value: v, cmp: cond.cmp, target: cond.value, kind: stat.kind });
    }
  }
  return { matched: true, reasons };
}
