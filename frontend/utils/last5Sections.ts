/**
 * Last-5 Sections 3–4 — T1−T2 strength subtract and colour-band goal-difference labels.
 */

import type { SeasonMatch } from '@/utils/bhozomaEngine';
import {
  colourFromZone,
  evaluatePositionGap,
  fmtGapScore,
  gapValueFromPositionGrade,
  letterFromGapValue,
  type BaselineLetter,
  type TableColour,
} from '@/utils/powerDynamicsEngine';
import { bandOf } from '@/utils/leagueTables';
import { statusFromOutcome, type InitialStatus } from '@/utils/last5Analysis';
import type { StandingLike } from '@/utils/motivationEngine';
import {
  last5FormLeagueTable,
  type Last6Period,
  type Last6Venue,
} from '@/utils/last6Form';
import {
  excludeFixture,
  filterScope,
  lastN,
  type ResultOutcome,
  type TeamResult,
} from '@/utils/teamResults';

export type TwoGoalGrade =
  | 'great'
  | 'good'
  | 'mediocre'
  | 'bad'
  /** 1-goal loss R vs G / R vs Y — mediocre but counted as a positive fight. */
  | 'mediocre_positive';

export type ColourPairId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const COLOUR_PAIR_LABEL: Record<ColourPairId, string> = {
  1: 'G vs G',
  2: 'G vs Y',
  3: 'G vs R',
  4: 'Y vs G',
  5: 'Y vs Y',
  6: 'Y vs R',
  7: 'R vs G',
  8: 'R vs Y',
  9: 'R vs R',
};

/** Win by exactly 1 goal — labels from the SKM sheet, pairs 1–9. */
const WIN_1GD: Record<ColourPairId, TwoGoalGrade> = {
  1: 'good',
  2: 'mediocre',
  3: 'bad',
  4: 'good',
  5: 'good',
  6: 'mediocre',
  7: 'great',
  8: 'good',
  9: 'good',
};

/** Loss by exactly 1 goal — labels from the SKM sheet, pairs 1–9. */
const LOSS_1GD: Record<ColourPairId, TwoGoalGrade> = {
  1: 'bad',
  2: 'bad',
  3: 'bad',
  4: 'mediocre',
  5: 'bad',
  6: 'bad',
  7: 'mediocre_positive',
  8: 'mediocre_positive',
  9: 'bad',
};

/** Win by exactly 2 goals — labels from the SKM sheet, pairs 1–9. */
const WIN_2GD: Record<ColourPairId, TwoGoalGrade> = {
  1: 'good',
  2: 'mediocre',
  3: 'mediocre',
  4: 'great',
  5: 'good',
  6: 'mediocre',
  7: 'great',
  8: 'good',
  9: 'good',
};

/** Loss by exactly 2 goals — labels from the SKM sheet, pairs 1–9. */
const LOSS_2GD: Record<ColourPairId, TwoGoalGrade> = {
  1: 'bad',
  2: 'bad',
  3: 'bad',
  4: 'mediocre',
  5: 'bad',
  6: 'bad',
  7: 'mediocre',
  8: 'mediocre',
  9: 'bad',
};

/**
 * Overall venue — W / D / L colour-band labels (pairs 1–9).
 * Draw pair 1 (G vs G) is resolved by table rank: above → good, below → bad, level → mediocre.
 */
const WIN_OVERALL: Record<ColourPairId, TwoGoalGrade> = {
  1: 'good',
  2: 'mediocre',
  3: 'mediocre',
  4: 'great',
  5: 'good',
  6: 'mediocre',
  7: 'great',
  8: 'great',
  9: 'good',
};

const DRAW_OVERALL: Record<ColourPairId, TwoGoalGrade> = {
  1: 'mediocre',
  2: 'bad',
  3: 'bad',
  4: 'good',
  5: 'mediocre',
  6: 'bad',
  7: 'great',
  8: 'good',
  9: 'mediocre',
};

