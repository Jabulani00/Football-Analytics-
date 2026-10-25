/**
 * Opposite Stats Analysis.
 *
 * Compares complementary ("opposite") stat pairs for each team:
 *   • SC%   vs FTS%  (scored vs failed to score)
 *   • Conc% vs CS%   (conceded vs clean sheet)
 * The difference is "short" (≤ 15% → no DA, balanced near 50/50) or "long"
 * (> 15% → DA). A team only qualifies when the trigger holds — it both scores
 * and concedes: SC/m ≥ 1 and Conc/m ≥ 1 ("somewhere ↑ & somewhere ↓").
 * Teams are arranged smallest difference first. Values come from the live stat
 * tables statsBuilder already produces; nothing is recalculated here.
 *
 * Pure: no network, no React.
 */
import type { TeamStatRow, TeamStatsExport } from '@/types/data';

/** ≤ this % difference is a short difference → no DA (balanced). */
export const SHORT_MAX = 15;
/** Trigger: average goals scored / conceded per match must reach this. */
export const TRIGGER_RATE = 1;

export type OppositeScope = 'overall' | 'home' | 'away';

export type OppositePairDef = { aKey: string; aLabel: string; bKey: string; bLabel: string };

export const OPPOSITE_PAIRS: OppositePairDef[] = [
  { aKey: 'sc_pct', aLabel: 'SC%', bKey: 'fts_pct', bLabel: 'FTS%' },
  { aKey: 'conc_pct', aLabel: 'Conc%', bKey: 'cs_pct', bLabel: 'CS%' },
];

export type Allocation = 'short' | 'long' | 'na';

export type OppositePair = {
  aLabel: string;
  bLabel: string;
  aValue: number | null;
  bValue: number | null;
  difference: number | null;
  allocation: Allocation;
  /** Long difference = Double Agent candidate on this pair. */
  isDA: boolean;
};

export type OppositeRow = {
  team: string;
  teamId: number | null;
  competition: string;
  scope: OppositeScope;
  pairs: OppositePair[];
  scAvg: number | null;
  concAvg: number | null;
  /** SC/m ≥ 1 and Conc/m ≥ 1. */
  trigger: boolean;
  /** Smallest pair difference — the sort key. */
  minDifference: number | null;
};

function numAt(row: TeamStatRow | undefined, key: string): number | null {
  if (!row) return null;
  const cell = row[key];
  return typeof cell === 'number' && Number.isFinite(cell) ? cell : null;
}

export function allocationFor(difference: number | null): Allocation {
  if (difference == null) return 'na';
  return Math.abs(difference) <= SHORT_MAX ? 'short' : 'long';
}

function pairFor(def: OppositePairDef, row: TeamStatRow | undefined): OppositePair {
  const aValue = numAt(row, def.aKey);
  const bValue = numAt(row, def.bKey);
  const difference = aValue != null && bValue != null ? Math.abs(aValue - bValue) : null;
  const allocation = allocationFor(difference);
  return { aLabel: def.aLabel, bLabel: def.bLabel, aValue, bValue, difference, allocation, isDA: allocation === 'long' };
}

/**
 * Build the opposite-stats rows for one competition at a given scope (overall,
 * home or away — "isolate home or away as the fixture is"). Trigger uses the
 * same scope's SC/m and Conc/m.
 */
export function buildOppositeStats(stats: TeamStatsExport, competition: string, scope: OppositeScope): OppositeRow[] {
  const rows = stats.tables[`ordinary_ft_${scope}`] ?? [];
  const out: OppositeRow[] = [];
  for (const row of rows) {
    const pairs = OPPOSITE_PAIRS.map((def) => pairFor(def, row));
    const scAvg = numAt(row, 'sc_avg');
    const concAvg = numAt(row, 'conc_avg');
    const trigger = scAvg != null && concAvg != null && scAvg >= TRIGGER_RATE && concAvg >= TRIGGER_RATE;
    const diffs = pairs.map((p) => p.difference).filter((d): d is number => d != null);
    const teamIdRaw = row['team_id'];
    out.push({
      team: String(row.team_name),
      teamId: typeof teamIdRaw === 'number' && Number.isFinite(teamIdRaw) ? teamIdRaw : null,
      competition,
      scope,
      pairs,
      scAvg,
      concAvg,
      trigger,
      minDifference: diffs.length ? Math.min(...diffs) : null,
    });
  }
  return out;
}

/** Smallest difference first (balanced teams lead); teams with no data sink. */
export function sortOpposite(rows: OppositeRow[]): OppositeRow[] {
  return [...rows].sort((a, b) => (a.minDifference ?? 1e9) - (b.minDifference ?? 1e9) || a.team.localeCompare(b.team));
}
