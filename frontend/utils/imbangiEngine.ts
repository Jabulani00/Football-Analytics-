/**
 * Section 9 — Imbangi (neighbour / rival rows) + league progress context.
 */

import {
  estimateRemainingMatches,
  LATE_SEASON_PROGRESS,
  type StandingLike,
} from '@/utils/motivationEngine';
import type { SeasonMatch } from '@/utils/bhozomaEngine';

/** ΔP at or below this = tight Imbangi fight + grade band. */
export const IMBANGI_TIGHT_PTS = 4;
/** Same threshold as tight — C / B / A only fire at this gap or closer. */
export const IMBANGI_GRADE_PTS = 4;

export type ImbangiGrade = 'A' | 'B' | 'C';

export const IMBANGI_GRADE_SCORE: Record<ImbangiGrade, number> = {
  A: 10,
  B: 8,
  C: 6,
};

export function imbangiGradeScore(grade: ImbangiGrade | null | undefined): number | null {
  if (grade == null) return null;
  return IMBANGI_GRADE_SCORE[grade];
}

/** League fixtures used to spot same-day neighbour cards. */
export type ImbangiScheduleMatch = {
  homeId: number;
  awayId: number;
  unix: number;
  finished: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
};

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
  /** Each side’s last finished league game (any opponent). */
  teamLastResult: 'W' | 'D' | 'L' | null;
  oppLastResult: 'W' | 'D' | 'L' | null;
  /** True when pointsDiff ≤ IMBANGI_TIGHT_PTS. */
  tight: boolean;
  grade: ImbangiGrade | null;
  gradeReason: string | null;
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

function resultFromScore(teamId: number, homeId: number, awayId: number, homeGoals: number, awayGoals: number): 'W' | 'D' | 'L' | null {
  const asHome = homeId === teamId;
  if (!asHome && awayId !== teamId) return null;
  const gf = asHome ? homeGoals : awayGoals;
  const ga = asHome ? awayGoals : homeGoals;
  if (gf > ga) return 'W';
  if (gf < ga) return 'L';
  return 'D';
}

export function lastTeamResult(
  teamId: number,
  matches: SeasonMatch[],
): 'W' | 'D' | 'L' | null {
  let best: SeasonMatch | null = null;
  for (const m of matches) {
    if (m.homeId !== teamId && m.awayId !== teamId) continue;
    if (!best || m.unix > best.unix) best = m;
  }
  if (!best) return null;
  return resultFromScore(teamId, best.homeId, best.awayId, best.homeGoals, best.awayGoals);
}

function involves(teamId: number, m: ImbangiScheduleMatch): boolean {
  return m.homeId === teamId || m.awayId === teamId;
}

function calendarDay(unix: number): string {
  return formatDate(unix);
}

function todayKey(nowUnix?: number): string {
  const unix = nowUnix ?? Math.floor(Date.now() / 1000);
  return calendarDay(unix);
}

/**
 * Same-day neighbour cards. Prefers today; otherwise the latest day both played.
 * Grade A: earlier kickoff finished as a win, later card is still not finished.
 */
export function sameDayMotivation(
  teamId: number,
  oppId: number,
  schedule: ImbangiScheduleMatch[],
  nowUnix?: number,
): { sameDay: boolean; motivated: boolean; firstWonId: number | null; motivatedId: number | null } {
  const empty = { sameDay: false, motivated: false, firstWonId: null, motivatedId: null };
  const byDay = new Map<string, { team: ImbangiScheduleMatch | null; opp: ImbangiScheduleMatch | null }>();

  for (const m of schedule) {
    const teamIn = involves(teamId, m);
    const oppIn = involves(oppId, m);
    if (!teamIn && !oppIn) continue;
    if (teamIn && oppIn) continue;
    const day = calendarDay(m.unix);
    const slot = byDay.get(day) ?? { team: null, opp: null };
    if (teamIn && (!slot.team || m.unix > slot.team.unix)) slot.team = m;
    if (oppIn && (!slot.opp || m.unix > slot.opp.unix)) slot.opp = m;
    byDay.set(day, slot);
  }

  const bothDays = [...byDay.entries()].filter(([, s]) => s.team && s.opp);
  if (bothDays.length === 0) return empty;

  const today = todayKey(nowUnix);
  const picked = bothDays.find(([day]) => day === today) ?? bothDays.sort((a, b) => b[0].localeCompare(a[0]))[0];
  const teamCard = picked[1].team;
  const oppCard = picked[1].opp;
  if (!teamCard || !oppCard) return empty;
  if (teamCard.unix === oppCard.unix) return { sameDay: true, motivated: false, firstWonId: null, motivatedId: null };

  const first = teamCard.unix < oppCard.unix ? teamCard : oppCard;
  const second = teamCard.unix < oppCard.unix ? oppCard : teamCard;
  const firstId = involves(teamId, first) ? teamId : oppId;
  const secondId = involves(teamId, second) ? teamId : oppId;
  if (!first.finished || first.homeGoals == null || first.awayGoals == null || second.finished) {
    return { sameDay: true, motivated: false, firstWonId: null, motivatedId: null };
  }
  const firstResult = resultFromScore(firstId, first.homeId, first.awayId, first.homeGoals, first.awayGoals);
  if (firstResult !== 'W') {
    return { sameDay: true, motivated: false, firstWonId: null, motivatedId: null };
  }
  return { sameDay: true, motivated: true, firstWonId: firstId, motivatedId: secondId };
}