const LOSS_OVERALL: Record<ColourPairId, TwoGoalGrade> = {
  1: 'bad',
  2: 'bad',
  3: 'bad',
  4: 'mediocre',
  5: 'bad',
  6: 'bad',
  7: 'mediocre',
  8: 'mediocre',
  9: 'bad',
};

export const TWO_GOAL_GRADE_LABEL: Record<TwoGoalGrade, string> = {
  great: 'Great',
  good: 'Good',
  mediocre: 'Mediocre',
  bad: 'Bad',
  mediocre_positive: 'Mediocre + well fought battle = positive',
};

export function colourLetter(c: TableColour | null): 'G' | 'Y' | 'R' | '—' {
  if (c === 'green') return 'G';
  if (c === 'yellow') return 'Y';
  if (c === 'red') return 'R';
  return '—';
}

export function colourPairId(team: TableColour | null, opp: TableColour | null): ColourPairId | null {
  if (team == null || opp == null) return null;
  const key = `${team}_${opp}` as const;
  const map: Record<string, ColourPairId> = {
    green_green: 1,
    green_yellow: 2,
    green_red: 3,
    yellow_green: 4,
    yellow_yellow: 5,
    yellow_red: 6,
    red_green: 7,
    red_yellow: 8,
    red_red: 9,
  };
  return map[key] ?? null;
}

/** `all` = every last-5 game · 1–5 exact margin · 6 = six or more. */
export type GoalDiffTab = 'all' | 1 | 2 | 3 | 4 | 5 | 6;

export const GOAL_DIFF_TABS: { id: GoalDiffTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 1, label: '1 goal' },
  { id: 2, label: '2 goal' },
  { id: 3, label: '3 goal' },
  { id: 4, label: '4 goal' },
  { id: 5, label: '5 goal' },
  { id: 6, label: '6+ goal' },
];

/** Outcome filter for Section 4 — All or W / D / L only. */
export type OutcomeTab = 'all' | ResultOutcome;

export const OUTCOME_TABS: { id: OutcomeTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'W', label: 'Win' },
  { id: 'D', label: 'Draw' },
  { id: 'L', label: 'Loss' },
];

export function matchesOutcomeTab(outcome: ResultOutcome, tab: OutcomeTab): boolean {
  if (tab === 'all') return true;
  return outcome === tab;
}

export function outcomeTabLabel(tab: OutcomeTab): string {
  return OUTCOME_TABS.find((t) => t.id === tab)?.label ?? tab;
}

export function matchesGoalDiffTab(goalDiff: number, tab: GoalDiffTab): boolean {
  if (tab === 'all') return true;
  const abs = Math.abs(goalDiff);
  if (tab === 6) return abs >= 6;
  return abs === tab;
}

export function goalDiffTabLabel(tab: GoalDiffTab): string {
  return GOAL_DIFF_TABS.find((t) => t.id === tab)?.label ?? `${tab} goal`;
}

export type TwoGoalVenueMode = 'overall' | 't1_home' | 't1_away';

/**
 * Colour-band grade for a result at the selected margin / venue mode.
 * Overall uses the W/D/L sheet (any margin on All; filtered margins still use that sheet).
 * Home/away modes use the 1-goal and 2-goal sheets for W/L; draws use the overall draw sheet.
 * On All (home/away), each W/L uses the sheet that matches its own margin.
 * A home-side loss the sheet calls Mediocre is shown as Bad.
 */
