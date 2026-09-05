/**
 * Section 5 — Last 5 analysis engine.
 * Grade recent results, classify each side, name the 21 Ukulumbana matchups,
 * and compare Home/Away/Overall lenses for same-strength vs split.
 */

import {
  filterScope,
  lastN,
  pointsFromOutcomes,
  type ResultOutcome,
  type TeamResult,
} from '@/utils/teamResults';

export type FormGrade = 'excellent' | 'good' | 'mediocre' | 'bad';

export type FormBand = 'good' | 'medium' | 'bad';

/** One of the 6 true options per team. */
export type TrueOption =
  | 'good'
  | 'medium'
  | 'bad'
  | 'good_inhla'
  | 'medium_inhla'
  | 'bad_inhla';

export type FormChange = 'positive' | 'zero' | 'negative';

export type LensId = 'A' | 'B' | 'C' | 'D';

export type GradedGame = {
  result: TeamResult;
  grade: FormGrade;
  points: number; // 3/2/1/0
};

export type TeamLast5 = {
  teamId: number;
  games: GradedGame[];
  /** Sum of grade points (Excellent=3 … Bad=0) over available games. */
  gradePoints: number;
  /** Classic W/D/L points over last 5. */
  tablePoints: number;
  band: FormBand;
  inhlambuluko: boolean;
  option: TrueOption;
  /** Band before the newest game (initial) vs after (final). */
  initialBand: FormBand;
  finalBand: FormBand;
  change: FormChange;
  sequence: ResultOutcome[];
};

export type LensComparison = {
  id: LensId;
  label: string;
  homeScore: number;
  awayScore: number;
  diff: number;
  sameStrength: boolean;
};

export type FixtureLast5 = {
  home: TeamLast5 | null;
  away: TeamLast5 | null;
  ukulumbanaId: number | null;
  ukulumbanaLabel: string | null;
  lenses: LensComparison[];
  /** True when any lens shows a meaningful gap (≥ 3). */
  significantSplit: boolean;
  /** Reliability hook — fill later when results land. */
  reliabilityNote: string;
};

export const GRADE_POINTS: Record<FormGrade, number> = {
  excellent: 3,
  good: 2,
  mediocre: 1,
  bad: 0,
};

export const OPTION_LABEL: Record<TrueOption, string> = {
  good: 'Good form',
  medium: 'Mixed form',
  bad: 'Poor form',
  good_inhla: 'Good form · bounce-back',
  medium_inhla: 'Mixed form · bounce-back',
  bad_inhla: 'Poor form · bounce-back',
};

/**
 * Grade one result: outcome + home/away + opponent above/below.
 * Spec from the handwritten "last 5 recalculation" pages.
 */
export function gradeResult(r: TeamResult): FormGrade {
  const above = r.opponentAbove === true;
  const below = r.opponentAbove === false;
  // Unknown opponent rank → treat as "level" (milder grades).
  const level = r.opponentAbove == null;

  if (r.outcome === 'W') {
    if (above || level) return 'excellent';
    if (below) return 'mediocre';
    return 'good';
  }
  if (r.outcome === 'D') {
    if (!r.isHome && above) return 'good';
    if (!r.isHome && below) return 'mediocre';
    if (r.isHome && above) return 'mediocre';
    if (r.isHome && below) return 'bad';
    return 'mediocre';
  }
  // Loss
  if (!r.isHome && above) return 'mediocre';
  return 'bad';
}

export function bandFromTablePoints(pts: number): FormBand {
  if (pts > 9) return 'good';
  if (pts < 4) return 'bad';
  return 'medium';
}

export function trueOption(band: FormBand, inhlambuluko: boolean): TrueOption {
  if (band === 'good') return inhlambuluko ? 'good_inhla' : 'good';
  if (band === 'bad') return inhlambuluko ? 'bad_inhla' : 'bad';
  return inhlambuluko ? 'medium_inhla' : 'medium';
}

function bandRank(b: FormBand): number {
  if (b === 'good') return 2;
  if (b === 'medium') return 1;
  return 0;
}

function changeBetween(initial: FormBand, final: FormBand): FormChange {
  const d = bandRank(final) - bandRank(initial);
  if (d > 0) return 'positive';
  if (d < 0) return 'negative';
  return 'zero';
}

export function analyseTeamLast5(teamId: number, results: TeamResult[]): TeamLast5 | null {
  const last5 = lastN(results, 5);
  if (last5.length === 0) return null;

  const games: GradedGame[] = last5.map((result) => {
    const grade = gradeResult(result);
    return { result, grade, points: GRADE_POINTS[grade] };
  });

  const gradePoints = games.reduce((s, g) => s + g.points, 0);
  const sequence = last5.map((r) => r.outcome);
  const tablePoints = pointsFromOutcomes(sequence);
  const draws = sequence.filter((o) => o === 'D').length;
  const inhlambuluko = draws >= 3;
  const band = bandFromTablePoints(tablePoints);

  // Initial = band using games 2..5 (before newest); final = full last 5.
  const older = sequence.slice(1);
  const initialBand =
    older.length > 0 ? bandFromTablePoints(pointsFromOutcomes(older)) : band;
  const finalBand = band;
  const change = changeBetween(initialBand, finalBand);

  return {
    teamId,
    games,
    gradePoints,
    tablePoints,
    band,
    inhlambuluko,
    option: trueOption(band, inhlambuluko),
    initialBand,
    finalBand,
    change,
    sequence,
  };
}

