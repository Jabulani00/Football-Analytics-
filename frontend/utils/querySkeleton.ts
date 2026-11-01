/**
 * Query Skeleton engine — makes the strategy skeleton callable against the live
 * stats we already pull. For one stat call (a stat + a split) it returns every
 * team's two side-values, their difference and its DA status, ranked biggest
 * difference first ("biggest at the top, smallest at the bottom"). It also
 * indexes the upcoming value-odds feed so a team's next fixture can show a price.
 *
 * Nothing is recomputed from scratch: side values come from the same live stat
 * tables statsBuilder produces, the measure reuses dominance.measureFor, and the
 * DA bands reuse the shared None DA / Lean DA / DA cutoffs.
 *
 * Pure: no network, no React.
 */
import type { TeamStatRow, TeamStatsExport } from '@/types/data';
import type { RawValueBet, RawValueOddsLine } from '@/services/oddAlerts';
import { DOMINANCE_STATS, HALF_STATS, measureFor } from '@/utils/dominance';
import { daBand, type DaBand } from '@/utils/unity';

/** Home vs Away, or 1st vs 2nd half — the two sides a difference is read across. */
export type SplitMode = 'homeaway' | 'halves';

export const SPLITS: { id: SplitMode; label: string; aLabel: string; bLabel: string }[] = [
  { id: 'homeaway', label: 'Home vs Away', aLabel: 'Home', bLabel: 'Away' },
  { id: 'halves', label: '1st vs 2nd Half', aLabel: '1st H', bLabel: '2nd H' },
];

/** The stats a call can be made on, per split (PPG is whole-match, so no halves). */
export function callStats(split: SplitMode): { key: string; label: string }[] {
  const defs = split === 'halves' ? HALF_STATS : DOMINANCE_STATS;
  return defs.map((d) => ({ key: d.key, label: d.label }));
}

export type Tier = 'top' | 'middle' | 'bottom' | 'na';

export function tierOf(difference: number | null): Tier {
  if (difference == null || !Number.isFinite(difference)) return 'na';
  const magnitude = Math.abs(difference);
  if (magnitude >= 60) return 'top';
  if (magnitude >= 40) return 'middle';
  return 'bottom';
}

export type SkeletonRow = {
  team: string;
  teamId: number | null;
  competition: string;
  /** Home / 1st-half value. */
  aValue: number | null;
  /** Away / 2nd-half value. */
  bValue: number | null;
  /** Overall (full-season) value, for reference. */
  overall: number | null;
  /** Signed a − b. */
  difference: number | null;
  /** Classification magnitude (points for % stats, relative % for raw). */
  measure: number | null;
  band: DaBand;
  tier: Tier;
  /** Games behind the smaller of the two sides — guards against 1-game 100%. */
  sample: number | null;
  pctBased: boolean;
  decimals: number;
};

function numAt(row: TeamStatRow | undefined, key: string): number | null {
  if (!row) return null;
  const cell = row[key];
  return typeof cell === 'number' && Number.isFinite(cell) ? cell : null;
}
function teamKey(name: string): string {
  return name.trim().toLowerCase();
}
function valueAt(stats: TeamStatsExport, family: string, period: string, scope: string, team: string, key: string): number | null {
  const rows = stats.tables[`${family}_${period}_${scope}`] ?? [];
  return numAt(rows.find((r) => teamKey(String(r.team_name)) === teamKey(team)), key);
}
/** Games played on a side — read from the always-present ordinary tables. */
function sampleAt(stats: TeamStatsExport, period: string, scope: string, team: string): number | null {
  return valueAt(stats, 'ordinary', period, scope, team, 'sample_size');
}
function minSample(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return Math.min(a ?? 0, b ?? 0);
}