export function twoGoalGrade(
  team: TableColour | null,
  opp: TableColour | null,
  outcome: ResultOutcome,
  goalDiff: number,
  tab: GoalDiffTab = 2,
  opts?: {
    mode?: TwoGoalVenueMode;
    teamRank?: number | null;
    oppRank?: number | null;
    /** True when this result was played at home (or the side column is Home). */
    isHome?: boolean;
  },
): TwoGoalGrade | null {
  if (!matchesGoalDiffTab(goalDiff, tab)) return null;

  const abs = Math.abs(goalDiff);
  const pair = colourPairId(team, opp);
  if (pair == null) return null;

  const mode = opts?.mode ?? 't1_home';
  let grade: TwoGoalGrade | null = null;

  if (mode === 'overall') {
    if (outcome === 'W') grade = WIN_OVERALL[pair];
    else if (outcome === 'L') grade = LOSS_OVERALL[pair];
    else if (outcome === 'D') grade = drawOverallGrade(pair, opts?.teamRank ?? null, opts?.oppRank ?? null);
  } else if (outcome === 'D') {
    grade = drawOverallGrade(pair, opts?.teamRank ?? null, opts?.oppRank ?? null);
  } else {
    let table: Record<ColourPairId, TwoGoalGrade> | null = null;
    if (abs === 1 && (tab === 1 || tab === 'all')) {
      table = outcome === 'W' ? WIN_1GD : outcome === 'L' ? LOSS_1GD : null;
    } else if (abs === 2 && (tab === 2 || tab === 'all')) {
      table = outcome === 'W' ? WIN_2GD : outcome === 'L' ? LOSS_2GD : null;
    }
    grade = table?.[pair] ?? null;
  }

  if (
    outcome === 'L' &&
    opts?.isHome === true &&
    (grade === 'mediocre' || grade === 'mediocre_positive')
  ) {
    return 'bad';
  }
  return grade;
}

/** G vs G draw: who sits above on the table decides good vs bad. */
function drawOverallGrade(
  pair: ColourPairId,
  teamRank: number | null,
  oppRank: number | null,
): TwoGoalGrade {
  if (pair === 1) {
    if (teamRank != null && oppRank != null) {
      if (teamRank < oppRank) return 'good';
      if (teamRank > oppRank) return 'bad';
    }
    return 'mediocre';
  }
  return DRAW_OVERALL[pair];
}

function standingColour(row: StandingLike | undefined, tableSize: number): TableColour | null {
  if (!row) return null;
  return colourFromZone(row.zone) ?? (row.rank != null ? bandOf(row.rank, tableSize) : null);
}

export type Last5DiffRead = {
  venue: Last6Venue;
  period: Last6Period;
  t1Points: number | null;
  t2Points: number | null;
  t1Mp: number;
  t2Mp: number;
  /** T1 − T2. Positive → T1 stronger. Negative → T2 stronger. */
  diff: number | null;
  call: string;
};

export function last5PointsDiff(opts: {
  standings: StandingLike[];
  matches: SeasonMatch[];
  t1Id: number | null;
  t2Id: number | null;
  t1Label: string;
  t2Label: string;
  venue: Last6Venue;
  period: Last6Period;
}): Last5DiffRead {
  const table = last5FormLeagueTable(opts.standings, opts.matches, {
    venue: opts.venue,
    period: opts.period,
  });
  const t1 = opts.t1Id != null ? table.find((r) => r.teamId === opts.t1Id) : undefined;
  const t2 = opts.t2Id != null ? table.find((r) => r.teamId === opts.t2Id) : undefined;
  const t1Points = t1?.form?.points ?? null;
  const t2Points = t2?.form?.points ?? null;
  const t1Mp = t1?.form?.mp ?? 0;
  const t2Mp = t2?.form?.mp ?? 0;
  if (t1Points == null || t2Points == null) {
    return {
      venue: opts.venue,
      period: opts.period,
      t1Points,
      t2Points,
      t1Mp,
      t2Mp,
      diff: null,
      call: 'Need last-5 samples for both sides',
    };
  }
  const diff = t1Points - t2Points;
  const call =
    diff > 0
      ? `${opts.t1Label} stronger by ${diff}`
      : diff < 0
        ? `${opts.t2Label} stronger by ${Math.abs(diff)}`
        : 'Level on last-5 points';
  return {
    venue: opts.venue,
    period: opts.period,
    t1Points,
    t2Points,
    t1Mp,
    t2Mp,
    diff,
    call,
  };
}

export type TwoGoalGameRead = {
  opponentName: string;
  isHome: boolean;
  gf: number;
  ga: number;
  outcome: ResultOutcome;
  teamColour: TableColour | null;
  oppColour: TableColour | null;
  pairId: ColourPairId | null;
  pairLabel: string;
  grade: TwoGoalGrade | null;
  gradeLabel: string;
};

