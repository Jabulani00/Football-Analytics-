/**
 * Adapts the live `statsBuilder` output (TeamStatsExport / TeamStatRow) to the
 * shape the Analytics Stats Tables panel renders (`TeamStatsRow` = {team,
 * metrics:[{key,label,value,compliance}]}).
 *
 * Pure — no network, no React — so it unit-tests and reuses cleanly.
 */
import type { ComplianceLevel, StatsTableMeta, TeamStatsRow } from '@/types/analytics';
import type { TeamStatRow } from '@/types/data';
import { complianceFromPercent } from '@/utils/compliance';

/** Columns shown in the table (all percentage stats the builder derives). */
export const DISPLAY_STATS: { key: string; label: string }[] = [
  { key: 'w_pct', label: 'Win%' },
  { key: 'd_pct', label: 'Draw%' },
  { key: 'l_pct', label: 'Loss%' },
  { key: 'btts_yes', label: 'BTTS' },
  { key: 'cs_pct', label: 'CS%' },
  { key: 'fts_pct', label: 'FTS%' },
  { key: 'sc_pct', label: 'Scored' },
  { key: 'conc_pct', label: 'Conc' },
  { key: 'over15', label: 'O1.5' },
  { key: 'over25', label: 'O2.5' },
  { key: 'over35', label: 'O3.5' },
  { key: 'scoring_15', label: 'Sc2+' },
];

const PERIOD_MAP: Record<StatsTableMeta['period'], string> = {
  fulltime: 'ft',
  firsthalf: 'ht',
  secondhalf: '2h',
};

/**
 * Map a panel table (period/split/recency) to a live builder table name, e.g.
 * `{period:fulltime, split:home, recency:last8}` -> `last8_ft_home`.
 */
export function metaToLiveTableName(meta: StatsTableMeta): string {
  const period = PERIOD_MAP[meta.period];
  const prefix =
    meta.recency && meta.recency !== 'all' ? meta.recency : 'ordinary';
  return `${prefix}_${period}_${meta.split}`;
}

/** Convert live builder rows into the panel's display rows. */
export function liveRowsToDisplay(rows: TeamStatRow[]): TeamStatsRow[] {
  return rows.map((row) => ({
    team: String(row.team_name),
    metrics: DISPLAY_STATS.map(({ key, label }) => {
      const raw = row[key];
      const value = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : 0;
      const signal = row[`${key}_signal`];
      const compliance: ComplianceLevel =
        signal === 'green' || signal === 'yellow' || signal === 'red'
          ? signal
          : complianceFromPercent(value);
      return { key, label, value, compliance };
    }),
  }));
}

/** Sort teams by win% desc for a stable, meaningful default order. */
export function sortByWinPct(rows: TeamStatsRow[]): TeamStatsRow[] {
  const winOf = (r: TeamStatsRow) => r.metrics.find((m) => m.key === 'w_pct')?.value ?? 0;
  return [...rows].sort((a, b) => winOf(b) - winOf(a));
}
