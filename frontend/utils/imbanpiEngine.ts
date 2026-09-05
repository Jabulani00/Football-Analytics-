/**
 * Section 9 — Imbanpi (neighbour / rival rows) + league progress context.
 */

import {
  estimateRemainingMatches,
  LATE_SEASON_PROGRESS,
  type StandingLike,
} from '@/utils/motivationEngine';
import type { SeasonMatch } from '@/utils/bhozomaEngine';

export type ImbanpiRow = {
  teamId: number;
  teamName: string;
  position: number;
  opponentId: number;
  opponentName: string;
  opponentPosition: number;
  /** Absolute points gap — closer to 0 is more interesting. */
  pointsDiff: number;
  relation: 'above' | 'below';
  /** Most recent meeting between the pair, if any. */
  lastScore: string | null;
  lastPtsForTeam: number | null;
  lastUnix: number | null;
};

export type LeagueProgressInfo = {
  seasonProgress: number | null;
  /** Average remaining matches across the table. */
  avgRemaining: number | null;
  maxPlayed: number;
  /** Late stretch: progress ≥ 75% or ≤ 10 games left on average. */
  lateStretch: boolean;
  note: string;
};

export type ImbanpiTable = {
  rows: ImbanpiRow[];
  /** Closest rivalries first (smallest pointsDiff). */
  closest: ImbanpiRow[];
  progress: LeagueProgressInfo;
};

function lastMeeting(
  teamId: number,
  oppId: number,
  matches: SeasonMatch[],
): { score: string; pts: number; unix: number } | null {
  let best: SeasonMatch | null = null;
  for (const m of matches) {
    const pair =
      (m.homeId === teamId && m.awayId === oppId) ||
      (m.homeId === oppId && m.awayId === teamId);
    if (!pair) continue;
    if (!best || m.unix > best.unix) best = m;
  }
  if (!best) return null;
  const asHome = best.homeId === teamId;
  const gf = asHome ? best.homeGoals : best.awayGoals;
  const ga = asHome ? best.awayGoals : best.homeGoals;
  const pts = gf > ga ? 3 : gf === ga ? 1 : 0;
  return {
    score: `${gf}-${ga}${asHome ? ' (H)' : ' (A)'}`,
    pts,
    unix: best.unix,
  };
}

/**
 * One Imbanpi row per team vs the neighbour immediately above and below
 * (when they exist). Sorted later by pointsDiff ascending.
 */
export function buildImbanpiRows(
  standings: StandingLike[],
  matches: SeasonMatch[],
): ImbanpiRow[] {
  const sorted = [...standings].sort((a, b) => a.rank - b.rank);
  const byRank = new Map(sorted.map((r) => [r.rank, r]));
  const rows: ImbanpiRow[] = [];

  for (const team of sorted) {
    for (const rel of ['above', 'below'] as const) {
      const oppRank = rel === 'above' ? team.rank - 1 : team.rank + 1;
      const opp = byRank.get(oppRank);
      if (!opp) continue;
      const meet = lastMeeting(team.teamId, opp.teamId, matches);
      rows.push({
        teamId: team.teamId,
        teamName: team.name,
        position: team.rank,
        opponentId: opp.teamId,
        opponentName: opp.name,
        opponentPosition: opp.rank,
        pointsDiff: Math.abs(team.points - opp.points),
        relation: rel,
        lastScore: meet?.score ?? null,
        lastPtsForTeam: meet?.pts ?? null,
        lastUnix: meet?.unix ?? null,
      });
    }
  }

  return rows;
}

export function leagueProgressInfo(
  standings: StandingLike[],
  seasonProgress: number | null | undefined,
): LeagueProgressInfo {
  const maxPlayed = Math.max(0, ...standings.map((r) => r.played));
  let remSum = 0;
  let remN = 0;
  for (const t of standings) {
    const rem = estimateRemainingMatches(t, standings, seasonProgress);
    remSum += rem;
    remN += 1;
  }
  const avgRemaining = remN > 0 ? Math.round((remSum / remN) * 10) / 10 : null;
  const lateStretch =
    (seasonProgress != null && seasonProgress >= LATE_SEASON_PROGRESS) ||
    (avgRemaining != null && avgRemaining <= 10);

  let note = 'Early / mid season — standard table reads.';
  if (lateStretch) {
    note =
      avgRemaining != null && avgRemaining <= 10
        ? `Last ~${Math.ceil(avgRemaining)} games stretch — tighten chase/escape and Imbanpi gaps.`
        : `Season ≥ ${LATE_SEASON_PROGRESS}% complete — pull + push factors active; watch close Imbanpi pairs.`;
  } else if (seasonProgress != null) {
    note = `League progress ${seasonProgress}% · avg ~${avgRemaining ?? '?'} matches left.`;
  }

  return {
    seasonProgress: seasonProgress ?? null,
    avgRemaining,
    maxPlayed,
    lateStretch,
    note,
  };
}

export function buildImbanpiTable(
  standings: StandingLike[],
  matches: SeasonMatch[],
  seasonProgress?: number | null,
): ImbanpiTable {
  const rows = buildImbanpiRows(standings, matches);
  const closest = [...rows].sort((a, b) => {
    if (a.pointsDiff !== b.pointsDiff) return a.pointsDiff - b.pointsDiff;
    return a.position - b.position;
  });
  return {
    rows,
    closest,
    progress: leagueProgressInfo(standings, seasonProgress),
  };
}
