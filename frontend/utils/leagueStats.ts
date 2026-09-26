/**
 * Spec §4.7 — League Stats: every team in a competition ranked on one stat with
 * the league average pinned underneath, so each row reads above or below the norm.
 *
 * Shapes the tables `services/statsBuilder` already produces (`ordinary_*` for
 * the teams, `league_avg_*` for the average row) instead of re-aggregating.
 * Pure — no React, no network — so it unit-tests under plain tsx.
 */
import type { ComplianceLevel } from '@/types/analytics';
import type { TeamStatRow } from '@/types/data';
import { complianceFromPercent } from '@/utils/compliance';

export type LeagueStatGroupId =
  | 'btts'
  | 'overs'
  | 'unders'
  | 'result'
  | 'scoring'
  | 'conceding'
  | 'goals';

export const LEAGUE_STAT_GROUPS: { id: LeagueStatGroupId; label: string }[] = [
  { id: 'btts', label: 'BTTS & Nil' },
  { id: 'overs', label: 'Overs' },
  { id: 'unders', label: 'Unders' },
  { id: 'result', label: 'Results' },
  { id: 'scoring', label: 'Scoring' },
  { id: 'conceding', label: 'Conceding' },
  { id: 'goals', label: 'Goal averages' },
];

export type LeagueStatDef = {
  key: string;
  label: string;
  /** Short form for the stat picker chips. */
  short: string;
  group: LeagueStatGroupId;
  /** Goals-per-game averages, not 0–100 — shown to 1dp and left unbanded. */
  avg?: boolean;
};

/**
 * The §4.7 stat set: the 34 Ordinary stats of §4.1 minus SC% / Conc% (excluded
 * by the spec) and minus the six that need per-goal timing the results feed does
 * not carry (`NOT_DERIVABLE` in services/statsBuilder).
 */
export const LEAGUE_STAT_DEFS: LeagueStatDef[] = [
  { key: 'btts_yes', label: 'BTTS - Yes', short: 'BTTS Y', group: 'btts' },
  { key: 'btts_no', label: 'BTTS - No', short: 'BTTS N', group: 'btts' },
  { key: 'cs_pct', label: 'CS — clean sheet', short: 'CS', group: 'btts' },
  { key: 'fts_pct', label: 'FTS — failed to score', short: 'FTS', group: 'btts' },

  { key: 'over05', label: 'Over 0.5', short: 'O0.5', group: 'overs' },
  { key: 'over15', label: 'Over 1.5', short: 'O1.5', group: 'overs' },
  { key: 'over25', label: 'Over 2.5', short: 'O2.5', group: 'overs' },
  { key: 'over35', label: 'Over 3.5', short: 'O3.5', group: 'overs' },
  { key: 'over45', label: 'Over 4.5', short: 'O4.5', group: 'overs' },

  { key: 'under05', label: 'Under 0.5', short: 'U0.5', group: 'unders' },
  { key: 'under15', label: 'Under 1.5', short: 'U1.5', group: 'unders' },
  { key: 'under25', label: 'Under 2.5', short: 'U2.5', group: 'unders' },
  { key: 'under35', label: 'Under 3.5', short: 'U3.5', group: 'unders' },
  { key: 'under45', label: 'Under 4.5', short: 'U4.5', group: 'unders' },

  { key: 'w_pct', label: 'W — won', short: 'W', group: 'result' },
  { key: 'd_pct', label: 'D — drawn', short: 'D', group: 'result' },
  { key: 'l_pct', label: 'L — lost', short: 'L', group: 'result' },

  { key: 'scoring_05', label: 'Scoring 0.5 or more', short: 'Sc 1+', group: 'scoring' },
  { key: 'scoring_15', label: 'Scoring 1.5 or more', short: 'Sc 2+', group: 'scoring' },
  { key: 'scoring_25', label: 'Scoring 2.5 or more', short: 'Sc 3+', group: 'scoring' },

  { key: 'conceding_05', label: 'Conceding 0.5 or more', short: 'Cnc 1+', group: 'conceding' },
  { key: 'conceding_15', label: 'Conceding 1.5 or more', short: 'Cnc 2+', group: 'conceding' },
  { key: 'conceding_25', label: 'Conceding 2.5 or more', short: 'Cnc 3+', group: 'conceding' },

  { key: 'avg_goals', label: 'AVG — goals per game', short: 'AVG', group: 'goals', avg: true },
  { key: 'sc_avg', label: 'SC/m — scored per game', short: 'SC/m', group: 'goals', avg: true },
  { key: 'conc_avg', label: 'Conc/m — conceded per game', short: 'Conc/m', group: 'goals', avg: true },
];

