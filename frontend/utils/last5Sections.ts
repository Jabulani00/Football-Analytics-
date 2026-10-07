/**
 * Last-5 Sections 3–4 — T1−T2 strength subtract and colour-band goal-difference labels.
 */

import type { SeasonMatch } from '@/utils/bhozomaEngine';
import {
  colourFromZone,
  type TableColour,
} from '@/utils/powerDynamicsEngine';
import { bandOf } from '@/utils/leagueTables';
import type { StandingLike } from '@/utils/motivationEngine';
import {
  last5FormLeagueTable,
  resultsFromSeasonMatches,
  type Last6Period,
  type Last6Venue,
} from '@/utils/last6Form';
import { lastN, type ResultOutcome } from '@/utils/teamResults';

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

export function matchesGoalDiffTab(goalDiff: number, tab: GoalDiffTab): boolean {
  if (tab === 'all') return true;
  const abs = Math.abs(goalDiff);
  if (tab === 6) return abs >= 6;
  return abs === tab;
}

export function goalDiffTabLabel(tab: GoalDiffTab): string {
  return GOAL_DIFF_TABS.find((t) => t.id === tab)?.label ?? `${tab} goal`;
}

/**
 * Colour-band grade for a win/loss at the selected margin.
 * Sheet labels are live for 1-goal and 2-goal games. Other margins show the pair only for now.
 * On All, each game uses the sheet that matches its own margin.
 */
export function twoGoalGrade(
  team: TableColour | null,
  opp: TableColour | null,
  outcome: ResultOutcome,
  goalDiff: number,
  tab: GoalDiffTab = 2,
): TwoGoalGrade | null {
  if (!matchesGoalDiffTab(goalDiff, tab)) return null;
  const abs = Math.abs(goalDiff);
  const pair = colourPairId(team, opp);
  if (pair == null) return null;
  let table: Record<ColourPairId, TwoGoalGrade> | null = null;
  if (abs === 1 && (tab === 1 || tab === 'all')) {
    table = outcome === 'W' ? WIN_1GD : outcome === 'L' ? LOSS_1GD : null;
  } else if (abs === 2 && (tab === 2 || tab === 'all')) {
    table = outcome === 'W' ? WIN_2GD : outcome === 'L' ? LOSS_2GD : null;
  }
  return table?.[pair] ?? null;
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
  venue: 'home' | 'away';
  teamColour: TableColour | null;
  games: TwoGoalGameRead[];
};

function twoGoalSide(opts: {
  teamId: number;
  label: string;
  venue: 'home' | 'away';
  matches: SeasonMatch[];
  standings: StandingLike[];
  goalDiff: GoalDiffTab;
}): TwoGoalSideRead {
  const byId = new Map(opts.standings.map((s) => [s.teamId, s]));
  const n = opts.standings.length;
  const teamRow = byId.get(opts.teamId);
  const teamColour = standingColour(teamRow, n);
  const results = lastN(
    resultsFromSeasonMatches(opts.teamId, opts.matches, opts.standings, { venue: opts.venue }),
    5,
  ).filter((r) => matchesGoalDiffTab(r.goalDiff, opts.goalDiff));
  const games: TwoGoalGameRead[] = results.map((r) => {
    const opp = r.opponentId != null ? byId.get(r.opponentId) : undefined;
    const oppColour = standingColour(opp, n);
    const pairId = colourPairId(teamColour, oppColour);
    const grade = twoGoalGrade(teamColour, oppColour, r.outcome, r.goalDiff, opts.goalDiff);
    return {
      opponentName: r.opponentName,
      isHome: r.isHome,
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
 * Venue tab A (t1_home): T1 at home + T2 away.
 * Venue tab B (t1_away): T1 away + T2 at home.
 * Goal-diff tab keeps only last-5 games at that margin.
 */
export function twoGoalBandSides(opts: {
  t1Id: number | null;
  t2Id: number | null;
  t1Label: string;
  t2Label: string;
  matches: SeasonMatch[];
  standings: StandingLike[];
  mode: 't1_home' | 't1_away';
  goalDiff?: GoalDiffTab;
}): { left: TwoGoalSideRead | null; right: TwoGoalSideRead | null } {
  const goalDiff = opts.goalDiff ?? 'all';
  if (opts.t1Id == null || opts.t2Id == null) return { left: null, right: null };
  if (opts.mode === 't1_home') {
    return {
      left: twoGoalSide({
        teamId: opts.t1Id,
        label: opts.t1Label,
        venue: 'home',
        matches: opts.matches,
        standings: opts.standings,
        goalDiff,
      }),
      right: twoGoalSide({
        teamId: opts.t2Id,
        label: opts.t2Label,
        venue: 'away',
        matches: opts.matches,
        standings: opts.standings,
        goalDiff,
      }),
    };
  }
  return {
    left: twoGoalSide({
      teamId: opts.t1Id,
      label: opts.t1Label,
      venue: 'away',
      matches: opts.matches,
      standings: opts.standings,
      goalDiff,
    }),
    right: twoGoalSide({
      teamId: opts.t2Id,
      label: opts.t2Label,
      venue: 'home',
      matches: opts.matches,
      standings: opts.standings,
      goalDiff,
    }),
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
