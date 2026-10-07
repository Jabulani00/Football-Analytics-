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

type Col = { key: string; label: string; raw?: boolean };

/** Default (ordinary / league_avg) columns — percentage stats. */
export const DISPLAY_STATS: Col[] = [
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

const PPG_COLS: Col[] = [
  { key: 'ppg', label: 'PPG', raw: true },
  { key: 'w_pct', label: 'Win%' },
  { key: 'd_pct', label: 'Draw%' },
  { key: 'l_pct', label: 'Loss%' },
  { key: 'btts_yes', label: 'BTTS' },
  { key: 'cs_pct', label: 'CS%' },
  { key: 'over25', label: 'O2.5' },
];

const SERIES_COLS: Col[] = [
  { key: 'win_streak', label: 'Win', raw: true },
  { key: 'unbeaten_streak', label: 'Unb', raw: true },
  { key: 'loss_streak', label: 'Loss', raw: true },
  { key: 'btts_streak', label: 'BTTS', raw: true },
  { key: 'over25_streak', label: 'O2.5', raw: true },
  { key: 'cs_streak', label: 'CS', raw: true },
  { key: 'scoring_streak', label: 'Sc', raw: true },
  { key: 'fts_streak', label: 'FTS', raw: true },
];

const FT_ONLY_COLS: Col[] = [
  { key: 'won_both_halves', label: 'Won BH' },
  { key: 'win_to_nil', label: 'Win-Nil' },
  { key: 'scored_both_halves', label: 'Scr BH' },
  { key: 'conceded_both_halves', label: 'Cnc BH' },
  { key: 'led_ht', label: 'Led HT' },
  { key: 'cs_pct', label: 'CS%' },
];

export function columnsForFamily(family?: StatFamily): Col[] {
  switch (family) {
    case 'ppg':
      return PPG_COLS;
    case 'series':
      return SERIES_COLS;
    case 'ft_only':
      return FT_ONLY_COLS;
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
function rawCompliance(key: string, v: number): ComplianceLevel {
  if (key.includes('streak')) return v >= 3 ? 'green' : v >= 1 ? 'yellow' : 'red';
  if (key === 'ppg' || key === 'avg_pts') return complianceFromPpg(v);
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

function sampleCompliance(col: Col, value: number): ComplianceLevel {
  if (!col.raw) return complianceFromPercent(value);
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

export function liveRowsToDisplay(rows: TeamStatRow[], family?: StatFamily): TeamStatsRow[] {
  const cols = columnsForFamily(family);
  return rows.map((row) => ({
    team: String(row.team_name),
    games: rowGames(row),
    metrics: cols.map(({ key, label, raw }) => {
      const cell = row[key];
      const num = typeof cell === 'number' && Number.isFinite(cell) ? cell : 0;
      const value = raw ? Math.round(num * 100) / 100 : Math.round(num);
      const signal = row[`${key}_signal`];
      const compliance: ComplianceLevel =
        signal === 'green' || signal === 'yellow' || signal === 'red'
          ? signal
          : raw
            ? rawCompliance(key, num)
            : complianceFromPercent(value);
      return { key, label, value, compliance, raw };
    }),
  }));
}

/** Sort teams by their first (primary) metric desc — win% / PPG / win-streak etc. */
export function sortByPrimary(rows: TeamStatsRow[]): TeamStatsRow[] {
  return [...rows].sort((a, b) => (b.metrics[0]?.value ?? 0) - (a.metrics[0]?.value ?? 0));
}