export type TwoGoalSideRead = {
  teamId: number;
  label: string;
  venue: 'home' | 'away' | 'overall';
  teamColour: TableColour | null;
  games: TwoGoalGameRead[];
};

function twoGoalSide(opts: {
  teamId: number;
  label: string;
  venue: 'home' | 'away' | 'overall';
  /** Same newest-first feed Section 1 uses (any venue); scoped here. */
  results: TeamResult[];
  standings: StandingLike[];
  goalDiff: GoalDiffTab;
  outcome: OutcomeTab;
  mode: TwoGoalVenueMode;
  excludeFixtureId?: number | null;
  /** Fixture home side. Their Mediocre losses are shown as Bad in every venue. */
  fixtureHomeId?: number | null;
}): TwoGoalSideRead {
  const byId = new Map(opts.standings.map((s) => [s.teamId, s]));
  const n = opts.standings.length;
  const teamRow = byId.get(opts.teamId);
  const teamColour = standingColour(teamRow, n);
  // Same sample as Section 1 INITIAL STATE: drop this fixture, venue-scope, last 5.
  const cleaned = excludeFixture(opts.results, opts.excludeFixtureId);
  const scoped = opts.venue === 'overall' ? cleaned : filterScope(cleaned, opts.venue);
  const results = lastN(scoped, 5).filter(
    (r) =>
      matchesGoalDiffTab(r.goalDiff, opts.goalDiff) && matchesOutcomeTab(r.outcome, opts.outcome),
  );
  const games: TwoGoalGameRead[] = results.map((r) => {
    const opp = r.opponentId != null ? byId.get(r.opponentId) : undefined;
    const oppColour = standingColour(opp, n);
    const pairId = colourPairId(teamColour, oppColour);
    // Home column → always home; away column → always away; overall → each game's venue.
    const isHome =
      opts.venue === 'home' ? true : opts.venue === 'away' ? false : r.isHome;
    const grade = finalizeSection4Grade(
      twoGoalGrade(teamColour, oppColour, r.outcome, r.goalDiff, opts.goalDiff, {
        mode: opts.mode,
        teamRank: r.teamRank,
        oppRank: r.opponentRank,
        isHome,
      }),
      r.outcome,
      isHome,
      opts.venue,
      opts.teamId,
      opts.fixtureHomeId,
    );
    return {
      opponentName: r.opponentName,
      isHome,
      gf: r.gf,
      ga: r.ga,
      outcome: r.outcome,
      teamColour,
      oppColour,
      pairId,
      pairLabel: pairId != null ? COLOUR_PAIR_LABEL[pairId] : '—',
      grade,
      gradeLabel: grade != null ? TWO_GOAL_GRADE_LABEL[grade] : '—',
    };
  });
  return {
    teamId: opts.teamId,
    label: opts.label,
    venue: opts.venue,
    teamColour,
    games,
  };
}

/**
 * Overall: both sides last-5 any venue, graded with the overall W/D/L sheet.
 * Venue tab A (t1_home): T1 at home + T2 away — same sample as Section 1 Home/Away when T1 is home.
 * Venue tab B (t1_away): T1 away + T2 at home.
 * Goal-diff / outcome tabs keep only matching last-5 games.
 */
