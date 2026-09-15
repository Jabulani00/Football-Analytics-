/**
 * Section 9 — Imbangi (neighbour / rival rows) + league progress context.
 */

import {
  estimateRemainingMatches,
  LATE_SEASON_PROGRESS,
  type StandingLike,
} from '@/utils/motivationEngine';
import type { SeasonMatch } from '@/utils/bhozomaEngine';

/** ΔP at or below this = tight Imbangi fight. */
export const IMBANGI_TIGHT_PTS = 3;

export type ImbangiRow = {
  teamId: number;
  teamName: string;
  position: number;
  teamPoints: number;
  teamPlayed: number;
  /** Matches still estimated for this team. */
  remaining: number;
  opponentId: number;
  opponentName: string;
  opponentPosition: number;
  opponentPoints: number;
  /** Absolute points gap — closer to 0 is more interesting. */
  pointsDiff: number;
  relation: 'above' | 'below';
  /** Most recent meeting between the pair, if any. */
  lastScore: string | null;
  /** W/D/L from the team's lens in that meeting. */
  lastResult: 'W' | 'D' | 'L' | null;
  lastPtsForTeam: number | null;
  lastUnix: number | null;
  lastDate: string | null;
  /** True when pointsDiff ≤ IMBANGI_TIGHT_PTS. */
  tight: boolean;
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

export type ImbangiTable = {
  rows: ImbangiRow[];
  /** Closest rivalries first (smallest pointsDiff). */
  closest: ImbangiRow[];
  progress: LeagueProgressInfo;
};

function formatDate(unix: number): string {
  try {
    return new Date(unix * 1000).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function lastMeeting(
  teamId: number,
  oppId: number,
  matches: SeasonMatch[],
): {
  score: string;
  result: 'W' | 'D' | 'L';
  pts: number;
  unix: number;
  date: string;
} | null {
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
  const result: 'W' | 'D' | 'L' = pts === 3 ? 'W' : pts === 1 ? 'D' : 'L';
  return {
    score: `${gf}-${ga}${asHome ? ' (H)' : ' (A)'}`,
    result,
    pts,
    unix: best.unix,
    date: formatDate(best.unix),
  };
}

/**
 * One Imbangi row per team vs the neighbour immediately above and below
 * (when they exist). Sorted later by pointsDiff ascending.
 */
export function buildImbangiRows(
  standings: StandingLike[],
  matches: SeasonMatch[],
  seasonProgress?: number | null,
): ImbangiRow[] {
  const sorted = [...standings].sort((a, b) => a.rank - b.rank);
  const byRank = new Map(sorted.map((r) => [r.rank, r]));
  const rows: ImbangiRow[] = [];

  for (const team of sorted) {
    const remaining = estimateRemainingMatches(team, standings, seasonProgress);
    for (const rel of ['above', 'below'] as const) {
      const oppRank = rel === 'above' ? team.rank - 1 : team.rank + 1;
      const opp = byRank.get(oppRank);
      if (!opp) continue;
      const meet = lastMeeting(team.teamId, opp.teamId, matches);
      const pointsDiff = Math.abs(team.points - opp.points);
      rows.push({
        teamId: team.teamId,
        teamName: team.name,
        position: team.rank,
        teamPoints: team.points,
        teamPlayed: team.played,
        remaining,
        opponentId: opp.teamId,
        opponentName: opp.name,
        opponentPosition: opp.rank,
        opponentPoints: opp.points,
        pointsDiff,
        relation: rel,
        lastScore: meet?.score ?? null,
        lastResult: meet?.result ?? null,
        lastPtsForTeam: meet?.pts ?? null,
        lastUnix: meet?.unix ?? null,
        lastDate: meet?.date ?? null,
        tight: pointsDiff <= IMBANGI_TIGHT_PTS,
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
        ? `Last ~${Math.ceil(avgRemaining)} games stretch — tighten chase/escape and Imbangi gaps.`
        : `Season ≥ ${LATE_SEASON_PROGRESS}% complete — pull + push factors active; watch close Imbangi pairs.`;
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

export function buildImbangiTable(
  standings: StandingLike[],
  matches: SeasonMatch[],
  seasonProgress?: number | null,
): ImbangiTable {
  const rows = buildImbangiRows(standings, matches, seasonProgress);
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