/** Every team's reading for one stat call in a competition. */
export function buildStatCall(
  stats: TeamStatsExport,
  competition: string,
  statKey: string,
  split: SplitMode,
): SkeletonRow[] {
  const defs = split === 'halves' ? HALF_STATS : DOMINANCE_STATS;
  const def = defs.find((d) => d.key === statKey);
  if (!def) return [];
  const teamRows = stats.tables['ordinary_ft_overall'] ?? [];

  return teamRows.map((r) => {
    const team = String(r.team_name);
    const idRaw = r['team_id'];
    const teamId = typeof idRaw === 'number' && Number.isFinite(idRaw) ? idRaw : null;
    const a =
      split === 'homeaway'
        ? valueAt(stats, def.family, 'ft', 'home', team, def.key)
        : valueAt(stats, def.family, 'ht', 'overall', team, def.key);
    const b =
      split === 'homeaway'
        ? valueAt(stats, def.family, 'ft', 'away', team, def.key)
        : valueAt(stats, def.family, '2h', 'overall', team, def.key);
    const overall = valueAt(stats, def.family, 'ft', 'overall', team, def.key);
    const measure = measureFor(a, b, def.pctBased);
    const difference = a != null && b != null ? a - b : null;
    const band = daBand(measure);
    const sample =
      split === 'homeaway'
        ? minSample(sampleAt(stats, 'ft', 'home', team), sampleAt(stats, 'ft', 'away', team))
        : minSample(sampleAt(stats, 'ht', 'overall', team), sampleAt(stats, '2h', 'overall', team));
    return {
      team,
      teamId,
      competition,
      aValue: a,
      bValue: b,
      overall,
      difference,
      measure,
      band,
      tier: tierOf(measure),
      sample,
      pctBased: def.pctBased,
      decimals: def.decimals,
    };
  });
}

/** Biggest difference first; teams without a measure sink to the bottom. */
export function sortByDifference(rows: SkeletonRow[]): SkeletonRow[] {
  return [...rows].sort((x, y) => (y.measure ?? -1) - (x.measure ?? -1) || x.team.localeCompare(y.team));
}

/** Highest overall value first. */
export function sortByValue(rows: SkeletonRow[]): SkeletonRow[] {
  return [...rows].sort((x, y) => (y.overall ?? -1) - (x.overall ?? -1) || x.team.localeCompare(y.team));
}

export function tallyTiers(rows: SkeletonRow[]): { top: number; middle: number; bottom: number } {
  const t = { top: 0, middle: 0, bottom: 0 };
  for (const r of rows) {
    if (r.tier === 'top') t.top += 1;
    else if (r.tier === 'middle') t.middle += 1;
    else if (r.tier === 'bottom') t.bottom += 1;
  }
  return t;
}

/* ---- Odds: the upcoming value feed, indexed for a team's next fixture ---- */

export type ValueOdds = { market: string; selection: string; price: number };

/** Best (highest) price across a value bet's book lines. The feed sends prices
 *  as strings ("2.19") as well as numbers, so each is coerced before comparing. */
export function bestLinePrice(lines: RawValueOddsLine[] | undefined): number | null {
  if (!lines || lines.length === 0) return null;
  let best = 0;
  for (const l of lines) {
    const line = l as Record<string, unknown>;
    for (const key of ['latest', 'latest_odds', 'odds', 'peak', 'opening']) {
      const n = Number(line[key]);
      if (Number.isFinite(n) && n > best) best = n;
    }
  }
  return best > 0 ? best : null;
}

export function normTeam(name: string): string {
  return name.trim().toLowerCase();
}

export type ValueOddsIndex = { byId: Map<number, ValueOdds>; byName: Map<string, ValueOdds> };

/** Index the value feed by fixture id and by home|away name pair. */
export function valueOddsIndex(bets: RawValueBet[]): ValueOddsIndex {
  const byId = new Map<number, ValueOdds>();
  const byName = new Map<string, ValueOdds>();
  for (const b of bets) {
    const price = bestLinePrice(b.odds);
    if (price == null) continue;
    const vo: ValueOdds = { market: String(b.market ?? ''), selection: String(b.selection ?? ''), price };
    if (typeof b.id === 'number' && !byId.has(b.id)) byId.set(b.id, vo);
    if (b.home_name && b.away_name) {
      const key = `${normTeam(b.home_name)}|${normTeam(b.away_name)}`;
      if (!byName.has(key)) byName.set(key, vo);
    }
  }
  return { byId, byName };
}

export function lookupOdds(index: ValueOddsIndex, fixtureId: number | null, homeName: string, awayName: string): ValueOdds | null {
  if (fixtureId != null && index.byId.has(fixtureId)) return index.byId.get(fixtureId) ?? null;
  return index.byName.get(`${normTeam(homeName)}|${normTeam(awayName)}`) ?? null;
}
