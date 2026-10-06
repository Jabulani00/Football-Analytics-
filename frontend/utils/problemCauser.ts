/**
 * Problem causer — four marks on the last 5 head-to-head meetings, then a level.
 * 1 is a hit, 0 is a miss. Total = all 1s minus meetings used (at most 5).
 */

import type { H2HMatch } from '@/services/oddAlerts';
import { h2hOutcomeForTeam, recentH2hMeetings, teamInH2hMatch, teamsMatch } from '@/utils/h2hDisplay';

export type ProblemBit = 0 | 1;

export type ProblemMark = {
  bit: ProblemBit;
  score: string;
  opponent: string;
  btts: boolean;
};

export type ProblemLevelName = 'Entry' | 'Moderate' | 'Major' | 'Extreme';

export type ProblemLevel = {
  name: ProblemLevelName;
  /** Entry 3, Moderate 5, Major 7, Extreme 10. */
  score: 3 | 5 | 7 | 10;
};

export type ProblemCauserSide = {
  played: number;
  wins: number;
  goalDiff: ProblemMark[];
  draws: ProblemMark[];
  oneGoalWins: ProblemMark[];
  /** Win-ratio mark plus the three per-meeting marks. */
  ones: number;
  /** ones − played. */
  total: number;
  level: ProblemLevel;
};

export type ProblemCauserRead = {
  meetings: number;
  winRatio: {
    t1Wins: number;
    t2Wins: number;
    t1Played: number;
    t2Played: number;
    difference: number;
    bit: ProblemBit;
  };
  t1: ProblemCauserSide;
  t2: ProblemCauserSide;
};

const LAST = 5;

type SideGame = {
  gf: number;
  ga: number;
  outcome: 'W' | 'D' | 'L';
  opponent: string;
};

export function problemLevel(total: number): ProblemLevel {
  if (total <= 2) return { name: 'Entry', score: 3 };
  if (total <= 5) return { name: 'Moderate', score: 5 };
  if (total <= 7) return { name: 'Major', score: 7 };
  return { name: 'Extreme', score: 10 };
}

function scoredMeetings(matches: H2HMatch[], t1Name: string, t2Name: string, excludeFixtureId?: number | null): H2HMatch[] {
  const played = matches.filter((m) => {
    if (excludeFixtureId != null && m.id === excludeFixtureId) return false;
    if (m.home_goals == null || m.away_goals == null) return false;
    return teamInH2hMatch(m, t1Name) && teamInH2hMatch(m, t2Name);
  });
  return recentH2hMeetings(played, LAST);
}

function viewFor(m: H2HMatch, teamName: string): SideGame {
  const wasHome = teamsMatch(m.home_name, teamName);
  const hg = m.home_goals ?? 0;
  const ag = m.away_goals ?? 0;
  return {
    gf: wasHome ? hg : ag,
    ga: wasHome ? ag : hg,
    outcome: h2hOutcomeForTeam(m, teamName),
    opponent: wasHome ? m.away_name : m.home_name,
  };
}

function mark(g: SideGame, bit: ProblemBit): ProblemMark {
  return {
    bit,
    score: `${g.gf}–${g.ga}`,
    opponent: g.opponent,
    btts: g.gf > 0 && g.ga > 0,
  };
}

function sideRead(games: SideGame[], winBit: ProblemBit): ProblemCauserSide {
  const goalDiff = games.map((g) => mark(g, Math.abs(g.gf - g.ga) <= 2 ? 1 : 0));
  const draws = games.map((g) => mark(g, g.outcome === 'D' ? 1 : 0));
  const oneGoalWins = games.map((g) => mark(g, g.outcome === 'W' && g.gf - g.ga === 1 ? 1 : 0));
  const perGame = [...goalDiff, ...draws, ...oneGoalWins].reduce((sum, m) => sum + m.bit, 0);
  const ones = winBit + perGame;
  const total = ones - games.length;
  return {
    played: games.length,
    wins: games.filter((g) => g.outcome === 'W').length,
    goalDiff,
    draws,
    oneGoalWins,
    ones,
    total,
    level: problemLevel(total),
  };
}

/**
 * Last 5 finished meetings between these two sides (fewer when they have not met five times).
 * Win ratio is one shared mark: 1 when their H2H win counts differ by 0 or 1, otherwise 0.
 */
export function evaluateProblemCauser(opts: {
  matches: H2HMatch[];
  t1Name: string;
  t2Name: string;
  excludeFixtureId?: number | null;
}): ProblemCauserRead {
  const meetings = scoredMeetings(opts.matches, opts.t1Name, opts.t2Name, opts.excludeFixtureId);
  const t1Games = meetings.map((m) => viewFor(m, opts.t1Name));
  const t2Games = meetings.map((m) => viewFor(m, opts.t2Name));
  const t1Wins = t1Games.filter((g) => g.outcome === 'W').length;
  const t2Wins = t2Games.filter((g) => g.outcome === 'W').length;
  const difference = Math.abs(t1Wins - t2Wins);
  const bit: ProblemBit = difference <= 1 ? 1 : 0;
  return {
    meetings: meetings.length,
    winRatio: {
      t1Wins,
      t2Wins,
      t1Played: t1Games.length,
      t2Played: t2Games.length,
      difference,
      bit,
    },
    t1: sideRead(t1Games, bit),
    t2: sideRead(t2Games, bit),
  };
}
