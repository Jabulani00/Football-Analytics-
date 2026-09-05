/**
 * Section 8 — Bhozoma / mid-table power tables.
 * For yellow-band teams: points taken vs sides currently above / below them.
 * MP < 3 against a side set = DATA DUST (not enough to call).
 */

import { criticalLinesFor, type StandingLike } from '@/utils/motivationEngine';

export const BHOZOMA_MIN_MP = 3;
/** Under this % of points taken from sides above → Goliath hero. */
export const GOLIATH_PCT = 30;

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

function emptySide(): BhozomaSideStats {
  return {
    mp: 0,
    pointsAttained: 0,
    pointsPossible: 0,
    pointsLost: 0,
    pctAttained: null,
    dataDust: true,
    results: [],
    label: null,
  };
}

function labelAbove(pct: number | null, dataDust: boolean): string | null {
  if (dataDust || pct == null) return 'Not enough games';
  if (pct < GOLIATH_PCT) return 'Giant-killer';
  return 'Solid vs higher sides';
}

function labelBelow(pct: number | null, dataDust: boolean): string | null {
  if (dataDust || pct == null) return 'Not enough games';
  if (pct >= 70) return 'Dominates lower sides';
  if (pct < 40) return 'Drops points to lower sides';
  return 'Average vs lower sides';
}

function sideStats(
  teamId: number,
  opponentIds: Set<number>,
  nameById: Map<number, string>,
  matches: SeasonMatch[],
  kind: 'above' | 'below',
): BhozomaSideStats {
  if (opponentIds.size === 0) return emptySide();

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
    label: kind === 'above' ? labelAbove(pctAttained, dataDust) : labelBelow(pctAttained, dataDust),
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
