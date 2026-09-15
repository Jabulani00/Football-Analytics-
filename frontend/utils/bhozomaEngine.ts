/**
 * Section 8 — Bhozoma / mid-table power tables.
 * For yellow-band teams: points taken vs sides currently above / below them.
 * MP < 3 against a side set = DATA DUST (not enough to call).
 */

import { criticalLinesFor, type StandingLike } from '@/utils/motivationEngine';

export const BHOZOMA_MIN_MP = 3;
/** Points % vs sides above — giant-killer only when they actually take points up the table. */
export const GIANT_KILLER_PCT = 50;
/** Competitive (not soft) vs higher sides. */
export const COMPETITIVE_ABOVE_PCT = 30;
/** Strong haul vs sides below — dominance. */
export const DOMINATES_BELOW_PCT = 75;
/** Good (but not dominant) vs sides below. */
export const GOOD_BELOW_PCT = 60;
/** Soft / leaky vs sides below. */
export const DROPS_BELOW_PCT = 45;

export type SeasonMatch = {
  homeId: number;
  awayId: number;
  homeGoals: number;
  awayGoals: number;
  unix: number;
};

export type BhozomaSideStats = {
  mp: number;
  pointsAttained: number;
  pointsPossible: number;
  pointsLost: number;
  pctAttained: number | null;
  /** true when MP < 3 — not enough data. */
  dataDust: boolean;
  results: { oppId: number; oppName: string; gf: number; ga: number; pts: number }[];
  label: string | null;
};

export type BhozomaTeamRow = {
  teamId: number;
  name: string;
  rank: number;
  points: number;
  zone: 'top' | 'mid' | 'bottom' | 'unknown';
  isMidTable: boolean;
  above: BhozomaSideStats;
  below: BhozomaSideStats;
};

export type BhozomaTable = {
  midBand: { from: number; to: number } | null;
  /** All teams computed; UI focuses on mid-table. */
  rows: BhozomaTeamRow[];
  midRows: BhozomaTeamRow[];
};

function ptsFor(gf: number, ga: number): number {
  if (gf > ga) return 3;
  if (gf === ga) return 1;
  return 0;
}

function emptySide(kind: 'above' | 'below'): BhozomaSideStats {
  return {
    mp: 0,
    pointsAttained: 0,
    pointsPossible: 0,
    pointsLost: 0,
    pctAttained: null,
    dataDust: true,
    results: [],
    label: kind === 'above' ? 'No sides above' : 'No sides below',
  };
}

/** Classify from points %; thin samples still get a real read (not a blank wall). */
function labelAbove(pct: number | null, mp: number): string {
  if (mp <= 0 || pct == null) return 'No meetings yet';
  let core: string;
  if (pct >= GIANT_KILLER_PCT) core = 'Giant-killer';
  else if (pct >= COMPETITIVE_ABOVE_PCT) core = 'Competitive vs higher sides';
  else core = 'Soft vs higher sides';
  return mp < BHOZOMA_MIN_MP ? `${core} · early` : core;
}

function labelBelow(pct: number | null, mp: number): string {
  if (mp <= 0 || pct == null) return 'No meetings yet';
  let core: string;
  if (pct >= DOMINATES_BELOW_PCT) core = 'Dominates lower sides';
  else if (pct >= GOOD_BELOW_PCT) core = 'Good against lower sides';
  else if (pct >= DROPS_BELOW_PCT) core = 'Solid vs lower sides';
  else core = 'Drops points to lower sides';
  return mp < BHOZOMA_MIN_MP ? `${core} · early` : core;
}

function sideStats(
  teamId: number,
  opponentIds: Set<number>,
  nameById: Map<number, string>,
  matches: SeasonMatch[],
  kind: 'above' | 'below',
): BhozomaSideStats {
  if (opponentIds.size === 0) return emptySide(kind);

  const results: BhozomaSideStats['results'] = [];
  let pointsAttained = 0;

  for (const m of matches) {
    const asHome = m.homeId === teamId;
    const asAway = m.awayId === teamId;
    if (!asHome && !asAway) continue;
    const oppId = asHome ? m.awayId : m.homeId;
    if (!opponentIds.has(oppId)) continue;
    const gf = asHome ? m.homeGoals : m.awayGoals;
    const ga = asHome ? m.awayGoals : m.homeGoals;
    const pts = ptsFor(gf, ga);
    pointsAttained += pts;
    results.push({
      oppId,
      oppName: nameById.get(oppId) ?? `#${oppId}`,
      gf,
      ga,
      pts,
    });
  }

  const mp = results.length;
  const dataDust = mp < BHOZOMA_MIN_MP;
  const pointsPossible = mp * 3;
  const pointsLost = pointsPossible - pointsAttained;
  const pctAttained = mp > 0 ? (pointsAttained / pointsPossible) * 100 : null;

  return {
    mp,
    pointsAttained,
    pointsPossible,
    pointsLost,
    pctAttained,
    dataDust,
    results,
    label: kind === 'above' ? labelAbove(pctAttained, mp) : labelBelow(pctAttained, mp),
  };
}

/**
 * Build Bhozoma rows for a league. Usage focus = mid-table (yellow band),
 * but every team is computed so callers can inspect the full picture.
 */
export function buildBhozomaTable(
  standings: StandingLike[],
  matches: SeasonMatch[],
  competitionId?: number | string | null,
): BhozomaTable {
  const lines = criticalLinesFor(competitionId ?? null, standings.length);
  const midBand = lines.midBand;
  const nameById = new Map(standings.map((r) => [r.teamId, r.name]));
  const sorted = [...standings].sort((a, b) => a.rank - b.rank);

  const rows: BhozomaTeamRow[] = sorted.map((team) => {
    const aboveIds = new Set(
      sorted.filter((r) => r.rank < team.rank).map((r) => r.teamId),
    );
    const belowIds = new Set(
      sorted.filter((r) => r.rank > team.rank).map((r) => r.teamId),
    );
    const isMidTable =
      midBand != null && team.rank >= midBand.from && team.rank <= midBand.to;
    const zone =
      team.zone ??
      (isMidTable ? 'mid' : midBand && team.rank < midBand.from ? 'top' : midBand && team.rank > midBand.to ? 'bottom' : 'unknown');

    return {
      teamId: team.teamId,
      name: team.name,
      rank: team.rank,
      points: team.points,
      zone,
      isMidTable,
      above: sideStats(team.teamId, aboveIds, nameById, matches, 'above'),
      below: sideStats(team.teamId, belowIds, nameById, matches, 'below'),
    };
  });

  return {
    midBand,
    rows,
    midRows: rows.filter((r) => r.isMidTable),
  };
}