function lostLastLine(
  teamLost: boolean,
  oppLost: boolean,
  teamName: string,
  oppName: string,
): string {
  if (teamLost && oppLost) return `${teamName} and ${oppName} both lost their last game`;
  if (teamLost) return `${teamName} lost their last game`;
  if (oppLost) return `${oppName} lost their last game`;
  return 'one side lost their last game';
}

export function gradeImbangiRow(opts: {
  pointsDiff: number;
  teamId: number;
  teamName?: string;
  oppName?: string;
  teamLastResult: 'W' | 'D' | 'L' | null;
  oppLastResult: 'W' | 'D' | 'L' | null;
  sameDay: {
    sameDay: boolean;
    motivated: boolean;
    firstWonId?: number | null;
    motivatedId: number | null;
  };
}): { grade: ImbangiGrade | null; reason: string | null } {
  const teamName = opts.teamName?.trim() || 'This side';
  const oppName = opts.oppName?.trim() || 'the neighbour';
  if (opts.pointsDiff > IMBANGI_GRADE_PTS) return { grade: null, reason: null };

  if (opts.sameDay.motivated && opts.sameDay.motivatedId === opts.teamId) {
    const winner =
      opts.sameDay.firstWonId === opts.teamId
        ? teamName
        : opts.sameDay.firstWonId != null
          ? oppName
          : 'the neighbour';
    return {
      grade: 'A',
      reason: `ΔP ≤ 4 · ${winner} already won today · ${teamName} still to play`,
    };
  }
  if (opts.teamLastResult === 'L' || opts.oppLastResult === 'L') {
    return {
      grade: 'B',
      reason: `ΔP ≤ 4 · ${lostLastLine(
        opts.teamLastResult === 'L',
        opts.oppLastResult === 'L',
        teamName,
        oppName,
      )}`,
    };
  }
  return { grade: 'C', reason: 'ΔP ≤ 4' };
}

/**
 * One Imbangi row per team vs the neighbour immediately above and below
 * (when they exist). Sorted later by pointsDiff ascending.
 */
export function buildImbangiRows(
  standings: StandingLike[],
  matches: SeasonMatch[],
  seasonProgress?: number | null,
  schedule: ImbangiScheduleMatch[] = [],
  nowUnix?: number,
): ImbangiRow[] {
  const sorted = [...standings].sort((a, b) => a.rank - b.rank);
  const byRank = new Map(sorted.map((r) => [r.rank, r]));
  const lastById = new Map(sorted.map((r) => [r.teamId, lastTeamResult(r.teamId, matches)]));
  const rows: ImbangiRow[] = [];

  for (const team of sorted) {
    const remaining = estimateRemainingMatches(team, standings, seasonProgress);
    for (const rel of ['above', 'below'] as const) {
      const oppRank = rel === 'above' ? team.rank - 1 : team.rank + 1;
      const opp = byRank.get(oppRank);
      if (!opp) continue;
      const meet = lastMeeting(team.teamId, opp.teamId, matches);
      const pointsDiff = Math.abs(team.points - opp.points);
      const teamLastResult = lastById.get(team.teamId) ?? null;
      const oppLastResult = lastById.get(opp.teamId) ?? null;
      const sameDay = sameDayMotivation(team.teamId, opp.teamId, schedule, nowUnix);
      const graded = gradeImbangiRow({
        pointsDiff,
        teamId: team.teamId,
        teamName: team.name,
        oppName: opp.name,
        teamLastResult,
        oppLastResult,
        sameDay,
      });
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
        teamLastResult,
        oppLastResult,
        tight: pointsDiff <= IMBANGI_TIGHT_PTS,
        grade: graded.grade,
        gradeReason: graded.reason,
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
  schedule: ImbangiScheduleMatch[] = [],
  nowUnix?: number,
): ImbangiTable {
  const rows = buildImbangiRows(standings, matches, seasonProgress, schedule, nowUnix);
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