/** The two leading Ordinary stats §4.7 leaves out. */
export const LEAGUE_STAT_EXCLUDED = ['sc_pct', 'conc_pct'] as const;

/** Finished games a team needs before its percentage is worth reading. */
export const MIN_LEAGUE_SAMPLE = 4;

export const DEFAULT_LEAGUE_STAT = 'btts_yes';

export function leagueStatDef(key: string): LeagueStatDef | undefined {
  return LEAGUE_STAT_DEFS.find((d) => d.key === key);
}

export function leagueStatsInGroup(group: LeagueStatGroupId): LeagueStatDef[] {
  return LEAGUE_STAT_DEFS.filter((d) => d.group === group);
}

export type LeagueStatSide = 'above' | 'level' | 'below';

export type LeagueStatRank = {
  team: string;
  rank: number;
  value: number;
  /** Finished games behind the value. */
  sample: number;
  /** value − league average, at the average's precision. */
  diff: number;
  side: LeagueStatSide;
  level: ComplianceLevel | null;
  /** Under `MIN_LEAGUE_SAMPLE` games — listed, but not yet meaningful. */
  thin: boolean;
};

export type LeagueAverage = {
  value: number;
  level: ComplianceLevel | null;
  /** Teams behind the average. */
  teams: number;
  /** Smallest per-team sample among them. */
  minSample: number;
};

export type LeagueStatTable = {
  stat: LeagueStatDef;
  /** Highest first. */
  rows: LeagueStatRank[];
  average: LeagueAverage | null;
  /** Rows at or above the average — where the divider goes. */
  divideAfter: number;
  thinTeams: number;
};

const LEVELS = new Set(['green', 'yellow', 'red']);

function numberAt(row: TeamStatRow, key: string): number | null {
  const cell = row[key];
  return typeof cell === 'number' && Number.isFinite(cell) ? cell : null;
}

/** The builder's own band, falling back to the shared percentage thresholds. */
function levelAt(row: TeamStatRow, def: LeagueStatDef, value: number): ComplianceLevel | null {
  const signal = row[`${def.key}_signal`];
  if (typeof signal === 'string' && LEVELS.has(signal)) return signal as ComplianceLevel;
  return def.avg ? null : complianceFromPercent(value);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Rank every team in a competition on one stat, with the league average.
 *
 * `leagueRow` is the builder's `league_avg_*` row; when it is missing the mean
 * of the listed team values stands in. Returns null for an unknown stat key.
 */
export function buildLeagueStatTable(opts: {
  statKey: string;
  teamRows: TeamStatRow[];
  leagueRow?: TeamStatRow | null;
  minSample?: number;
}): LeagueStatTable | null {
  const def = leagueStatDef(opts.statKey);
  if (!def) return null;

  const minSample = opts.minSample ?? MIN_LEAGUE_SAMPLE;
  const entries = opts.teamRows
    .map((row) => {
      const value = numberAt(row, def.key);
      if (value == null) return null;
      return {
        team: String(row.team_name),
        value: def.avg ? round1(value) : Math.round(value),
        sample: numberAt(row, 'sample_size') ?? 0,
        level: levelAt(row, def, value),
      };
    })
    .filter((e): e is NonNullable<typeof e> => e != null)
    .sort((a, b) => b.value - a.value || a.team.localeCompare(b.team));

  const leagueValue = opts.leagueRow ? numberAt(opts.leagueRow, def.key) : null;
  const mean = entries.length
    ? entries.reduce((sum, e) => sum + e.value, 0) / entries.length
    : null;
  const averageValue = leagueValue ?? mean;

  const rows: LeagueStatRank[] = entries.map((e, i) => {
    const diff = averageValue == null ? 0 : round1(e.value - averageValue);
    return {
      team: e.team,
      rank: i + 1,
      value: e.value,
      sample: e.sample,
      diff,
      side: diff > 0 ? 'above' : diff < 0 ? 'below' : 'level',
      level: e.level,
      thin: e.sample < minSample,
    };
  });

  const average: LeagueAverage | null =
    averageValue == null
      ? null
      : {
          value: round1(averageValue),
          level: opts.leagueRow
            ? levelAt(opts.leagueRow, def, averageValue)
            : def.avg
              ? null
              : complianceFromPercent(averageValue),
          teams: entries.length,
          minSample: entries.reduce((lo, e) => Math.min(lo, e.sample), Number.POSITIVE_INFINITY),
        };

  return {
    stat: def,
    rows,
    average: average && average.teams > 0 ? average : null,
    divideAfter: rows.filter((r) => r.side !== 'below').length,
    thinTeams: rows.filter((r) => r.thin).length,
  };
}
