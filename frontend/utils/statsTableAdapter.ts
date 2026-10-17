/**
 * Adapts the live `statsBuilder` output (TeamStatsExport / TeamStatRow) to the
 * shape the Analytics Stats Tables panel renders (`TeamStatsRow` = {team,
 * metrics:[{key,label,value,compliance,raw}]}).
 *
 * Family-aware: the ppg / series / ft_only families show their own columns.
 * Pure — no network, no React — so it unit-tests and reuses cleanly.
 */
import type { ComplianceLevel, StatFamily, StatsTableMeta, TeamStatsRow } from '@/types/analytics';
import type { TeamStatRow } from '@/types/data';
import { rowGames } from '@/utils/countedGames';
import { complianceFromPercent, complianceFromPpg } from '@/utils/compliance';
import { SERIES_DEFS } from '@/utils/fixtureSeries';

type Col = { key: string; label: string; raw?: boolean };

/** Default (ordinary / league_avg) columns — percentage stats. */
export const DISPLAY_STATS: Col[] = [
  { key: 'sc_pct', label: 'SC%' },
  { key: 'conc_pct', label: 'Conc%' },
  { key: 'sc_avg', label: 'SC/m', raw: true },
  { key: 'conc_avg', label: 'Conc/m', raw: true },
  { key: 'btts_yes', label: 'BTTS Yes' },
  { key: 'btts_no', label: 'BTTS No' },
  { key: 'cs_pct', label: 'CS' },
  { key: 'avg_goals', label: 'AVG goals', raw: true },
  { key: 'fts_pct', label: 'FTS' },
  { key: 'w_pct', label: 'W' },
  { key: 'd_pct', label: 'D' },
  { key: 'l_pct', label: 'L' },
  { key: 'over15', label: 'Over 1.5' },
  { key: 'over25', label: 'Over 2.5' },
  { key: 'over35', label: 'Over 3.5' },
  { key: 'over45', label: 'Over 4.5' },
  { key: 'under15', label: 'Under 1.5' },
  { key: 'under25', label: 'Under 2.5' },
  { key: 'under35', label: 'Under 3.5' },
  { key: 'under45', label: 'Under 4.5' },
  { key: 'over05', label: 'Over 0.5' },
  { key: 'under05', label: 'Under 0.5' },
  { key: 'scoring_05', label: 'Scoring 0.5+' },
  { key: 'conceding_05', label: 'Conceding 0.5+' },
  { key: 'scoring_15', label: 'Scoring 1.5+' },
  { key: 'conceding_15', label: 'Conceding 1.5+' },
  { key: 'scoring_25', label: 'Scoring 2.5+' },
  { key: 'conceding_25', label: 'Conceding 2.5+' },
  { key: 'scored_first', label: 'Scored First' },
  { key: 'handicap', label: 'Handicap' },
  { key: 'early_goals_1h', label: 'Early 1H (20m)' },
  { key: 'early_goals_2h', label: 'Early 2H (60m)' },
  { key: 'early_goals_conceded', label: 'Early conceded' },
  { key: 'late_goals', label: 'Late goals' },
];

const PPG_COLS: Col[] = [
  { key: 'ppg', label: 'PPG', raw: true },
  { key: 'ppg_vs_green', label: 'vs Green', raw: true },
  { key: 'ppg_vs_yellow', label: 'vs Yellow', raw: true },
  { key: 'ppg_vs_red', label: 'vs Red', raw: true },
];

const SERIES_COLS: Col[] = SERIES_DEFS.map((def) => ({
  key: def.key,
  label: `${def.label}${def.invert ? ' without' : ''}`,
  raw: true,
}));

const FT_ONLY_COLS: Col[] = [
  { key: 'won_both_halves', label: 'Won BH' },
  { key: 'win_to_nil', label: 'Win-Nil' },
  { key: 'scored_both_halves', label: 'Scr BH' },
  { key: 'conceded_both_halves', label: 'Cnc BH' },
  { key: 'led_ht', label: 'Led HT' },
  { key: 'cs_pct', label: 'CS%' },
];

const HALF_ONLY_COLS: Col[] = [
  { key: 'half_nil', label: '0–0' },
  { key: 'half_under05', label: 'Under 0.5' },
  { key: 'half_over15', label: 'Over 1.5' },
  { key: 'half_avg', label: 'Average goals', raw: true },
];

export function columnsForFamily(family?: StatFamily): Col[] {
  switch (family) {
    case 'ppg':
      return PPG_COLS;
    case 'series':
      return SERIES_COLS;
    case 'ft_only':
      return FT_ONLY_COLS;
    case 'half_only':
      return HALF_ONLY_COLS;
    default:
      return DISPLAY_STATS; // ordinary, league_avg
  }
}

const PERIOD_MAP: Record<StatsTableMeta['period'], string> = {
  fulltime: 'ft',
  firsthalf: 'ht',
  secondhalf: '2h',
};

