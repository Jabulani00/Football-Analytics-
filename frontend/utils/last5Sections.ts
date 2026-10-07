/**
 * Last-5 Sections 3–4 — T1−T2 strength subtract and 2-goal colour-band labels.
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

export type TwoGoalGrade = 'great' | 'good' | 'mediocre' | 'bad';

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

export function twoGoalGrade(
  team: TableColour | null,
  opp: TableColour | null,
  outcome: ResultOutcome,
  goalDiff: number,
): TwoGoalGrade | null {
  if (Math.abs(goalDiff) !== 2) return null;
  const pair = colourPairId(team, opp);
  if (pair == null) return null;
  if (outcome === 'W') return WIN_2GD[pair];
  if (outcome === 'L') return LOSS_2GD[pair];
  return null;
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
}): TwoGoalSideRead {
  const byId = new Map(opts.standings.map((s) => [s.teamId, s]));
  const n = opts.standings.length;
  const teamRow = byId.get(opts.teamId);
  const teamColour = standingColour(teamRow, n);
  const results = lastN(
    resultsFromSeasonMatches(opts.teamId, opts.matches, opts.standings, { venue: opts.venue }),
    5,
  );
  const games: TwoGoalGameRead[] = results.map((r) => {
    const opp = r.opponentId != null ? byId.get(r.opponentId) : undefined;
    const oppColour = standingColour(opp, n);
    const pairId = colourPairId(teamColour, oppColour);
    const grade = twoGoalGrade(teamColour, oppColour, r.outcome, r.goalDiff);
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
 * Tab A (t1_home): T1 at home + T2 away.
 * Tab B (t1_away): T1 away + T2 at home.
 */
export function twoGoalBandSides(opts: {
  t1Id: number | null;
  t2Id: number | null;
  t1Label: string;
  t2Label: string;
  matches: SeasonMatch[];
  standings: StandingLike[];
  mode: 't1_home' | 't1_away';
}): { left: TwoGoalSideRead | null; right: TwoGoalSideRead | null } {
  if (opts.t1Id == null || opts.t2Id == null) return { left: null, right: null };
  if (opts.mode === 't1_home') {
    return {
      left: twoGoalSide({
        teamId: opts.t1Id,
        label: opts.t1Label,
        venue: 'home',
        matches: opts.matches,
        standings: opts.standings,
      }),
      right: twoGoalSide({
        teamId: opts.t2Id,
        label: opts.t2Label,
        venue: 'away',
        matches: opts.matches,
        standings: opts.standings,
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
    }),
    right: twoGoalSide({
      teamId: opts.t2Id,
      label: opts.t2Label,
      venue: 'home',
      matches: opts.matches,
      standings: opts.standings,
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