export function twoGoalBandSides(opts: {
  t1Id: number | null;
  t2Id: number | null;
  t1Label: string;
  t2Label: string;
  t1Results: TeamResult[];
  t2Results: TeamResult[];
  standings: StandingLike[];
  mode: TwoGoalVenueMode;
  goalDiff?: GoalDiffTab;
  outcome?: OutcomeTab;
  /** Current fixture — excluded so the read matches Section 1 going into the match. */
  excludeFixtureId?: number | null;
  fixtureHomeId?: number | null;
}): { left: TwoGoalSideRead | null; right: TwoGoalSideRead | null } {
  const goalDiff = opts.goalDiff ?? 'all';
  const outcome = opts.outcome ?? 'all';
  if (opts.t1Id == null || opts.t2Id == null) return { left: null, right: null };
  const sideOpts = {
    standings: opts.standings,
    goalDiff,
    outcome,
    mode: opts.mode,
    excludeFixtureId: opts.excludeFixtureId,
    fixtureHomeId: opts.fixtureHomeId,
  };
  if (opts.mode === 'overall') {
    return {
      left: twoGoalSide({
        teamId: opts.t1Id,
        label: opts.t1Label,
        venue: 'overall',
        results: opts.t1Results,
        ...sideOpts,
      }),
      right: twoGoalSide({
        teamId: opts.t2Id,
        label: opts.t2Label,
        venue: 'overall',
        results: opts.t2Results,
        ...sideOpts,
      }),
    };
  }
  if (opts.mode === 't1_home') {
    return {
      left: twoGoalSide({
        teamId: opts.t1Id,
        label: opts.t1Label,
        venue: 'home',
        results: opts.t1Results,
        ...sideOpts,
      }),
      right: twoGoalSide({
        teamId: opts.t2Id,
        label: opts.t2Label,
        venue: 'away',
        results: opts.t2Results,
        ...sideOpts,
      }),
    };
  }
  return {
    left: twoGoalSide({
      teamId: opts.t1Id,
      label: opts.t1Label,
      venue: 'away',
      results: opts.t1Results,
      ...sideOpts,
    }),
    right: twoGoalSide({
      teamId: opts.t2Id,
      label: opts.t2Label,
      venue: 'home',
      results: opts.t2Results,
      ...sideOpts,
    }),
  };
}

/** Fixture home side, or a match played at home: a Mediocre loss is shown as Bad. */
export function finalizeSection4Grade(
  grade: TwoGoalGrade | null,
  outcome: ResultOutcome,
  isHome: boolean,
  venue: 'home' | 'away' | 'overall',
  teamId: number,
  fixtureHomeId?: number | null,
): TwoGoalGrade | null {
  const homeSideLoss =
    outcome === 'L' &&
    (isHome || venue === 'home' || (fixtureHomeId != null && teamId === fixtureHomeId));
  if (homeSideLoss && (grade === 'mediocre' || grade === 'mediocre_positive')) return 'bad';
  return grade;
}

export type SimpleLabel = 'good' | 'med' | 'bad';

export type LabelChange = 'positive' | 'negative' | 'no_change';

export type ChangeCode =
  | 'A1'
  | 'B1'
  | 'B2'
  | 'C1'
  | 'C2'
  | 'D1'
  | 'D2'
  | 'D3'
  | 'E1'
  | 'F1'
  | 'F2'
  | 'G1';

export type ChangeGrade = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ChangeKind = 'strength' | 'weakness' | 'no_change' | 'cancel';

export type ChangeHierarchy = {
  code: ChangeCode;
  grade: ChangeGrade;
  kind: ChangeKind;
  title: string;
};

const CHANGE_RANK: Record<SimpleLabel, number> = { bad: 0, med: 1, good: 2 };

/** Section 4 Great/Good count as good. Mediocre counts as med. Bad stays bad. */
export function section4Simple(grade: TwoGoalGrade | null): SimpleLabel | null {
  if (grade === 'great' || grade === 'good') return 'good';
  if (grade === 'mediocre' || grade === 'mediocre_positive') return 'med';
  if (grade === 'bad') return 'bad';
  return null;
}

export function section1Simple(status: InitialStatus): SimpleLabel {
  if (status === 'Good') return 'good';
  if (status === 'Bad') return 'bad';
  return 'med';
}

/** Section 4 higher than Section 1 is positive. Lower is negative. Same is no change. */
export function labelChange(section1: SimpleLabel, section4: SimpleLabel): LabelChange {
  const delta = CHANGE_RANK[section4] - CHANGE_RANK[section1];
  if (delta > 0) return 'positive';
  if (delta < 0) return 'negative';
  return 'no_change';
}

export const LABEL_CHANGE_TEXT: Record<LabelChange, string> = {
  positive: 'Positive change',
  negative: 'Negative change',
  no_change: 'No change',
};

