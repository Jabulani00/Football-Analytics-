/**
 * Dominance Checker — Home/Away and 1st-Half/2nd-Half analysis.
 *
 * For every stat it compares two sides (Home vs Away, or 1st half vs 2nd half),
 * takes the difference: 0–15 is None DA, 16–24 is Lean DA, and 25+ is DA.
 * Values are read from the live stat tables statsBuilder already produces; the
 * percentage difference is in points for % stats and relative for raw stats
 * (PPG, AVG goals).
 *
 * Pure: no network, no React.
 */
import type { TeamStatRow, TeamStatsExport } from '@/types/data';
import { DA_MIN, NONE_DA_MAX, differenceDaBand } from '@/utils/daBands';

/** Compatibility names used by the existing UI. */
export const LONG_DIFF = DA_MIN;
export const EVEN_DIFF = NONE_DA_MAX;

export type StatFamily = 'ordinary' | 'ppg';
export type StatDef = { key: string; label: string; family: StatFamily; pctBased: boolean; decimals: number };

const pct = (key: string, label: string): StatDef => ({ key, label, family: 'ordinary', pctBased: true, decimals: 0 });

/** The headline four first, then the rest of the catalogue — "all stats". */
export const DOMINANCE_STATS: StatDef[] = [
  { key: 'ppg', label: 'PPG', family: 'ppg', pctBased: false, decimals: 2 },
  pct('sc_pct', 'SC%'),
  pct('conc_pct', 'Conc%'),
  { key: 'avg_goals', label: 'AVG', family: 'ordinary', pctBased: false, decimals: 2 },
  pct('btts_yes', 'BTTS Yes'),
  pct('cs_pct', 'Clean sheet'),
  pct('fts_pct', 'Failed to score'),
  pct('w_pct', 'Win'),
  pct('d_pct', 'Draw'),
  pct('l_pct', 'Loss'),
  pct('over15', 'Over 1.5'),
  pct('over25', 'Over 2.5'),
  pct('over35', 'Over 3.5'),
  pct('under15', 'Under 1.5'),
  pct('under25', 'Under 2.5'),
  pct('scoring_15', 'Scoring 1.5+'),
  pct('conceding_15', 'Conceding 1.5+'),
];

/** PPG is a whole-match points figure, so it is not split across halves. */
export const HALF_STATS: StatDef[] = DOMINANCE_STATS.filter((d) => d.key !== 'ppg');

export type DominanceMagnitude = 'long' | 'mid' | 'short' | 'na';
/** 'a' = Home / 1st half · 'b' = Away / 2nd half. */
export type DominanceSide = 'a' | 'b' | 'even' | 'na';

export type DominanceRow = {
  statKey: string;
  statLabel: string;
  pctBased: boolean;
  decimals: number;
  a: number | null;
  b: number | null;
  /** a − b, signed. */
  difference: number | null;
  /** Classification magnitude: points for % stats, relative % for raw stats. */
  measure: number | null;
  side: DominanceSide;
  magnitude: DominanceMagnitude;
};

export type TeamHomeAwayValues = {
  team: string;
  teamId: number | null;
  home: number | null;
  away: number | null;
};

function numAt(row: TeamStatRow | undefined, key: string): number | null {
  if (!row) return null;
  const cell = row[key];
  return typeof cell === 'number' && Number.isFinite(cell) ? cell : null;
}
function teamKey(name: string): string {
  return name.trim().toLowerCase();
}

function valueAt(stats: TeamStatsExport, family: StatFamily, period: string, scope: string, team: string, key: string): number | null {
  const rows = stats.tables[`${family}_${period}_${scope}`] ?? [];
  const row = rows.find((r) => teamKey(String(r.team_name)) === teamKey(team));
  return numAt(row, key);
}

/** Classification magnitude: percentage points for % stats, relative % otherwise. */
export function measureFor(a: number | null, b: number | null, pctBased: boolean): number | null {
  if (a == null || b == null) return null;
  if (pctBased) return Math.abs(a - b);
  const mean = (Math.abs(a) + Math.abs(b)) / 2;
  return mean === 0 ? 0 : (Math.abs(a - b) / mean) * 100;
}

export function classify(a: number | null, b: number | null, measure: number | null): { side: DominanceSide; magnitude: DominanceMagnitude } {
  if (a == null || b == null || measure == null) return { side: 'na', magnitude: 'na' };
  const band = differenceDaBand(measure);
  const magnitude: DominanceMagnitude = band === 'da' ? 'long' : band === 'lean' ? 'mid' : band === 'none' ? 'short' : 'na';
  if (magnitude === 'short') return { side: 'even', magnitude };
  const side: DominanceSide = a > b ? 'a' : a < b ? 'b' : 'even';
  return { side, magnitude };
}

function dominanceRow(def: StatDef, a: number | null, b: number | null): DominanceRow {
  const difference = a != null && b != null ? a - b : null;
  const measure = measureFor(a, b, def.pctBased);
  const { side, magnitude } = classify(a, b, measure);
  return { statKey: def.key, statLabel: def.label, pctBased: def.pctBased, decimals: def.decimals, a, b, difference, measure, side, magnitude };
}

/** Read only the selected stat's full-time home and away values for each team. */
export function homeAwayValuesForStat(stats: TeamStatsExport, statKey: string): TeamHomeAwayValues[] {
  const def = DOMINANCE_STATS.find((item) => item.key === statKey);
  if (!def) return [];
  const rows = stats.tables['ordinary_ft_overall'] ?? [];
  const sideValues = (scope: 'home' | 'away') => new Map<string, number | null>(
    (stats.tables[`${def.family}_ft_${scope}`] ?? []).map((row) => [
      teamKey(String(row.team_name)),
      numAt(row, def.key),
    ] as const),
  );
  const homeValues = sideValues('home');
  const awayValues = sideValues('away');
  return rows.map((row) => {
    const team = String(row.team_name);
    const teamId = numAt(row, 'team_id');
    return {
      team,
      teamId,
      home: homeValues.get(teamKey(team)) ?? null,
      away: awayValues.get(teamKey(team)) ?? null,
    };
  });
}

/** Home vs Away, full time, for one team — a row per stat. */
export function buildHomeAwayDominance(stats: TeamStatsExport, team: string): DominanceRow[] {
  return DOMINANCE_STATS.map((d) =>
    dominanceRow(d, valueAt(stats, d.family, 'ft', 'home', team, d.key), valueAt(stats, d.family, 'ft', 'away', team, d.key)),
  );
}

/** 1st half vs 2nd half (overall), for one team — a row per stat. */
export function buildHalfDominance(stats: TeamStatsExport, team: string): DominanceRow[] {
  return HALF_STATS.map((d) =>
    dominanceRow(d, valueAt(stats, d.family, 'ht', 'overall', team, d.key), valueAt(stats, d.family, '2h', 'overall', team, d.key)),
  );
}

/** Team names present in the competition (from the all-games table), sorted. */
export function teamNamesIn(stats: TeamStatsExport): string[] {
  return (stats.tables['ordinary_ft_overall'] ?? [])
    .map((r) => String(r.team_name))
    .sort((a, b) => a.localeCompare(b));
}

/** Count of stats where a side holds a long (dominant) difference. */
export function dominanceTally(rows: DominanceRow[]): { a: number; b: number; even: number } {
  const t = { a: 0, b: 0, even: 0 };
  for (const r of rows) {
    if (r.magnitude === 'long' && (r.side === 'a' || r.side === 'b')) t[r.side] += 1;
    else if (r.side === 'even') t.even += 1;
  }
  return t;
}