/**
 * Map a panel table to a live builder table name. Last-N windows use the recency
 * prefix; base tables use the stat family, e.g.
 * `{period:fulltime, split:home, family:series}` -> `series_ft_home`;
 * `{period:fulltime, split:home, recency:last8}` -> `last8_ft_home`.
 */
export function metaToLiveTableName(meta: StatsTableMeta): string {
  const period = PERIOD_MAP[meta.period];
  const prefix =
    meta.recency && meta.recency !== 'all' ? meta.recency : meta.family ?? 'ordinary';
  return `${prefix}_${period}_${meta.split}`;
}

/**
 * Traffic-light for the stats that are not percentages, so the shared
 * `complianceFromPercent` cut-offs do not apply to them: a streak is a count of
 * matches (3+ is a run worth naming) and PPG has its own 0–3 scale. Anything
 * that *is* a percentage falls through to the one shared rule.
 */
function rawCompliance(key: string, v: number): ComplianceLevel | null {
  if (key.includes('streak')) return v >= 3 ? 'green' : v >= 1 ? 'yellow' : 'red';
  if (SERIES_DEFS.some((def) => def.key === key)) return v >= 5 ? 'green' : v >= 3 ? 'yellow' : 'red';
  if (key.startsWith('ppg') || key === 'avg_pts') return complianceFromPpg(v);
  if (['sc_avg', 'conc_avg', 'avg_goals', 'half_avg'].includes(key)) return null;
  return complianceFromPercent(v);
}

/** Convert live builder rows into the panel's display rows for a given family. */
const SAMPLE_TEAMS = [
  { team: 'Manchester City', seed: 2 },
  { team: 'Arsenal', seed: 5 },
  { team: 'Liverpool', seed: 8 },
];

function sampleValue(col: Col, seed: number, index: number, salt: number): number {
  const n = seed + salt * 5 + index;
  if (col.raw && col.key.includes('streak')) return (seed * 2 + index + salt) % 7;
  if (col.raw) return Math.round((0.8 + (seed % 5) * 0.35 + index * 0.04 + salt * 0.07) * 100) / 100;
  return 20 + ((n * 11) % 60);
}

function sampleCompliance(col: Col, value: number): ComplianceLevel | null {
  if (!col.raw) return complianceFromPercent(value);
  if (['sc_avg', 'conc_avg', 'avg_goals', 'half_avg'].includes(col.key)) return null;
  if (col.key.includes('streak')) return value >= 3 ? 'green' : value >= 1 ? 'yellow' : 'red';
  return complianceFromPpg(value);
}

/**
 * Stand-in rows when a live table is not available. Columns follow the family,
 * so PPG / series / full-time patterns do not render as ordinary percentages.
 */
export function sampleRowsForFamily(family?: StatFamily, salt = 0): TeamStatsRow[] {
  const cols = columnsForFamily(family);
  return SAMPLE_TEAMS.map(({ team, seed }) => ({
    team,
    metrics: cols.map((col, index) => {
      const value = sampleValue(col, seed, index, salt);
      return {
        key: col.key,
        label: col.label,
        value,
        compliance: sampleCompliance(col, value),
        raw: col.raw,
      };
    }),
  }));
}

const LEAD_FLOOR = 5;

export function liveRowsToDisplay(rows: TeamStatRow[], family?: StatFamily): TeamStatsRow[] {
  const cols = columnsForFamily(family);
  return rows.map((row) => {
    const played = typeof row.sample_size === 'number' && Number.isFinite(row.sample_size) ? row.sample_size : undefined;
    return {
      team: String(row.team_name),
      played,
      games: rowGames(row),
      metrics: cols.map(({ key, label, raw }) => {
        const cell = row[key];
        const finite = typeof cell === 'number' && Number.isFinite(cell);
        const value = finite ? (raw ? Math.round(cell * 100) / 100 : Math.round(cell * 10) / 10) : null;
        const signal = row[`${key}_signal`];
        const compliance: ComplianceLevel | null =
          !finite
            ? 'red'
            : signal === 'green' || signal === 'yellow' || signal === 'red'
              ? signal
              : raw
                ? rawCompliance(key, cell)
                : complianceFromPercent(value as number);
        return { key, label, value, compliance, raw };
      }),
    };
  });
}

/** Leaders need five games. Thinner samples stay on the table, after the leaders, and a blank never sorts as zero. */
export function sortByPrimary(rows: TeamStatsRow[]): TeamStatsRow[] {
  return [...rows].sort((a, b) => {
    const av = a.metrics[0]?.value;
    const bv = b.metrics[0]?.value;
    if (av == null && bv == null) return (b.played ?? 0) - (a.played ?? 0) || a.team.localeCompare(b.team);
    if (av == null) return 1;
    if (bv == null) return -1;
    const aLead = (a.played ?? LEAD_FLOOR) >= LEAD_FLOOR;
    const bLead = (b.played ?? LEAD_FLOOR) >= LEAD_FLOOR;
    if (aLead !== bLead) return aLead ? -1 : 1;
    if (bv !== av) return bv - av;
    return (b.played ?? 0) - (a.played ?? 0) || a.team.localeCompare(b.team);
  });
}