/** Dominant count first: 5-0 is A1, 4-1 is B2, 3-2 is D2. */
const CHANGE_PATTERN: Record<string, { code: ChangeCode; grade: ChangeGrade }> = {
  '5-0': { code: 'A1', grade: 1 },
  '4-0': { code: 'B1', grade: 2 },
  '4-1': { code: 'B2', grade: 2 },
  '3-0': { code: 'C1', grade: 3 },
  '3-1': { code: 'C2', grade: 3 },
  '2-0': { code: 'D1', grade: 4 },
  '3-2': { code: 'D2', grade: 4 },
  '2-1': { code: 'D3', grade: 4 },
  '1-0': { code: 'E1', grade: 5 },
};

export function changeHierarchy(positives: number, negatives: number): ChangeHierarchy {
  if (positives === 0 && negatives === 0) {
    return { code: 'G1', grade: 6, kind: 'no_change', title: 'No change' };
  }
  if (positives === negatives) {
    return {
      code: positives >= 2 ? 'F1' : 'F2',
      grade: 7,
      kind: 'cancel',
      title: 'Cancel',
    };
  }
  if (positives > negatives) {
    const hit = CHANGE_PATTERN[`${positives}-${negatives}`];
    return {
      code: hit?.code ?? 'E1',
      grade: hit?.grade ?? 5,
      kind: 'strength',
      title: 'Hidden strength',
    };
  }
  const hit = CHANGE_PATTERN[`${negatives}-${positives}`];
  return {
    code: hit?.code ?? 'E1',
    grade: hit?.grade ?? 5,
    kind: 'weakness',
    title: 'Hidden weakness',
  };
}

export type ChangeGuideRow = {
  grade: ChangeGrade;
  code: ChangeCode;
  kind: ChangeKind;
  detail: string;
};

/** How each code is assigned. Strength and weakness share the same codes. */
export const CHANGE_GUIDE: ChangeGuideRow[] = [
  { grade: 1, code: 'A1', kind: 'strength', detail: '5 positives, 0 negatives' },
  { grade: 2, code: 'B1', kind: 'strength', detail: '4 positives, 0 negatives' },
  { grade: 2, code: 'B2', kind: 'strength', detail: '4 positives, 1 negative' },
  { grade: 3, code: 'C1', kind: 'strength', detail: '3 positives, 0 negatives' },
  { grade: 3, code: 'C2', kind: 'strength', detail: '3 positives, 1 negative' },
  { grade: 4, code: 'D1', kind: 'strength', detail: '2 positives, 0 negatives' },
  { grade: 4, code: 'D2', kind: 'strength', detail: '3 positives, 2 negatives' },
  { grade: 4, code: 'D3', kind: 'strength', detail: '2 positives, 1 negative' },
  { grade: 5, code: 'E1', kind: 'strength', detail: '1 positive, 0 negatives' },
  { grade: 1, code: 'A1', kind: 'weakness', detail: '5 negatives, 0 positives' },
  { grade: 2, code: 'B1', kind: 'weakness', detail: '4 negatives, 0 positives' },
  { grade: 2, code: 'B2', kind: 'weakness', detail: '4 negatives, 1 positive' },
  { grade: 3, code: 'C1', kind: 'weakness', detail: '3 negatives, 0 positives' },
  { grade: 3, code: 'C2', kind: 'weakness', detail: '3 negatives, 1 positive' },
  { grade: 4, code: 'D1', kind: 'weakness', detail: '2 negatives, 0 positives' },
  { grade: 4, code: 'D2', kind: 'weakness', detail: '3 negatives, 2 positives' },
  { grade: 4, code: 'D3', kind: 'weakness', detail: '2 negatives, 1 positive' },
  { grade: 5, code: 'E1', kind: 'weakness', detail: '1 negative, 0 positives' },
  { grade: 6, code: 'G1', kind: 'no_change', detail: 'No positive or negative changes' },
  { grade: 7, code: 'F1', kind: 'cancel', detail: '2 positives and 2 negatives cancel' },
  { grade: 7, code: 'F2', kind: 'cancel', detail: '1 positive and 1 negative cancel' },
];

