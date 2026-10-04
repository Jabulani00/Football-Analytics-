/**
 * Problem causer — four marks on the last 5 games, then a level.
 * 1 is a hit, 0 is a miss. Total = all 1s minus games used (at most 5).
 */

import type { TeamResult } from '@/utils/teamResults';

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
  /** Win-ratio mark plus the three per-game marks. */
  ones: number;
  /** ones − played. */
  total: number;
  level: ProblemLevel;
};

export type ProblemCauserRead = {
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

export function problemLevel(total: number): ProblemLevel {
  if (total <= 2) return { name: 'Entry', score: 3 };
  if (total <= 5) return { name: 'Moderate', score: 5 };
  if (total <= 7) return { name: 'Major', score: 7 };
  return { name: 'Extreme', score: 10 };
}

function margin(r: TeamResult): number {
  return r.gf - r.ga;
}

function mark(r: TeamResult, bit: ProblemBit): ProblemMark {
  return {
    bit,
    score: `${r.gf}–${r.ga}`,
    opponent: r.opponentName,
    btts: r.gf > 0 && r.ga > 0,
  };
}

function lastFive(results: TeamResult[]): TeamResult[] {
  return results.slice(0, LAST);
}

function sideRead(results: TeamResult[], winBit: ProblemBit): ProblemCauserSide {
  const games = lastFive(results);
  const goalDiff = games.map((r) => mark(r, Math.abs(margin(r)) <= 2 ? 1 : 0));
  const draws = games.map((r) => mark(r, r.outcome === 'D' ? 1 : 0));
  const oneGoalWins = games.map((r) => mark(r, r.outcome === 'W' && margin(r) === 1 ? 1 : 0));
  const perGame = [...goalDiff, ...draws, ...oneGoalWins].reduce((sum, m) => sum + m.bit, 0);
  const ones = winBit + perGame;
  const total = ones - games.length;
  return {
    played: games.length,
    wins: games.filter((r) => r.outcome === 'W').length,
    goalDiff,
    draws,
    oneGoalWins,
    ones,
    total,
    level: problemLevel(total),
  };
}

/**
 * Last 5 (or fewer) for each side.
 * Win ratio is one shared mark: 1 when the win counts differ by 0 or 1, otherwise 0.
 * That mark is counted in both sides' 1s.
 */
export function evaluateProblemCauser(t1Results: TeamResult[], t2Results: TeamResult[]): ProblemCauserRead {
  const t1Games = lastFive(t1Results);
  const t2Games = lastFive(t2Results);
  const t1Wins = t1Games.filter((r) => r.outcome === 'W').length;
  const t2Wins = t2Games.filter((r) => r.outcome === 'W').length;
  const difference = Math.abs(t1Wins - t2Wins);
  const bit: ProblemBit = difference <= 1 ? 1 : 0;
  return {
    winRatio: {
      t1Wins,
      t2Wins,
      t1Played: t1Games.length,
      t2Played: t2Games.length,
      difference,
      bit,
    },
    t1: sideRead(t1Results, bit),
    t2: sideRead(t2Results, bit),
  };
}
