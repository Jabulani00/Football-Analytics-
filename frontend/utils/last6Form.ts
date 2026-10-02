/**
 * Last-6 form for Power Dynamics: how T1 and T2 have actually performed
 * in their most recent six finished league games.
 */

import {
  lastN,
  pointsFromOutcomes,
  type ResultOutcome,
  type TeamResult,
} from '@/utils/teamResults';

export const LAST6_WINDOW = 6;
/** 12+ pts from 6 (2.0 PPG) is strong form. */
export const LAST6_STRONG_PTS = 12;
/** 6 or fewer pts from 6 (1.0 PPG) is poor form. */
export const LAST6_POOR_PTS = 6;
/** Last 3 vs previous 3 need this gap to call a swing. */
export const LAST6_TREND_GAP = 4;
/** Sides look different when last-6 points differ by this much. */
export const LAST6_SPLIT_PTS = 3;

export type Last6FormBand = 'strong' | 'mixed' | 'poor';
export type Last6Trend = 'picking_up' | 'dropping' | 'steady';

export type Last6Game = {
  opponentName: string;
  isHome: boolean;
  gf: number;
  ga: number;
  outcome: ResultOutcome;
  opponentAbove: boolean | null;
};

export type TeamLast6Form = {
  teamId: number | null;
  games: Last6Game[];
  sequence: ResultOutcome[];
  mp: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  possible: number;
  ppg: number | null;
  gf: number;
  ga: number;
  gd: number;
  homeMp: number;
  awayMp: number;
  homePoints: number;
  awayPoints: number;
  mpVsAbove: number;
  mpVsBelow: number;
  pointsVsAbove: number;
  pointsVsBelow: number;
  band: Last6FormBand;
  trend: Last6Trend;
  read: string;
};

export type FixtureLast6Form = {
  t1: TeamLast6Form | null;
  t2: TeamLast6Form | null;
  call: string;
  split: boolean;
};

export const LAST6_BAND_LABEL: Record<Last6FormBand, string> = {
  strong: 'Strong last 6',
  mixed: 'Mixed last 6',
  poor: 'Poor last 6',
};

export const LAST6_TREND_LABEL: Record<Last6Trend, string> = {
  picking_up: 'Picking up — last 3 better than the 3 before',
  dropping: 'Dropping off — last 3 worse than the 3 before',
  steady: 'Steady across the last 6',
};

export function last6Band(points: number, mp: number): Last6FormBand {
  if (mp <= 0) return 'mixed';
  if (mp < LAST6_WINDOW) {
    const ppg = points / mp;
    if (ppg >= LAST6_STRONG_PTS / LAST6_WINDOW) return 'strong';
    if (ppg <= LAST6_POOR_PTS / LAST6_WINDOW) return 'poor';
    return 'mixed';
  }
  if (points >= LAST6_STRONG_PTS) return 'strong';
  if (points <= LAST6_POOR_PTS) return 'poor';
  return 'mixed';
}

export function last6Trend(results: TeamResult[]): Last6Trend {
  if (results.length < LAST6_WINDOW) return 'steady';
  const recent = pointsFromOutcomes(results.slice(0, 3).map((r) => r.outcome));
  const prior = pointsFromOutcomes(results.slice(3, 6).map((r) => r.outcome));
  if (recent - prior >= LAST6_TREND_GAP) return 'picking_up';
  if (prior - recent >= LAST6_TREND_GAP) return 'dropping';
  return 'steady';
}

function ptsOf(r: TeamResult): number {
  if (r.outcome === 'W') return 3;
  if (r.outcome === 'D') return 1;
  return 0;
}

function readFor(band: Last6FormBand, points: number, mp: number): string {
  const haul = `${points}/${mp * 3} pts`;
  if (band === 'strong') return `Taking points — ${haul} from last ${mp}`;
  if (band === 'poor') return `Leaking points — ${haul} from last ${mp}`;
  return `In and out — ${haul} from last ${mp}`;
}