/** 14 places. 1–7 are the positive hierarchy. 8–14 are the negative hierarchy. */
export const CHANGE_SCALE_SIZE = 14;

export type ChangeScaleSlot = {
  place: number;
  grade: ChangeGrade;
  side: 'positive' | 'negative';
  label: string;
};

export const CHANGE_SCALE: ChangeScaleSlot[] = [
  { place: 1, grade: 1, side: 'positive', label: 'A1 · Grade 1' },
  { place: 2, grade: 2, side: 'positive', label: 'Grade 2 · B1, B2' },
  { place: 3, grade: 3, side: 'positive', label: 'Grade 3 · C1, C2' },
  { place: 4, grade: 4, side: 'positive', label: 'Grade 4 · D1, D2, D3' },
  { place: 5, grade: 5, side: 'positive', label: 'E1 · Grade 5' },
  { place: 6, grade: 6, side: 'positive', label: 'G1 · No change' },
  { place: 7, grade: 7, side: 'positive', label: 'F1, F2 · Cancel' },
  { place: 8, grade: 7, side: 'negative', label: 'Grade 7' },
  { place: 9, grade: 6, side: 'negative', label: 'Grade 6' },
  { place: 10, grade: 5, side: 'negative', label: 'E1 · Grade 5' },
  { place: 11, grade: 4, side: 'negative', label: 'Grade 4 · D1, D2, D3' },
  { place: 12, grade: 3, side: 'negative', label: 'Grade 3 · C1, C2' },
  { place: 13, grade: 2, side: 'negative', label: 'Grade 2 · B1, B2' },
  { place: 14, grade: 1, side: 'negative', label: 'A1 · Grade 1' },
];

/** Positive grades sit on places 1–7. Negative grades sit on 8–14, grade 7 at 8 through grade 1 at 14. */
export function changeScalePlace(hierarchy: ChangeHierarchy): number {
  if (hierarchy.kind === 'weakness') return 15 - hierarchy.grade;
  return hierarchy.grade;
}

export type ChangeScaleGap = {
  t1Place: number;
  t2Place: number;
  grade: string | null;
  gradeIndex: number | null;
  from: number | null;
  to: number | null;
  denom: number;
  separation: number | null;
  stronger: 't1' | 't2' | 'level' | null;
  call: string;
  t1: { letter: BaselineLetter | null; score: number | null };
  t2: { letter: BaselineLetter | null; score: number | null };
};

export function changeScaleGap(t1: ChangeHierarchy, t2: ChangeHierarchy): ChangeScaleGap {
  const t1Place = changeScalePlace(t1);
  const t2Place = changeScalePlace(t2);
  const position = evaluatePositionGap({
    tableSize: CHANGE_SCALE_SIZE,
    t1Rank: t1Place,
    t2Rank: t2Place,
    t1Label: 'T1',
    t2Label: 'T2',
  });
  const denom = CHANGE_SCALE_SIZE - 1;
  const separation =
    position.gradeIndex != null ? gapValueFromPositionGrade(position.gradeIndex, CHANGE_SCALE_SIZE) : null;
  const letter = separation != null ? letterFromGapValue(separation) : null;
  const stronger = separation == null || separation <= 0 ? 'level' : position.higher;
  const weak: BaselineLetter = 'F';
  const t1Side =
    stronger === 't1'
      ? { letter, score: separation }
      : { letter: separation == null ? null : weak, score: separation == null ? null : 0 };
  const t2Side =
    stronger === 't2'
      ? { letter, score: separation }
      : { letter: separation == null ? null : weak, score: separation == null ? null : 0 };
  const g = position.gradeIndex ?? denom;
  const call =
    position.grade == null || separation == null
      ? 'Need both sides on the change scale.'
      : `${position.grade} · ${g}/${denom} · gap ${fmtGapScore(separation)} · type ${stronger === 'level' ? weak : letter}`;

  return {
    t1Place,
    t2Place,
    grade: position.grade,
    gradeIndex: position.gradeIndex,
    from: position.from,
    to: position.to,
    denom,
    separation,
    stronger,
    call,
    t1: t1Side,
    t2: t2Side,
  };
}

