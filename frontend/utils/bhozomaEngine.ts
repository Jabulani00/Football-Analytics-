/**
 * Section 8 — Bhozoma / mid-table power tables.
 * For yellow-band teams: points taken vs sides currently above / below them.
 * MP < 3 against a side set = DATA DUST (not enough to call).
 */

import { criticalLinesFor, type StandingLike } from '@/utils/motivationEngine';

export const BHOZOMA_MIN_MP = 3;
/** vs Above: % ≥ this → Bhozoma; below it → Goliath hero. */
export const BHOZOMA_ABOVE_PCT = 30;
/** vs Below: % > this → Umnqumi wehlathi; otherwise Hlathi submissive. */
export const UMNQUMI_BELOW_PCT = 50;

export type SeasonMatch = {
  homeId: number;
  awayId: number;
  homeGoals: number;
  awayGoals: number;
  unix: number;
  /** Half-time goals when the provider carried an `ht_score`. */
  homeGoalsHt?: number | null;
  awayGoalsHt?: number | null;
};

export type BhozomaPeriod = 'ft' | '1h' | '2h';

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

export type BhozomaVenue = 'overall' | 'home' | 'away';

export type BhozomaRankSpan = { from: number; to: number };

export type BhozomaTeamRow = {
  teamId: number;
  name: string;
  rank: number;
  points: number;
  zone: 'top' | 'mid' | 'bottom' | 'unknown';
  isMidTable: boolean;
  /** Nearest place above → 1st, e.g. 8→1 for 9th. */
  aboveRanks: BhozomaRankSpan | null;
  /** Next place below → last, e.g. 10→20 for 9th. */
  belowRanks: BhozomaRankSpan | null;
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

/** Goals for a period. Half tables skip matches with no usable `ht_score`. */
export function seasonMatchPeriodGoals(
  m: SeasonMatch,
  period: BhozomaPeriod = 'ft',
): { home: number; away: number } | null {
  if (period === 'ft') return { home: m.homeGoals, away: m.awayGoals };
  if (m.homeGoalsHt == null || m.awayGoalsHt == null) return null;
  if (period === '1h') return { home: m.homeGoalsHt, away: m.awayGoalsHt };
  const home = m.homeGoals - m.homeGoalsHt;
  const away = m.awayGoals - m.awayGoalsHt;
  if (home < 0 || away < 0) return null;
  return { home, away };
}

export function formatBhozomaSpan(span: BhozomaRankSpan | null): string {
  if (!span) return '—';
  return `${span.from}–${span.to}`;
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

/** vs Above: < 30% Goliath hero, ≥ 30% Bhozoma. */
function labelAbove(pct: number | null, mp: number): string {
  if (mp <= 0 || pct == null) return 'No meetings yet';
  const core = pct < BHOZOMA_ABOVE_PCT ? 'Goliath hero' : 'Bhozoma';
  return mp < BHOZOMA_MIN_MP ? `${core} · early` : core;
}

/** vs Below: > 50% Umnqumi wehlathi, ≤ 50% Hlathi submissive. */
function labelBelow(pct: number | null, mp: number): string {
  if (mp <= 0 || pct == null) return 'No meetings yet';
  const core = pct > UMNQUMI_BELOW_PCT ? 'Umnqumi wehlathi' : 'Hlathi submissive';
  return mp < BHOZOMA_MIN_MP ? `${core} · early` : core;
}

function sideStats(
  teamId: number,
  opponentIds: Set<number>,
  nameById: Map<number, string>,
  matches: SeasonMatch[],
  kind: 'above' | 'below',
  venue: BhozomaVenue = 'overall',
  period: BhozomaPeriod = 'ft',
): BhozomaSideStats {
  if (opponentIds.size === 0) return emptySide(kind);

  const results: BhozomaSideStats['results'] = [];
  let pointsAttained = 0;

  for (const m of matches) {
    const asHome = m.homeId === teamId;
    const asAway = m.awayId === teamId;
    if (!asHome && !asAway) continue;
    if (venue === 'home' && !asHome) continue;
    if (venue === 'away' && !asAway) continue;
    const goals = seasonMatchPeriodGoals(m, period);
    if (!goals) continue;
    const oppId = asHome ? m.awayId : m.homeId;
    if (!opponentIds.has(oppId)) continue;
    const gf = asHome ? goals.home : goals.away;
    const ga = asHome ? goals.away : goals.home;
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
 * Build Bhozoma rows for a league. Usage focus = mid-table (yellow band).
 * For a yellow side in 9th facing a different tier (e.g. 2nd), vs Above is
 * places 8→1 and vs Below is 10→last — split on that yellow side’s rank.
 */
export function buildBhozomaTable(
  standings: StandingLike[],
  matches: SeasonMatch[],
  competitionId?: number | string | null,
  venue: BhozomaVenue = 'overall',
  period: BhozomaPeriod = 'ft',
): BhozomaTable {
  const lines = criticalLinesFor(competitionId ?? null, standings.length);
  const midBand = lines.midBand;
  const nameById = new Map(standings.map((r) => [r.teamId, r.name]));
  const sorted = [...standings].sort((a, b) => a.rank - b.rank);
  const lastPlace = sorted.length > 0 ? sorted[sorted.length - 1].rank : 0;

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
      aboveRanks: team.rank > 1 ? { from: team.rank - 1, to: 1 } : null,
      belowRanks: team.rank < lastPlace ? { from: team.rank + 1, to: lastPlace } : null,
      above: sideStats(team.teamId, aboveIds, nameById, matches, 'above', venue, period),
      below: sideStats(team.teamId, belowIds, nameById, matches, 'below', venue, period),
    };
  });

  return {
    midBand,
    rows,
    midRows: rows.filter((r) => r.isMidTable),
  };
}

/** Fixture Bhozoma: only yellow-band sides in this match, split on each side’s own place. */
export function bhozomaFixtureRows(table: BhozomaTable, teamIds: number[]): BhozomaTeamRow[] {
  const seen = new Set<number>();
  const out: BhozomaTeamRow[] = [];
  for (const id of teamIds) {
    if (!Number.isFinite(id) || seen.has(id)) continue;
    seen.add(id);
    const row = table.rows.find((r) => r.teamId === id);
    if (row?.isMidTable) out.push(row);
  }
  return out;
}