/** All 21 Ukulumbana pairings from the notes (order preserved). */
export const UKULUMBANA: { id: number; a: TrueOption; b: TrueOption; label: string }[] = [
  { id: 1, a: 'good', b: 'bad', label: 'Good form vs poor form' },
  { id: 2, a: 'good', b: 'medium', label: 'Good form vs mixed form' },
  { id: 3, a: 'good', b: 'good_inhla', label: 'Good form vs good (bounce-back)' },
  { id: 4, a: 'good', b: 'bad_inhla', label: 'Good form vs poor (bounce-back)' },
  { id: 5, a: 'good', b: 'medium_inhla', label: 'Good form vs mixed (bounce-back)' },
  { id: 6, a: 'bad', b: 'medium', label: 'Poor form vs mixed form' },
  { id: 7, a: 'bad', b: 'good_inhla', label: 'Poor form vs good (bounce-back)' },
  { id: 8, a: 'bad', b: 'bad_inhla', label: 'Poor form vs poor (bounce-back)' },
  { id: 9, a: 'bad', b: 'medium_inhla', label: 'Poor form vs mixed (bounce-back)' },
  { id: 10, a: 'medium', b: 'good_inhla', label: 'Mixed form vs good (bounce-back)' },
  { id: 11, a: 'medium', b: 'bad_inhla', label: 'Mixed form vs poor (bounce-back)' },
  { id: 12, a: 'medium', b: 'medium_inhla', label: 'Mixed form vs mixed (bounce-back)' },
  { id: 13, a: 'good_inhla', b: 'bad_inhla', label: 'Good bounce-back vs poor bounce-back' },
  { id: 14, a: 'good_inhla', b: 'medium_inhla', label: 'Good bounce-back vs mixed bounce-back' },
  { id: 15, a: 'bad_inhla', b: 'medium_inhla', label: 'Poor bounce-back vs mixed bounce-back' },
  { id: 16, a: 'good', b: 'good', label: 'Good form vs good form' },
  { id: 17, a: 'bad', b: 'bad', label: 'Poor form vs poor form' },
  { id: 18, a: 'medium', b: 'medium', label: 'Mixed form vs mixed form' },
  { id: 19, a: 'good_inhla', b: 'good_inhla', label: 'Both bouncing back well' },
  { id: 20, a: 'bad_inhla', b: 'bad_inhla', label: 'Both bouncing back from poor form' },
  { id: 21, a: 'medium_inhla', b: 'medium_inhla', label: 'Both bouncing back from mixed form' },
];

function optionsMatch(a: TrueOption, b: TrueOption, left: TrueOption, right: TrueOption): boolean {
  return (a === left && b === right) || (a === right && b === left);
}

export function findUkulumbana(
  home: TrueOption,
  away: TrueOption,
): { id: number; label: string } | null {
  const hit = UKULUMBANA.find((u) => optionsMatch(home, away, u.a, u.b));
  return hit ? { id: hit.id, label: hit.label } : null;
}

function scopePoints(results: TeamResult[], scope: 'overall' | 'home' | 'away', n = 5): number {
  return pointsFromOutcomes(lastN(filterScope(results, scope), n).map((r) => r.outcome));
}

/**
 * Lenses A–D from the notes.
 * Same-strength when |diff| ≤ 4; meaningful split when |diff| ≥ 3
 * (both thresholds kept as specified — callers can highlight either).
 */
export function compareLenses(
  homeResults: TeamResult[],
  awayResults: TeamResult[],
): LensComparison[] {
  const defs: { id: LensId; label: string; home: 'home' | 'overall'; away: 'away' | 'overall' }[] = [
    { id: 'A', label: 'Home vs Away', home: 'home', away: 'away' },
    { id: 'B', label: 'Home vs Overall', home: 'home', away: 'overall' },
    { id: 'C', label: 'Overall vs Away', home: 'overall', away: 'away' },
    { id: 'D', label: 'Overall vs Overall', home: 'overall', away: 'overall' },
  ];

  return defs.map((d) => {
    const homeScore = scopePoints(homeResults, d.home);
    const awayScore = scopePoints(awayResults, d.away);
    const diff = homeScore - awayScore;
    return {
      id: d.id,
      label: d.label,
      homeScore,
      awayScore,
      diff,
      sameStrength: Math.abs(diff) <= 4,
    };
  });
}

export function analyseFixtureLast5(
  homeId: number | null | undefined,
  awayId: number | null | undefined,
  homeResults: TeamResult[],
  awayResults: TeamResult[],
): FixtureLast5 {
  const home = homeId != null ? analyseTeamLast5(homeId, homeResults) : null;
  const away = awayId != null ? analyseTeamLast5(awayId, awayResults) : null;
  const pair =
    home && away ? findUkulumbana(home.option, away.option) : null;
  const lenses = compareLenses(homeResults, awayResults);
  const significantSplit = lenses.some((l) => Math.abs(l.diff) >= 3 && !l.sameStrength)
    || lenses.some((l) => Math.abs(l.diff) >= 3);

  return {
    home,
    away,
    ukulumbanaId: pair?.id ?? null,
    ukulumbanaLabel: pair?.label ?? null,
    lenses,
    significantSplit,
    reliabilityNote:
      'After full-time, compare this pre-match read to the real result to judge how reliable it was.',
  };
}

export const CHANGE_LABEL: Record<FormChange, string> = {
  positive: 'Improving lately',
  zero: 'Steady lately',
  negative: 'Slipping lately',
};