export type LabelChangeGame = {
  opponentName: string;
  outcome: ResultOutcome;
  gf: number;
  ga: number;
  section1: InitialStatus;
  section4Label: string;
  change: LabelChange | null;
};

export type LabelChangeSide = {
  teamId: number;
  label: string;
  venue: 'home' | 'away' | 'overall';
  games: LabelChangeGame[];
  positives: number;
  negatives: number;
  unchanged: number;
  hierarchy: ChangeHierarchy;
};

function labelChangeSide(side: TwoGoalSideRead): LabelChangeSide {
  let positives = 0;
  let negatives = 0;
  let unchanged = 0;
  const games: LabelChangeGame[] = side.games.map((g) => {
    const section1 = statusFromOutcome(g.outcome);
    const simple4 = section4Simple(g.grade);
    const change = simple4 == null ? null : labelChange(section1Simple(section1), simple4);
    if (change === 'positive') positives += 1;
    else if (change === 'negative') negatives += 1;
    else if (change === 'no_change') unchanged += 1;
    return {
      opponentName: g.opponentName,
      outcome: g.outcome,
      gf: g.gf,
      ga: g.ga,
      section1,
      section4Label: g.gradeLabel,
      change,
    };
  });
  return {
    teamId: side.teamId,
    label: side.label,
    venue: side.venue,
    games,
    positives,
    negatives,
    unchanged,
    hierarchy: changeHierarchy(positives, negatives),
  };
}

/** Same last-5 sample as Sections 1 and 4, with a change read on every game. */
export function last5LabelChanges(opts: {
  t1Id: number | null;
  t2Id: number | null;
  t1Label: string;
  t2Label: string;
  t1Results: TeamResult[];
  t2Results: TeamResult[];
  standings: StandingLike[];
  mode: TwoGoalVenueMode;
  excludeFixtureId?: number | null;
  fixtureHomeId?: number | null;
}): { left: LabelChangeSide | null; right: LabelChangeSide | null } {
  const sides = twoGoalBandSides({ ...opts, goalDiff: 'all', outcome: 'all' });
  return {
    left: sides.left ? labelChangeSide(sides.left) : null,
    right: sides.right ? labelChangeSide(sides.right) : null,
  };
}

export type PeakGapRead = {
  venue: Last6Venue;
  period: Last6Period;
  separation: number;
  grade: string | null;
  call: string;
};

const VENUE_WORD: Record<Last6Venue, string> = {
  overall: 'Overall',
  home: 'Home',
  away: 'Away',
};

const PERIOD_WORD: Record<Last6Period, string> = {
  ft: 'Full time',
  '1h': '1st half',
  '2h': '2nd half',
};

export function peakLast5Gap(opts: {
  standings: StandingLike[];
  matches: SeasonMatch[];
  t1Id: number | null;
  t2Id: number | null;
  t1Label: string;
  t2Label: string;
  gapFor: (
    table: ReturnType<typeof last5FormLeagueTable>,
  ) => { separation: number | null; grade: string | null };
}): PeakGapRead | null {
  if (opts.standings.length < 2 || opts.matches.length === 0) return null;
  let best: PeakGapRead | null = null;
  for (const venue of ['overall', 'home', 'away'] as const) {
    for (const period of ['ft', '1h', '2h'] as const) {
      const table = last5FormLeagueTable(opts.standings, opts.matches, { venue, period });
      const g = opts.gapFor(table);
      if (g.separation == null) continue;
      if (best == null || g.separation > best.separation) {
        best = {
          venue,
          period,
          separation: g.separation,
          grade: g.grade,
          call: `${VENUE_WORD[venue]} · ${PERIOD_WORD[period]} · gap ${g.separation.toFixed(1)}${
            g.grade ? ` (${g.grade})` : ''
          }`,
        };
      }
    }
  }
  return best;
}

export { VENUE_WORD, PERIOD_WORD };