export function analyseTeamLast6(
  teamId: number | null | undefined,
  results: TeamResult[],
): TeamLast6Form | null {
  const window = lastN(results, LAST6_WINDOW);
  if (window.length === 0) return null;

  let won = 0;
  let drawn = 0;
  let lost = 0;
  let gf = 0;
  let ga = 0;
  let homeMp = 0;
  let awayMp = 0;
  let homePoints = 0;
  let awayPoints = 0;
  let mpVsAbove = 0;
  let mpVsBelow = 0;
  let pointsVsAbove = 0;
  let pointsVsBelow = 0;

  const games: Last6Game[] = window.map((r) => {
    const pts = ptsOf(r);
    if (r.outcome === 'W') won += 1;
    else if (r.outcome === 'D') drawn += 1;
    else lost += 1;
    gf += r.gf;
    ga += r.ga;
    if (r.isHome) {
      homeMp += 1;
      homePoints += pts;
    } else {
      awayMp += 1;
      awayPoints += pts;
    }
    if (r.opponentAbove === true) {
      mpVsAbove += 1;
      pointsVsAbove += pts;
    } else if (r.opponentAbove === false) {
      mpVsBelow += 1;
      pointsVsBelow += pts;
    }
    return {
      opponentName: r.opponentName,
      isHome: r.isHome,
      gf: r.gf,
      ga: r.ga,
      outcome: r.outcome,
      opponentAbove: r.opponentAbove,
    };
  });

  const mp = window.length;
  const points = won * 3 + drawn;
  const band = last6Band(points, mp);
  const trend = last6Trend(window);

  return {
    teamId: teamId ?? null,
    games,
    sequence: window.map((r) => r.outcome),
    mp,
    won,
    drawn,
    lost,
    points,
    possible: mp * 3,
    ppg: mp > 0 ? points / mp : null,
    gf,
    ga,
    gd: gf - ga,
    homeMp,
    awayMp,
    homePoints,
    awayPoints,
    mpVsAbove,
    mpVsBelow,
    pointsVsAbove,
    pointsVsBelow,
    band,
    trend,
    read: readFor(band, points, mp),
  };
}

export function compareLast6Form(
  t1: TeamLast6Form | null,
  t2: TeamLast6Form | null,
  t1Label: string,
  t2Label: string,
): FixtureLast6Form {
  if (!t1 && !t2) {
    return { t1, t2, call: 'Need finished games to read last-6 form.', split: false };
  }
  if (!t1 || !t2) {
    const side = t1 ? t1Label : t2Label;
    return {
      t1,
      t2,
      call: `Only ${side} has a last-6 sample so far.`,
      split: false,
    };
  }
  const gap = t1.points - t2.points;
  const split = Math.abs(gap) >= LAST6_SPLIT_PTS;
  let call: string;
  if (gap >= LAST6_SPLIT_PTS) {
    call = `${t1Label} is in better last-6 form (${t1.points}–${t2.points} pts).`;
  } else if (gap <= -LAST6_SPLIT_PTS) {
    call = `${t2Label} is in better last-6 form (${t2.points}–${t1.points} pts).`;
  } else {
    call = `Similar last-6 form — ${t1Label} ${t1.points} pts, ${t2Label} ${t2.points} pts.`;
  }
  return { t1, t2, call, split };
}

export function last6FormForSides(opts: {
  t1TeamId: number | null | undefined;
  t2TeamId: number | null | undefined;
  t1Results: TeamResult[];
  t2Results: TeamResult[];
  t1Label: string;
  t2Label: string;
}): FixtureLast6Form {
  const t1 = analyseTeamLast6(opts.t1TeamId, opts.t1Results);
  const t2 = analyseTeamLast6(opts.t2TeamId, opts.t2Results);
  return compareLast6Form(t1, t2, opts.t1Label, opts.t2Label);
}
