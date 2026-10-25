/**
 * League-wide aspects for every power-dynamic read.
 * A pair is this side and the nearest side on the same table.
 * Season reads use that league's finished matches.
 */
import type { H2HMatch } from '@/services/oddAlerts';
import type { SeasonMatch } from '@/utils/bhozomaEngine';
import { BHOZOMA_ABOVE_PCT, UMNQUMI_BELOW_PCT, buildBhozomaTable } from '@/utils/bhozomaEngine';
import {
  COLOUR_STAT_CATALOGUE,
  colourPeriodLabel,
  colourStatById,
  passesColourPosition,
  ratesAgainstColours,
  type ColourDirection,
} from '@/utils/colourVerification';
import { contestedLeagueBoard } from '@/utils/separatorTools';
import { deathTrapSide } from '@/utils/deathTraps';
import {
  formChildBand,
  isRedChildBeater,
  umshayiWezingane,
  type FormChildBand,
} from '@/utils/formChildBeater';
import { buildImbangiTable, leagueProgressInfo, type ImbangiGrade, type ImbangiScheduleMatch } from '@/utils/imbangiEngine';
import { H2H_MEETINGS_LIMIT } from '@/utils/h2hDisplay';
import { isNikaNikaRecord, polarEdgeGrade } from '@/utils/h2hOptions';
import { bandOf } from '@/utils/leagueTables';
import {
  CHANGE_LABEL,
  OPTION_LABEL,
  UKULUMBANA,
  analyseTeamLast5,
  bandFromTablePoints,
  compareLenses,
  findUkulumbana,
  statusFromOutcome,
  trueOption,
  type FormChange,
  type TrueOption,
} from '@/utils/last5Analysis';
import { last5LabelChanges, twoGoalBandSides, type TwoGoalGrade } from '@/utils/last5Sections';
import {
  LAST5_WINDOW,
  LAST6_BAND_LABEL,
  LAST6_SPLIT_PTS,
  LAST6_TREND_SHORT,
  LAST6_WINDOW,
  analyseTeamLast6,
  last5FormLeagueTable,
  resultsFromSeasonMatches,
} from '@/utils/last6Form';
import { evaluateTeamMotivation, type MotivationGrade, type MotivationOutcome, type TeamStance } from '@/utils/motivationEngine';
import {
  colourFromZone,
  currentStreak,
  indlelaPath,
  neverTwiceInRow,
  PPG_BAND_LABEL,
  mshayiNote,
  ppgAlignsWithColour,
  ppgBandForColour,
  ppgSwing,
  type PpgBand,
  type IndlelaPath,
  type TableColour,
} from '@/utils/powerDynamicsEngine';
import { evaluateProblemCauser, type ProblemLevelName } from '@/utils/problemCauser';
import { reverseEngineer } from '@/utils/reverseEngineering';
import { pointsFromOutcomes, type ResultOutcome } from '@/utils/teamResults';

export type MeasureRow = {
  rank: number;
  teamId: number;
  name: string;
  played: number;
  points: number;
  homePoints: number;
  awayPoints: number;
  zone: 'top' | 'mid' | 'bottom';
};

export type MeasureAspect = {
  id: string;
  tabId: string;
  functionId: string;
  label: string;
  detail: string;
  needsFixtures: boolean;
  measure: string;
  token: string;
  /** True/false call. Shown twice: a tick when it holds, a wrong when it does not. */
  binary?: boolean;
  /** Scored once for the fixture, from T1 toward T2. */
  pair?: boolean;
  mark?: 'tick' | 'wrong';
};

export type MeasureScore = { percent: number; reason: string };

export type CallSearchContext = {
  matches?: SeasonMatch[];
  schedule?: ImbangiScheduleMatch[];
  cache?: Map<string, unknown>;
  /** The other side of the fixture being called. */
  opponentId?: number;
  /** This fixture, used as the current stop on a path. */
  fixture?: { homeId: number; awayId: number; unix: number };
};

const PAIR = 'Compared with the nearest side on the table.';
const SEASON = 'Read from this league’s finished matches.';

function aspect(
  partial: Omit<MeasureAspect, 'needsFixtures'> & { needsFixtures?: boolean },
): MeasureAspect {
  return { needsFixtures: false, ...partial };
}

function colourAspects(): MeasureAspect[] {
  const out: MeasureAspect[] = [];
  for (const stat of COLOUR_STAT_CATALOGUE) {
    const period = stat.periods.includes('ft') ? 'ft' : stat.periods[0];
    for (const direction of ['strong', 'weak'] as const) {
      const word = direction === 'strong' ? 'Strong' : 'Weak';
      out.push(
        aspect({
          id: `colour-${direction}-${stat.id}`,
          tabId: 'colour_verification',
          functionId: 'verify',
          label: `${word} · ${stat.name}`,
          detail: `${stat.group}, overall, ${colourPeriodLabel(period)}. ${
            direction === 'strong' ? 'Positions 1 and 2 pass.' : 'Positions 2 and 3 pass.'
          }`,
          needsFixtures: true,
          measure: 'colour-verify',
          token: `${direction}|${stat.id}`,
        }),
      );
    }
  }
  return out;
}

const FORM_BANDS: { id: FormChildBand; label: string }[] = [
  { id: 'great', label: 'Great' },
  { id: 'good', label: 'Good' },
  { id: 'mild', label: 'Mild' },
  { id: 'bad', label: 'Bad' },
];

const FORM_GROUPS = ['table', 'ft', '1h', '2h'] as const;

function formChildAspects(): MeasureAspect[] {
  const out: MeasureAspect[] = [];
  for (const group of FORM_GROUPS) {
    const sample = group === 'table' ? 'Season table.' : group === 'ft' ? 'Full-time matches.' : group === '1h' ? '1st half.' : '2nd half.';
    for (const band of FORM_BANDS) {
      out.push(
        aspect({
          id: `form-child-${group}-${band.id}`,
          tabId: 'form_child_beater',
          functionId: group,
          label: band.label,
          detail: `${sample} How close this side’s form band is to ${band.label}.`,
          needsFixtures: group !== 'table',
          measure: 'form-child',
          token: band.id,
        }),
      );
    }
    out.push(
      aspect({
        id: `form-child-${group}-child`,
        tabId: 'form_child_beater',
        functionId: group,
        label: 'Umshayi wezingane',
        detail: `${sample} Red PPG in the child-beater band.`,
        binary: true,
        needsFixtures: group !== 'table',
        measure: 'form-child',
        token: 'child',
      }),
    );
  }
  return out;
}

const DEATH_SERIES = [
  { id: 'losses', label: 'Loss margins' },
  { id: 'wins', label: 'Win margins' },
  { id: 'scoring', label: 'Goals scored' },
  { id: 'conceding', label: 'Goals conceded' },
] as const;

const DEATH_TRENDS = [
  { id: 'decline', label: 'Declining' },
  { id: 'incline', label: 'Rising' },
  { id: 'up_down', label: 'Up and down' },
  { id: 'constant', label: 'Constant' },
] as const;

const DEATH_CALL: Record<(typeof DEATH_SERIES)[number]['id'], Record<(typeof DEATH_TRENDS)[number]['id'], string>> = {
  losses: {
    decline: 'Decline goal difference',
    incline: 'Incline goal difference',
    up_down: 'Up down',
    constant: 'Constant',
  },
  wins: {
    decline: 'Decline goal difference',
    incline: 'Incline goal difference',
    up_down: 'Up down',
    constant: 'Constant',
  },
  scoring: {
    decline: 'Decline goal scoring',
    incline: 'Incline goal scoring',
    up_down: 'Up down',
    constant: 'Constant',
  },
  conceding: {
    decline: 'Decline goal conceding',
    incline: 'Incline goal conceding',
    up_down: 'Up down',
    constant: 'Constant',
  },
};

const DEATH_HEAD: Record<(typeof DEATH_SERIES)[number]['id'], string> = {
  losses: 'Losses',
  wins: 'Wins',
  scoring: 'Goal scoring',
  conceding: 'Goal conceding',
};

function deathAspects(): MeasureAspect[] {
  const out: MeasureAspect[] = [];
  for (const series of DEATH_SERIES) {
    for (const trend of DEATH_TRENDS) {
      const call = DEATH_CALL[series.id][trend.id];
      out.push(
        aspect({
          id: `death-${series.id}-${trend.id}`,
          tabId: 'last5',
          functionId: 'death_trap',
          label: `${DEATH_HEAD[series.id]} · ${call}`,
          detail: `Overall full time, last 5. ${DEATH_HEAD[series.id]}: ${call}.`,
          needsFixtures: true,
          binary: true,
          measure: 'death-trap',
          token: `${series.id}:${trend.id}`,
        }),
      );
    }
  }
  return out;
}

const GRADES: { id: TwoGoalGrade; label: string }[] = [
  { id: 'great', label: 'Great' },
  { id: 'good', label: 'Good' },
  { id: 'mediocre', label: 'Mediocre' },
  { id: 'mediocre_positive', label: 'Mediocre + well fought battle = positive' },
  { id: 'bad', label: 'Bad' },
];

const LEVELS: ProblemLevelName[] = ['Entry', 'Moderate', 'Major', 'Extreme'];

const MOTIVATION_OUTCOMES: { id: MotivationOutcome; label: string }[] = [
  { id: 'extend_lead', label: 'Extend the lead' },
  { id: 'take_over', label: 'Take over' },
  { id: 'chase_reduce_gap', label: 'Chase, reduce the gap' },
  { id: 'escape_relegation', label: 'Escape relegation' },
  { id: 'escape_safety', label: 'Escape to safety' },
  { id: 'no_reward', label: 'No reward' },
  { id: 'futile_chase', label: 'Futile chase' },
];

function rawMeasureAspects(): MeasureAspect[] {
  const h2h = (venue: 'overall' | 'home' | 'away', token: string, label: string, detail: string): MeasureAspect =>
    aspect({
      id: `h2h-${venue}-${token}`,
      tabId: 'h2h',
      functionId: venue,
      label,
      detail: `${detail} ${PAIR}`,
      needsFixtures: true,
      measure: 'h2h',
      token,
    });

  return [
    aspect({
      id: 'compliant-stronger',
      tabId: 'baseline',
      functionId: 'compliant',
      label: 'Stronger than the next side',
      detail: 'The stronger side on the table. That side’s 1X2 price is the one that should be shorter.',
      measure: 'compliant',
      token: 'stronger',
    }),
    aspect({
      id: 'zidane-never-beat',
      tabId: 'baseline',
      functionId: 'zidane_law',
      label: 'T1 has never beaten T2',
      detail: 'T1 has never beaten T2 in the meetings.',
      needsFixtures: true,
      binary: true,
      pair: true,
      measure: 'stream-h2h',
      token: 'never',
    }),
    aspect({
      id: 'bookie-did-beat',
      tabId: 'baseline',
      functionId: 'bookie',
      label: 'T1 did beat T2',
      detail: 'T1 did beat T2 in the meetings.',
      needsFixtures: true,
      binary: true,
      pair: true,
      measure: 'stream-h2h',
      token: 'beat',
    }),
    aspect({
      id: 'bookie2-no-meetings',
      tabId: 'baseline',
      functionId: 'bookie2',
      label: 'No H2H games were found',
      detail: 'No H2H games were found.',
      needsFixtures: true,
      binary: true,
      pair: true,
      measure: 'stream-h2h',
      token: 'none',
    }),
    aspect({
      id: 'motive-chase',
      tabId: 'importance_3pts',
      functionId: 'read',
      label: 'Chasing',
      detail: 'The three points pull this side up the table.',
      binary: true,
      measure: 'motive',
      token: 'chase',
    }),
    aspect({
      id: 'motive-escape',
      tabId: 'importance_3pts',
      functionId: 'read',
      label: 'Escaping',
      detail: 'The three points are about getting out of trouble.',
      binary: true,
      measure: 'motive',
      token: 'escape',
    }),
    aspect({
      id: 'motive-none',
      tabId: 'importance_3pts',
      functionId: 'read',
      label: 'Little to gain',
      detail: 'Little to gain from the table.',
      binary: true,
      measure: 'motive',
      token: 'no_reward',
    }),
    aspect({
      id: 'motive-grade-a',
      tabId: 'importance_3pts',
      functionId: 'read',
      label: 'Strong need',
      detail: 'Strong need for the three points.',
      binary: true,
      measure: 'motive',
      token: 'grade-A',
    }),
    aspect({
      id: 'motive-grade-b',
      tabId: 'importance_3pts',
      functionId: 'read',
      label: 'Some need',
      detail: 'Some need for the three points.',
      binary: true,
      measure: 'motive',
      token: 'grade-B',
    }),
    aspect({
      id: 'motive-win-climbs',
      tabId: 'importance_3pts',
      functionId: 'read',
      label: 'A win moves them up',
      detail: 'A win changes the place on the table.',
      measure: 'motive',
      token: 'win-climbs',
    }),
    aspect({
      id: 'motive-futile',
      tabId: 'importance_3pts',
      functionId: 'read',
      label: 'Futile chase',
      detail: 'Futile chase — remaining matches cannot close it.',
      binary: true,
      measure: 'motive',
      token: 'futile',
    }),
    ...MOTIVATION_OUTCOMES.map((item) =>
      aspect({
        id: `motive-${item.id}`,
        tabId: 'importance_3pts',
        functionId: 'read',
        label: item.label,
        detail: `The three-point read is “${item.label}”.`,
        binary: true,
        measure: 'motive',
        token: `outcome:${item.id}`,
      }),
    ),
    ...(['good', 'medium', 'bad', 'good_inhla', 'medium_inhla', 'bad_inhla'] as TrueOption[]).map((option) =>
      aspect({
        id: `naming-l5-${option}`,
        tabId: 'last5',
        functionId: 'initial_state',
        label: OPTION_LABEL[option],
        detail: `Last 5 naming: ${OPTION_LABEL[option]}. 9+ pts Good, 5–8 Medium, 4 or less Bad. 3+ draws add Inhlambuluko.`,
        needsFixtures: true,
        binary: true,
        measure: 'naming',
        token: option,
      }),
    ),
    aspect({
      id: 'naming-l5-inhla',
      tabId: 'last5',
      functionId: 'initial_state',
      label: 'Inhlambuluko — 3+ draws in the last 5',
      detail: 'Inhlambuluko — 3+ draws in the last 5.',
      needsFixtures: true,
      binary: true,
      measure: 'naming',
      token: 'inhla',
    }),
    ...(['positive', 'zero', 'negative'] as FormChange[]).map((change) =>
      aspect({
        id: `l5-change-${change}`,
        tabId: 'last5',
        functionId: 'initial_state',
        label: CHANGE_LABEL[change],
        detail: CHANGE_LABEL[change],
        needsFixtures: true,
        binary: true,
        measure: 'l5-change',
        token: change,
      }),
    ),
    aspect({
      id: 'last5-best',
      tabId: 'last5',
      functionId: 'league',
      label: 'Best last 5',
      detail: 'Ranked by last-5 points. First is the strongest match.',
      needsFixtures: true,
      measure: 'last5-rank',
      token: 'best',
    }),
    aspect({
      id: 'last5-worst',
      tabId: 'last5',
      functionId: 'league',
      label: 'Worst last 5',
      detail: 'Ranked by last-5 points. Last is the strongest match.',
      needsFixtures: true,
      measure: 'last5-rank',
      token: 'worst',
    }),
    aspect({
      id: 'last5-ahead',
      tabId: 'last5',
      functionId: 'form_matchup',
      label: 'Ahead of the next side',
      detail: `Last-5 points ahead of the nearest side. ${LAST6_SPLIT_PTS} points clear is a full match.`,
      needsFixtures: true,
      measure: 'matchup',
      token: 'ahead',
    }),
    aspect({
      id: 'last5-behind',
      tabId: 'last5',
      functionId: 'form_matchup',
      label: 'Behind the next side',
      detail: `Last-5 points behind the nearest side. ${LAST6_SPLIT_PTS} points short is a full match.`,
      needsFixtures: true,
      measure: 'matchup',
      token: 'behind',
    }),
    ...UKULUMBANA.map((pair) =>
      aspect({
        id: `ukulumbana-${pair.id}`,
        tabId: 'last5',
        functionId: 'form_matchup',
        label: pair.label,
        detail: pair.label,
        needsFixtures: true,
        binary: true,
        pair: true,
        measure: 'ukulumbana',
        token: String(pair.id),
      }),
    ),
    aspect({
      id: 'last5-home-stronger',
      tabId: 'last5',
      functionId: 'diff',
      label: 'Home last 5 stronger',
      detail: 'Share of last-5 points that came at home.',
      needsFixtures: true,
      measure: 'venue-form',
      token: 'home',
    }),
    aspect({
      id: 'last5-away-stronger',
      tabId: 'last5',
      functionId: 'diff',
      label: 'Away last 5 stronger',
      detail: 'Share of last-5 points that came away.',
      needsFixtures: true,
      measure: 'venue-form',
      token: 'away',
    }),
    ...(['A', 'B', 'C', 'D'] as const).map((id) => {
      const label =
        id === 'A' ? 'Home vs Away' : id === 'B' ? 'Home vs Overall' : id === 'C' ? 'Overall vs Away' : 'Overall vs Overall';
      return aspect({
        id: `lens-${id}-same`,
        tabId: 'last5',
        functionId: 'diff',
        label: `${label} · same strength`,
        detail: `${label} · same strength`,
        needsFixtures: true,
        binary: true,
        pair: true,
        measure: 'lens',
        token: id,
      });
    }),
    aspect({
      id: 'two-goal-wins',
      tabId: 'last5',
      functionId: 'two_goal',
      label: 'Wins by two or more',
      detail: 'Last 5 wins with a margin of two goals or more. Two such wins is a full match.',
      needsFixtures: true,
      measure: 'margin',
      token: 'win',
    }),
    aspect({
      id: 'two-goal-losses',
      tabId: 'last5',
      functionId: 'two_goal',
      label: 'Losses by two or more',
      detail: 'Last 5 losses with a margin of two goals or more. Two such losses is a full match.',
      needsFixtures: true,
      measure: 'margin',
      token: 'loss',
    }),
    ...GRADES.map((grade) =>
      aspect({
        id: `two-goal-${grade.id}`,
        tabId: 'last5',
        functionId: 'two_goal',
        label: grade.label,
        detail: grade.label,
        needsFixtures: true,
        binary: true,
        measure: 'two-goal',
        token: grade.id,
      }),
    ),
    aspect({
      id: 'label-strength',
      tabId: 'last5',
      functionId: 'label_change',
      label: 'Positive change',
      detail: 'Positive change in the last 5.',
      needsFixtures: true,
      binary: true,
      measure: 'label-change',
      token: 'strength',
    }),
    aspect({
      id: 'label-weakness',
      tabId: 'last5',
      functionId: 'label_change',
      label: 'Negative change',
      detail: 'Negative change in the last 5.',
      needsFixtures: true,
      binary: true,
      measure: 'label-change',
      token: 'weakness',
    }),
    aspect({
      id: 'label-cancel',
      tabId: 'last5',
      functionId: 'label_change',
      label: 'Cancel',
      detail: 'Positive and negative changes cancel.',
      needsFixtures: true,
      binary: true,
      measure: 'label-change',
      token: 'cancel',
    }),
    aspect({
      id: 'label-none',
      tabId: 'last5',
      functionId: 'label_change',
      label: 'No change',
      detail: 'No change in the last 5.',
      needsFixtures: true,
      binary: true,
      measure: 'label-change',
      token: 'no_change',
    }),
    ...deathAspects(),
    aspect({
      id: 'death-stronger',
      tabId: 'last5',
      functionId: 'death_trap',
      label: 'Getting stronger',
      detail: 'A shrinking loss margin, or a growing win margin.',
      needsFixtures: true,
      binary: true,
      measure: 'death-reading',
      token: 'stronger',
    }),
    aspect({
      id: 'death-weaker',
      tabId: 'last5',
      functionId: 'death_trap',
      label: 'Getting weaker',
      detail: 'A growing loss margin, or a shrinking win margin.',
      needsFixtures: true,
      binary: true,
      measure: 'death-reading',
      token: 'weaker',
    }),
    aspect({
      id: 'reverse-last5',
      tabId: 'last5',
      functionId: 'reverse',
      label: 'Last 5 called it',
      detail: 'How often the last 5 named the result that happened.',
      needsFixtures: true,
      measure: 'reverse',
      token: 'last5',
    }),
    aspect({
      id: 'reverse-prior',
      tabId: 'last5',
      functionId: 'reverse',
      label: 'Full record called it',
      detail: 'How often the full record named the result that happened.',
      needsFixtures: true,
      measure: 'reverse',
      token: 'prior',
    }),
    aspect({
      id: 'reverse-miss',
      tabId: 'last5',
      functionId: 'reverse',
      label: 'Last 5 missed the full record',
      detail: 'The full record had the result and the last 5 did not.',
      needsFixtures: true,
      measure: 'reverse',
      token: 'missed',
    }),
    aspect({
      id: 'form-strong',
      tabId: 'form',
      functionId: 'read',
      label: LAST6_BAND_LABEL.strong,
      detail: LAST6_BAND_LABEL.strong,
      needsFixtures: true,
      binary: true,
      measure: 'form-band',
      token: 'strong',
    }),
    aspect({
      id: 'form-mixed',
      tabId: 'form',
      functionId: 'read',
      label: LAST6_BAND_LABEL.mixed,
      detail: LAST6_BAND_LABEL.mixed,
      needsFixtures: true,
      binary: true,
      measure: 'form-band',
      token: 'mixed',
    }),
    aspect({
      id: 'form-poor',
      tabId: 'form',
      functionId: 'read',
      label: LAST6_BAND_LABEL.poor,
      detail: LAST6_BAND_LABEL.poor,
      needsFixtures: true,
      binary: true,
      measure: 'form-band',
      token: 'poor',
    }),
    aspect({
      id: 'form-up',
      tabId: 'form',
      functionId: 'read',
      label: LAST6_TREND_SHORT.picking_up,
      detail: LAST6_TREND_SHORT.picking_up,
      needsFixtures: true,
      binary: true,
      measure: 'form-trend',
      token: 'picking_up',
    }),
    aspect({
      id: 'form-down',
      tabId: 'form',
      functionId: 'read',
      label: LAST6_TREND_SHORT.dropping,
      detail: LAST6_TREND_SHORT.dropping,
      needsFixtures: true,
      binary: true,
      measure: 'form-trend',
      token: 'dropping',
    }),
    aspect({
      id: 'form-steady',
      tabId: 'form',
      functionId: 'read',
      label: LAST6_TREND_SHORT.steady,
      detail: LAST6_TREND_SHORT.steady,
      needsFixtures: true,
      binary: true,
      measure: 'form-trend',
      token: 'steady',
    }),
    ...(['good', 'medium', 'bad', 'good_inhla', 'medium_inhla', 'bad_inhla'] as TrueOption[]).map((option) =>
      aspect({
        id: `naming-l6-${option}`,
        tabId: 'form',
        functionId: 'read',
        label: OPTION_LABEL[option],
        detail: `Last 6 naming: ${OPTION_LABEL[option]}.`,
        needsFixtures: true,
        binary: true,
        measure: 'naming',
        token: `l6:${option}`,
      }),
    ),
    aspect({
      id: 'naming-l6-inhla',
      tabId: 'form',
      functionId: 'read',
      label: 'Inhlambuluko',
      detail: 'Inhlambuluko — 3+ draws in the last 6.',
      needsFixtures: true,
      binary: true,
      measure: 'naming',
      token: 'l6:inhla',
    }),
    ...UKULUMBANA.map((pair) =>
      aspect({
        id: `ukulumbana-l6-${pair.id}`,
        tabId: 'form',
        functionId: 'read',
        label: pair.label,
        detail: pair.label,
        needsFixtures: true,
        binary: true,
        pair: true,
        measure: 'ukulumbana',
        token: `l6:${pair.id}`,
      }),
    ),
    aspect({
      id: 'h2h-never-t1',
      tabId: 'h2h',
      functionId: 'overall',
      label: 'T1 has never beaten T2',
      detail: 'T1 has never beaten T2 in these meetings.',
      needsFixtures: true,
      binary: true,
      pair: true,
      measure: 'stream-h2h',
      token: 'never',
    }),
    aspect({
      id: 'h2h-polar',
      tabId: 'h2h',
      functionId: 'overall',
      label: 'T1 edge (polar)',
      detail: 'T1 edge (polar).',
      needsFixtures: true,
      binary: true,
      pair: true,
      measure: 'h2h-say',
      token: 'polar',
    }),
    aspect({
      id: 'h2h-no-polar',
      tabId: 'h2h',
      functionId: 'overall',
      label: 'No edge (polar)',
      detail: 'Neither side’s H2H record matches a polar edge grade.',
      needsFixtures: true,
      binary: true,
      pair: true,
      measure: 'h2h-say',
      token: 'no-polar',
    }),
    aspect({
      id: 'h2h-nika',
      tabId: 'h2h',
      functionId: 'overall',
      label: 'Nika nika',
      detail: "Anyone's game — no clear dominator.",
      needsFixtures: true,
      binary: true,
      pair: true,
      measure: 'h2h-say',
      token: 'nika',
    }),
    aspect({
      id: 'h2h-level',
      tabId: 'h2h',
      functionId: 'overall',
      label: 'Point difference is 0',
      detail: 'T1 and T2 are level on H2H points.',
      needsFixtures: true,
      binary: true,
      pair: true,
      measure: 'h2h-say',
      token: 'level',
    }),
    aspect({
      id: 'h2h-even',
      tabId: 'h2h',
      functionId: 'overall',
      label: 'Even in past meetings',
      detail: 'Even in past meetings.',
      needsFixtures: true,
      binary: true,
      pair: true,
      measure: 'h2h-say',
      token: 'even',
    }),
    aspect({
      id: 'h2h-home-edge',
      tabId: 'h2h',
      functionId: 'overall',
      label: 'Home edge in H2H',
      detail: 'Home edge in H2H.',
      needsFixtures: true,
      binary: true,
      pair: true,
      measure: 'h2h-say',
      token: 'home-edge',
    }),
    aspect({
      id: 'h2h-away-edge',
      tabId: 'h2h',
      functionId: 'overall',
      label: 'Away edge in H2H',
      detail: 'Away edge in H2H.',
      needsFixtures: true,
      binary: true,
      pair: true,
      measure: 'h2h-say',
      token: 'away-edge',
    }),
    h2h('overall', 'won', 'Won the meetings', 'Win share across every meeting.'),
    h2h('overall', 'shared', 'Shared the meetings', 'Draw share across every meeting.'),
    h2h('overall', 'lost', 'Lost the meetings', 'Loss share across every meeting.'),
    h2h('home', 'won', 'Won at home', 'Win share in meetings at home.'),
    h2h('home', 'shared', 'Drew at home', 'Draw share in meetings at home.'),
    h2h('home', 'lost', 'Lost at home', 'Loss share in meetings at home.'),
    h2h('away', 'won', 'Won away', 'Win share in meetings away.'),
    h2h('away', 'shared', 'Drew away', 'Draw share in meetings away.'),
    h2h('away', 'lost', 'Lost away', 'Loss share in meetings away.'),
    ...formChildAspects(),
    aspect({
      id: 'venue-balanced',
      tabId: 'home_away_strong',
      functionId: 'read',
      label: 'Balanced home and away',
      detail: 'Home and away point shares close to even. A 50/50 split is a full match.',
      measure: 'venue-balance',
      token: 'even',
    }),
    aspect({
      id: 'venue-unbeaten-home',
      tabId: 'home_away_strong',
      functionId: 'read',
      label: 'has never been beaten at home',
      detail: 'The home side has never been beaten at home.',
      needsFixtures: true,
      binary: true,
      pair: true,
      measure: 'venue-unbeaten',
      token: 'home',
    }),
    aspect({
      id: 'venue-unbeaten-away',
      tabId: 'home_away_strong',
      functionId: 'read',
      label: 'has never been beaten away',
      detail: 'The away side has never been beaten away.',
      needsFixtures: true,
      binary: true,
      pair: true,
      measure: 'venue-unbeaten',
      token: 'away',
    }),
    ...colourAspects(),
    aspect({
      id: 'ppg-aligns',
      tabId: 'colour_verification',
      functionId: 'ppg_colour',
      label: 'Aligns with the colour plan',
      detail: 'Aligns with the colour plan.',
      binary: true,
      measure: 'ppg-colour',
      token: 'aligns',
    }),
    ...(Object.keys(PPG_BAND_LABEL) as PpgBand[]).map((band) =>
      aspect({
        id: `ppg-band-${band}`,
        tabId: 'colour_verification',
        functionId: 'ppg_colour',
        label: PPG_BAND_LABEL[band],
        detail: PPG_BAND_LABEL[band],
        binary: true,
        measure: 'ppg-band',
        token: band,
      }),
    ),
    aspect({
      id: 'mshayi-high',
      tabId: 'colour_verification',
      functionId: 'ppg_colour',
      label: 'Bottom-third PPG is high (>1.5) — punching above the colour',
      detail: 'Bottom-third PPG is high (>1.5) — punching above the colour',
      binary: true,
      measure: 'mshayi',
      token: 'high',
    }),
    aspect({
      id: 'mshayi-weak',
      tabId: 'colour_verification',
      functionId: 'ppg_colour',
      label: 'Top-third PPG is weak (<0.8) — colour and PPG disagree',
      detail: 'Top-third PPG is weak (<0.8) — colour and PPG disagree',
      binary: true,
      measure: 'mshayi',
      token: 'weak',
    }),
    aspect({
      id: 'character-split',
      tabId: 'character',
      functionId: 'read',
      label: 'Split character',
      detail: 'Home PPG and away PPG differ by 0.50 or more — split character.',
      needsFixtures: true,
      binary: true,
      measure: 'character',
      token: 'split',
    }),
    aspect({
      id: 'character-even',
      tabId: 'character',
      functionId: 'read',
      label: 'Even home and away',
      detail: 'Home PPG and away PPG stay inside 0.50 of each other.',
      needsFixtures: true,
      binary: true,
      measure: 'character',
      token: 'even',
    }),
    aspect({
      id: 'middle-above-strong',
      tabId: 'middle_guys',
      functionId: 'read',
      label: 'Strong show vs sides above',
      detail: 'Strong show: takes points against sides above.',
      binary: true,
      needsFixtures: true,
      measure: 'middle',
      token: 'above-strong',
    }),
    aspect({
      id: 'middle-above-weak',
      tabId: 'middle_guys',
      functionId: 'read',
      label: 'Weak show vs sides above',
      detail: 'Weak show: soft against sides above.',
      binary: true,
      needsFixtures: true,
      measure: 'middle',
      token: 'above-weak',
    }),
    aspect({
      id: 'middle-below-strong',
      tabId: 'middle_guys',
      functionId: 'read',
      label: 'Strong show vs sides below',
      detail: 'Strong show: dominates sides below.',
      binary: true,
      needsFixtures: true,
      measure: 'middle',
      token: 'below-strong',
    }),
    aspect({
      id: 'middle-below-weak',
      tabId: 'middle_guys',
      functionId: 'read',
      label: 'Weak show vs sides below',
      detail: 'Weak show: drops points to sides below.',
      binary: true,
      needsFixtures: true,
      measure: 'middle',
      token: 'below-weak',
    }),
    aspect({
      id: 'bhozoma-above',
      tabId: 'bhozoma',
      functionId: 'read',
      label: 'Bhozoma',
      detail: 'Bhozoma — points taken against sides above.',
      binary: true,
      needsFixtures: true,
      measure: 'bhozoma',
      token: 'above',
    }),
    aspect({
      id: 'bhozoma-goliath',
      tabId: 'bhozoma',
      functionId: 'read',
      label: 'Goliath hero',
      detail: 'Goliath hero — a low share against sides above.',
      binary: true,
      needsFixtures: true,
      measure: 'bhozoma',
      token: 'goliath',
    }),
    aspect({
      id: 'bhozoma-umnqumi',
      tabId: 'bhozoma',
      functionId: 'read',
      label: 'Umnqumi wehlathi',
      detail: 'Umnqumi wehlathi — points taken against sides below.',
      binary: true,
      needsFixtures: true,
      measure: 'bhozoma',
      token: 'umnqumi',
    }),
    aspect({
      id: 'bhozoma-hlathi',
      tabId: 'bhozoma',
      functionId: 'read',
      label: 'Hlathi submissive',
      detail: 'Hlathi submissive — a low share against sides below.',
      binary: true,
      needsFixtures: true,
      measure: 'bhozoma',
      token: 'hlathi',
    }),
    ...LEVELS.map((level) =>
      aspect({
        id: `problem-${level.toLowerCase()}`,
        tabId: 'problem_causer',
        functionId: 'read',
        label: level,
        detail: level,
        binary: true,
        needsFixtures: true,
        measure: 'problem',
        token: level,
      }),
    ),
    ...(['A', 'B', 'C'] as const).map((grade) =>
      aspect({
        id: `imbangi-${grade.toLowerCase()}`,
        tabId: 'imbangi',
        functionId: 'read',
        label: `Grade ${grade}`,
        detail: `Imbangi grade ${grade}.`,
        binary: true,
        needsFixtures: true,
        measure: 'imbangi',
        token: grade,
      }),
    ),
    aspect({
      id: 'indlela-easy',
      tabId: 'indlela',
      functionId: 'read',
      label: 'EASY',
      detail: 'EASY — this opponent is weaker than the last opponent and the next one.',
      needsFixtures: true,
      binary: true,
      measure: 'indlela',
      token: 'easy',
    }),
    aspect({
      id: 'indlela-last-stronger',
      tabId: 'indlela',
      functionId: 'read',
      label: 'Last opponent stronger than this one?',
      detail: 'Last opponent stronger than this one?',
      needsFixtures: true,
      binary: true,
      measure: 'indlela',
      token: 'last',
    }),
    aspect({
      id: 'indlela-next-stronger',
      tabId: 'indlela',
      functionId: 'read',
      label: 'Next opponent stronger than this one?',
      detail: 'Next opponent stronger than this one?',
      needsFixtures: true,
      binary: true,
      measure: 'indlela',
      token: 'next',
    }),
    aspect({
      id: 'status-chase',
      tabId: 'competition_status',
      functionId: 'read',
      label: 'Chasing',
      detail: 'Competition status is a chase.',
      measure: 'motive',
      token: 'chase',
    }),
    aspect({
      id: 'status-escape',
      tabId: 'competition_status',
      functionId: 'read',
      label: 'Escaping',
      detail: 'Competition status is an escape.',
      measure: 'motive',
      token: 'escape',
    }),
    aspect({
      id: 'status-none',
      tabId: 'competition_status',
      functionId: 'read',
      label: 'Little to gain',
      detail: 'Little to gain.',
      binary: true,
      measure: 'motive',
      token: 'no_reward',
    }),
    aspect({
      id: 'status-a',
      tabId: 'competition_status',
      functionId: 'read',
      label: 'Grade A',
      detail: 'How close the competition status is to grade A.',
      measure: 'motive',
      token: 'grade-A',
    }),
    aspect({
      id: 'status-b',
      tabId: 'competition_status',
      functionId: 'read',
      label: 'Grade B',
      detail: 'How close the competition status is to grade B.',
      measure: 'motive',
      token: 'grade-B',
    }),
    aspect({
      id: 'status-dethroned',
      tabId: 'competition_status',
      functionId: 'read',
      label: 'Dethroned but still linked to the band',
      detail: 'Dethroned but still linked to the band.',
      binary: true,
      measure: 'motive',
      token: 'dethroned',
    }),
    aspect({
      id: 'status-late',
      tabId: 'competition_status',
      functionId: 'read',
      label: 'Late stretch',
      detail: 'About 10 games left, or the season is deep enough for the late stretch.',
      measure: 'late',
      token: 'late',
    }),
    aspect({
      id: 'never-lost',
      tabId: 'lost_twice',
      functionId: 'read',
      label: 'Never lost twice',
      detail: 'Never lost two matches in a row.',
      needsFixtures: true,
      binary: true,
      measure: 'twice',
      token: 'L:never',
    }),
    aspect({
      id: 'never-won',
      tabId: 'won_twice',
      functionId: 'read',
      label: 'Never won twice',
      detail: 'Never won two matches in a row.',
      needsFixtures: true,
      binary: true,
      measure: 'twice',
      token: 'W:never',
    }),
    aspect({
      id: 'won-6-current',
      tabId: 'won_6',
      functionId: 'read',
      label: 'Won 6 in a row',
      detail: 'A current run of six wins or more.',
      needsFixtures: true,
      binary: true,
      measure: 'streak',
      token: 'W',
    }),
    aspect({
      id: 'lost-6-current',
      tabId: 'lost_6',
      functionId: 'read',
      label: 'Lost 6 in a row',
      detail: 'A current run of six losses or more.',
      needsFixtures: true,
      binary: true,
      measure: 'streak',
      token: 'L',
    }),
    aspect({
      id: 'child-heavy',
      tabId: 'child_beater_2',
      functionId: 'read',
      label: 'Heavy win over a lower side',
      detail: 'A last-6 win by two goals or more against a side below.',
      needsFixtures: true,
      measure: 'child',
      token: 'method1',
    }),
    aspect({
      id: 'child-bottom',
      tabId: 'child_beater_2',
      functionId: 'read',
      label: 'Two heavy wins vs the bottom third',
      detail: 'Top or middle third, with two or more heavy wins against the bottom third in the last 6.',
      needsFixtures: true,
      measure: 'child',
      token: 'method2',
    }),
    aspect({
      id: 'swing-drop',
      tabId: 'sudden_drop',
      functionId: 'read',
      label: 'SUDDEN DROP',
      detail: 'SUDDEN DROP.',
      binary: true,
      needsFixtures: true,
      measure: 'swing',
      token: 'drop',
    }),
    aspect({
      id: 'swing-rise',
      tabId: 'sudden_pickup',
      functionId: 'read',
      label: 'SUDDEN PICK UP',
      detail: 'SUDDEN PICK UP.',
      binary: true,
      needsFixtures: true,
      measure: 'swing',
      token: 'rise',
    }),
    aspect({
      id: 'contested-pack',
      tabId: 'contested_leagues',
      functionId: 'read',
      label: 'In a contested top five',
      detail: 'Positions 1–5 are within 4 points, and this side is inside that pack.',
      measure: 'contested',
      token: 'pack',
    }),
    aspect({
      id: 'contested-open',
      tabId: 'contested_leagues',
      functionId: 'read',
      label: 'Open league',
      detail: 'The top five are more than 4 points apart. A wider spread is a stronger open-league match.',
      measure: 'contested',
      token: 'open',
    }),
    aspect({
      id: 'struggle-fight',
      tabId: 'struggle',
      functionId: 'read',
      label: 'Struggling and fighting',
      detail: 'Struggling, and something to fight for.',
      needsFixtures: true,
      binary: true,
      measure: 'struggle',
      token: 'fight',
    }),
    aspect({
      id: 'struggle-yes',
      tabId: 'struggle',
      functionId: 'read',
      label: 'Struggling',
      detail: 'Struggling across the last two or three games.',
      needsFixtures: true,
      binary: true,
      measure: 'struggle',
      token: 'yes',
    }),
  ];
}

function presentInOptions(items: MeasureAspect[]): MeasureAspect[] {
  const out: MeasureAspect[] = [];
  for (const item of items) {
    if (!item.binary) {
      out.push(item);
      continue;
    }
    out.push({ ...item, id: `${item.id}::tick`, mark: 'tick' });
    out.push({ ...item, id: `${item.id}::wrong`, mark: 'wrong' });
  }
  return out;
}

export function measureAspects(): MeasureAspect[] {
  return presentInOptions(rawMeasureAspects());
}

function fit(percent: number, reason: string): MeasureScore {
  return { percent: Math.max(0, Math.min(100, Math.round(percent))), reason };
}

function cached<T>(context: CallSearchContext | undefined, key: string, build: () => T): T {
  const cache = context?.cache;
  if (!cache) return build();
  const hit = cache.get(key);
  if (hit !== undefined) return hit as T;
  const value = build();
  cache.set(key, value);
  return value;
}

function matchesOf(context: CallSearchContext | undefined): SeasonMatch[] {
  return context?.matches ?? [];
}

function resultsFor(row: MeasureRow, table: MeasureRow[], matches: SeasonMatch[], venue?: 'home' | 'away') {
  return resultsFromSeasonMatches(row.teamId, matches, table, venue ? { venue } : {});
}

function neighbourOf(row: MeasureRow, table: MeasureRow[], context?: CallSearchContext): MeasureRow | null {
  if (context?.opponentId != null && context.opponentId !== row.teamId) {
    const opponent = table.find((item) => item.teamId === context.opponentId);
    if (opponent) return opponent;
  }
  const index = table.findIndex((item) => item.teamId === row.teamId);
  if (index < 0) return null;
  const candidates: MeasureRow[] = [];
  if (index > 0) candidates.push(table[index - 1]);
  if (index < table.length - 1) candidates.push(table[index + 1]);
  candidates.sort(
    (a, b) => Math.abs(a.points - row.points) - Math.abs(b.points - row.points) || a.rank - b.rank,
  );
  return candidates[0] ?? null;
}

function strongerThan(row: MeasureRow, other: MeasureRow): boolean | null {
  if (row.rank < other.rank) return true;
  if (row.rank > other.rank) return false;
  if (row.points > other.points) return true;
  if (row.points < other.points) return false;
  return null;
}

function pairGames(
  matches: SeasonMatch[],
  teamId: number,
  otherId: number,
  venue: 'overall' | 'home' | 'away',
): SeasonMatch[] {
  return matches.filter((match) => {
    const pair =
      (match.homeId === teamId && match.awayId === otherId) ||
      (match.homeId === otherId && match.awayId === teamId);
    if (!pair) return false;
    if (venue === 'home') return match.homeId === teamId;
    if (venue === 'away') return match.awayId === teamId;
    return true;
  });
}

function outcomeOn(match: SeasonMatch, teamId: number): ResultOutcome {
  const gf = match.homeId === teamId ? match.homeGoals : match.awayGoals;
  const ga = match.homeId === teamId ? match.awayGoals : match.homeGoals;
  if (gf > ga) return 'W';
  if (gf < ga) return 'L';
  return 'D';
}

function recentMeetings(matches: SeasonMatch[], teamId: number, otherId: number): SeasonMatch[] {
  return pairGames(matches, teamId, otherId, 'overall')
    .sort((a, b) => b.unix - a.unix)
    .slice(0, H2H_MEETINGS_LIMIT);
}

function recordOf(games: SeasonMatch[], teamId: number): { w: number; d: number; l: number; pts: number } {
  const outcomes = games.map((game) => outcomeOn(game, teamId));
  const w = outcomes.filter((outcome) => outcome === 'W').length;
  const d = outcomes.filter((outcome) => outcome === 'D').length;
  return { w, d, l: games.length - w - d, pts: pointsFromOutcomes(outcomes) };
}

function namedOption(points: number, draws: number): TrueOption {
  return trueOption(bandFromTablePoints(points), draws >= 3);
}

function pointsOf(results: { outcome: ResultOutcome }[]): number {
  return results.reduce((sum, result) => sum + (result.outcome === 'W' ? 3 : result.outcome === 'D' ? 1 : 0), 0);
}

function rateOf(results: { outcome: ResultOutcome }[]): number | null {
  if (results.length === 0) return null;
  return pointsOf(results) / results.length;
}

function share(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return (part / whole) * 100;
}

function motivationFor(row: MeasureRow, table: MeasureRow[], context: CallSearchContext | undefined) {
  return cached(context, `mot:${row.teamId}`, () => evaluateTeamMotivation(row.teamId, table));
}

function scoreMotive(row: MeasureRow, table: MeasureRow[], token: string, context: CallSearchContext | undefined): MeasureScore | null {
  const mot = motivationFor(row, table, context);
  if (!mot) return null;
  if (token === 'dethroned') {
    return fit(mot.dethroned ? 100 : 0, mot.dethroned ? 'Dethroned, still linked' : mot.stanceReason);
  }
  if (token === 'win-climbs') {
    const climbs = mot.rankAfterWin != null && mot.rankAfterWin < mot.rank;
    return fit(climbs ? 100 : 0, climbs ? `A win moves them to #${mot.rankAfterWin}` : mot.stanceReason);
  }
  if (token.startsWith('outcome:')) {
    const key = token.slice('outcome:'.length) as MotivationOutcome;
    const on = mot.outcomes.includes(key);
    return fit(on ? 100 : 0, mot.reasons[0] ?? mot.stanceReason);
  }
  if (token === 'grade-A' || token === 'grade-B' || token === 'grade-none') {
    const target: MotivationGrade = token === 'grade-A' ? 'A' : token === 'grade-B' ? 'B' : 'none';
    const word = target === 'A' ? 'Strong need' : target === 'B' ? 'Some need' : 'No special need';
    return fit(mot.grade === target ? 100 : 0, `${word} · ${mot.stanceReason}`);
  }
  if (token === 'futile') {
    return fit(mot.futileChase ? 100 : 0, mot.futileChase ? 'Futile chase — remaining matches cannot close it' : mot.stanceReason);
  }
  const stance = token as TeamStance;
  return fit(mot.stance === stance ? 100 : 0, mot.stanceReason);
}

function formSample(
  row: MeasureRow,
  table: MeasureRow[],
  group: string,
  matches: SeasonMatch[],
): { ppg: number; colour: TableColour } | null {
  const colour = colourFromZone(row.zone);
  if (!colour) return null;
  if (group === 'table') {
    if (row.played <= 0) return null;
    return { ppg: row.points / row.played, colour };
  }
  const period = group === '1h' || group === '2h' ? group : 'ft';
  const results = resultsFromSeasonMatches(row.teamId, matches, table, { period });
  if (results.length === 0) return null;
  return { ppg: pointsOf(results) / results.length, colour };
}

function bandFit(actual: FormChildBand, target: FormChildBand): number {
  const order: FormChildBand[] = ['bad', 'mild', 'good', 'great'];
  const distance = Math.abs(order.indexOf(actual) - order.indexOf(target));
  return (1 - distance / (order.length - 1)) * 100;
}

function nextFixture(row: MeasureRow, schedule: ImbangiScheduleMatch[]): ImbangiScheduleMatch | null {
  const games = schedule
    .filter((match) => !match.finished && (match.homeId === row.teamId || match.awayId === row.teamId))
    .sort((a, b) => a.unix - b.unix);
  return games[0] ?? null;
}

function indlelaFor(
  row: MeasureRow,
  table: MeasureRow[],
  context: CallSearchContext | undefined,
): IndlelaPath | null {
  const fixture = context?.fixture;
  return cached(context, `indlela:${row.teamId}:${fixture?.unix ?? 0}`, () => {
    const schedule = context?.schedule ?? [];
    const current =
      fixture && (fixture.homeId === row.teamId || fixture.awayId === row.teamId)
        ? { homeId: fixture.homeId, awayId: fixture.awayId, unix: fixture.unix, finished: false, homeGoals: null, awayGoals: null }
        : nextFixture(row, schedule);
    if (!current) return null;
    const listed = schedule.some(
      (match) => match.homeId === current.homeId && match.awayId === current.awayId && match.unix === current.unix,
    );
    return indlelaPath({
      teamId: row.teamId,
      homeId: current.homeId,
      awayId: current.awayId,
      kickoffUnix: current.unix,
      schedule: listed ? schedule : [...schedule, current],
      table,
    });
  });
}

function toH2H(games: SeasonMatch[], table: MeasureRow[]): H2HMatch[] {
  const names = new Map(table.map((row) => [row.teamId, row.name]));
  return games.map((match) => ({
    id: match.unix,
    home_name: names.get(match.homeId) ?? '',
    away_name: names.get(match.awayId) ?? '',
    home_goals: match.homeGoals,
    away_goals: match.awayGoals,
    ht_score: null,
    total_goals: match.homeGoals + match.awayGoals,
    btts: match.homeGoals > 0 && match.awayGoals > 0,
    date: String(match.unix),
  }));
}

function yesNo(on: boolean | null, yes: string, no: string): MeasureScore | null {
  if (on == null) return null;
  return fit(on ? 100 : 0, on ? yes : no);
}

export function scoreMeasure(
  item: MeasureAspect,
  row: MeasureRow,
  table: MeasureRow[],
  context?: CallSearchContext,
): MeasureScore | null {
  const matches = matchesOf(context);
  const { measure, token } = item;

  if (measure === 'compliant') {
    const other = neighbourOf(row, table, context);
    if (!other) return null;
    const stronger = strongerThan(row, other);
    const percent = stronger == null ? 50 : stronger ? 100 : 0;
    const reason =
      stronger == null ? `Level with ${other.name}` : stronger ? `Above ${other.name}` : `Below ${other.name}`;
    return fit(percent, reason);
  }

  if (measure === 'stream-h2h') {
    const other = neighbourOf(row, table, context);
    if (!other) return null;
    const games = pairGames(matches, row.teamId, other.teamId, 'overall');
    const wins = games.filter((match) => outcomeOn(match, row.teamId) === 'W').length;
    const stronger = strongerThan(row, other);
    if (token === 'none') {
      return fit(games.length === 0 ? 100 : 0, games.length === 0 ? `No meeting with ${other.name}` : `${games.length} meetings with ${other.name}`);
    }
    if (stronger !== true) return fit(0, `Not the stronger side against ${other.name}`);
    if (token === 'never') {
      if (games.length === 0) return fit(0, `No meeting with ${other.name}`);
      return fit(wins === 0 ? 100 : 0, wins === 0 ? `No win against ${other.name} in ${games.length}` : `${wins} win${wins === 1 ? '' : 's'} against ${other.name}`);
    }
    return fit(wins > 0 ? 100 : 0, wins > 0 ? `${wins} win${wins === 1 ? '' : 's'} against ${other.name}` : `No win against ${other.name}`);
  }

  if (measure === 'motive') return scoreMotive(row, table, token, context);

  if (measure === 'late') {
    const info = cached(context, 'late', () => leagueProgressInfo(table, null));
    return fit(info.lateStretch ? 100 : 0, info.note);
  }

  if (measure === 'ppg-colour') {
    const colour = colourFromZone(row.zone);
    const rate = row.played > 0 ? row.points / row.played : null;
    if (!colour || rate == null) return null;
    const aligns = ppgAlignsWithColour(rate, colour);
    const band = ppgBandForColour(rate, colour);
    const reason = `${band.replace(/_/g, ' ')} · ${rate.toFixed(2)} PPG`;
    return fit(token === 'aligns' ? (aligns ? 100 : 0) : aligns ? 0 : 100, reason);
  }

  if (measure === 'venue-balance') {
    const sum = row.homePoints + row.awayPoints;
    if (sum <= 0) return null;
    const homeShare = (row.homePoints / sum) * 100;
    return fit(100 - Math.abs(homeShare - 50) * 2, `${Math.round(homeShare)}% of split points at home`);
  }

  if (measure === 'contested') {
    const board = cached(context, 'contested', () => contestedLeagueBoard(table));
    if (token === 'pack') {
      if (!board.active) return fit(0, board.detail);
      return fit(row.rank <= 5 ? 100 : 30, board.detail);
    }
    if (board.active || board.spread == null) return fit(board.active ? 0 : 0, board.detail);
    return fit(Math.min(100, (board.spread / 15) * 100), board.detail);
  }

  if (matches.length === 0 && item.needsFixtures) return null;
  const results = resultsFor(row, table, matches);

  if (measure === 'initial') {
    const form = analyseTeamLast6(row.teamId, results, LAST5_WINDOW);
    if (!form || form.mp === 0) return null;
    const hits = form.sequence.filter((outcome) => statusFromOutcome(outcome) === token).length;
    return fit(share(hits, form.mp), `${hits} of ${form.mp} last-5 games are ${token}`);
  }

  if (measure === 'last5-rank') {
    const league = cached(context, 'last5', () => last5FormLeagueTable(table, matches));
    const found = league.find((item) => item.teamId === row.teamId);
    if (!found || league.length === 0) return null;
    const span = Math.max(1, league.length - 1);
    const fromTop = (1 - (found.formRank - 1) / span) * 100;
    const percent = token === 'best' ? fromTop : 100 - fromTop;
    return fit(percent, `Last 5 rank ${found.formRank} · ${found.form.points} pts`);
  }

  if (measure === 'matchup') {
    const other = neighbourOf(row, table, context);
    if (!other) return null;
    const mine = analyseTeamLast6(row.teamId, results, LAST5_WINDOW);
    const theirs = analyseTeamLast6(other.teamId, resultsFor(other, table, matches), LAST5_WINDOW);
    if (!mine || !theirs) return null;
    const diff = mine.points - theirs.points;
    const gap = token === 'ahead' ? diff : -diff;
    return fit(gap <= 0 ? 0 : Math.min(100, (gap / LAST6_SPLIT_PTS) * 100), `${mine.points} pts vs ${theirs.points} for ${other.name}`);
  }

  if (measure === 'venue-form') {
    const home = analyseTeamLast6(row.teamId, resultsFor(row, table, matches, 'home'), LAST5_WINDOW);
    const away = analyseTeamLast6(row.teamId, resultsFor(row, table, matches, 'away'), LAST5_WINDOW);
    const homePts = home?.points ?? 0;
    const awayPts = away?.points ?? 0;
    if (homePts + awayPts <= 0) return null;
    const percent = token === 'home' ? share(homePts, homePts + awayPts) : share(awayPts, homePts + awayPts);
    return fit(percent, `${homePts} home pts · ${awayPts} away pts in the last 5`);
  }

  if (measure === 'margin') {
    const recent = results.slice(0, LAST5_WINDOW);
    if (recent.length === 0) return null;
    const hits = recent.filter((result) =>
      token === 'win' ? result.outcome === 'W' && result.goalDiff >= 2 : result.outcome === 'L' && result.goalDiff <= -2,
    ).length;
    return fit(Math.min(100, (hits / 2) * 100), `${hits} in the last ${recent.length}`);
  }

  if (measure === 'two-goal' || measure === 'label-change') {
    const other = neighbourOf(row, table, context);
    if (!other) return null;
    if (measure === 'two-goal') {
      const sides = twoGoalBandSides({
        t1Id: row.teamId,
        t2Id: other.teamId,
        t1Label: row.name,
        t2Label: other.name,
        t1Results: results,
        t2Results: resultsFor(other, table, matches),
        standings: table,
        mode: 'overall',
      });
      const games = sides.left?.games ?? [];
      if (games.length === 0) return null;
      const hits = games.filter((game) => game.grade === token).length;
      const label = GRADES.find((grade) => grade.id === token)?.label ?? token;
      return fit(hits > 0 ? 100 : 0, hits > 0 ? `${hits} of ${games.length} · ${label}` : label);
    }
    const sides = last5LabelChanges({
      t1Id: row.teamId,
      t2Id: other.teamId,
      t1Label: row.name,
      t2Label: other.name,
      t1Results: results,
      t2Results: resultsFor(other, table, matches),
      standings: table,
      mode: 'overall',
    });
    const side = sides.left;
    if (!side) return null;
    const called =
      token === 'weakness' ? 'Negative change' : token === 'strength' ? 'Positive change' : side.hierarchy.title;
    if (side.hierarchy.kind !== token) return fit(0, called);
    return fit(100, `${called} · ${side.hierarchy.code}`);
  }

  if (measure === 'death-trap') {
    if (results.length === 0) return null;
    const [series, trend] = token.split(':');
    const side = deathTrapSide({
      teamId: row.teamId,
      label: row.name,
      results,
      venue: 'overall',
      period: 'ft',
    });
    const call =
      series === 'losses' ? side.losses : series === 'wins' ? side.wins : series === 'scoring' ? side.scoring : series === 'conceding' ? side.conceding : null;
    if (!call || !trend) return null;
    return fit(call.trend === trend ? 100 : 0, call.label);
  }

  if (measure === 'reverse') {
    const report = cached(context, `reverse:${row.teamId}`, () =>
      reverseEngineer({
        t1Id: row.teamId,
        t2Id: null,
        t1Label: row.name,
        t2Label: '',
        matches,
        names: new Map(table.map((item) => [item.teamId, item.name])),
      }),
    );
    if (token === 'missed') {
      if (report.checked === 0) return null;
      return fit(share(report.missedByLast5, report.checked), `${report.missedByLast5} of ${report.checked} missed by the last 5`);
    }
    const rate = token === 'prior' ? report.t1?.prior : report.t1?.last5;
    if (rate?.accuracy == null) return null;
    return fit(rate.accuracy * 100, `${rate.hits} of ${rate.scored} called`);
  }

  if (measure === 'form-band' || measure === 'form-trend') {
    const form = analyseTeamLast6(row.teamId, results, LAST6_WINDOW);
    if (!form) return null;
    if (measure === 'form-band') {
      const label = LAST6_BAND_LABEL[form.band];
      return fit(form.band === token ? 100 : 0, label);
    }
    const label = LAST6_TREND_SHORT[form.trend];
    return fit(form.trend === token ? 100 : 0, label);
  }

  if (measure === 'h2h') {
    const other = neighbourOf(row, table, context);
    if (!other) return null;
    const venue = item.functionId === 'home' || item.functionId === 'away' ? item.functionId : 'overall';
    const games = pairGames(matches, row.teamId, other.teamId, venue);
    if (games.length === 0) return null;
    const wins = games.filter((match) => outcomeOn(match, row.teamId) === 'W').length;
    const draws = games.filter((match) => outcomeOn(match, row.teamId) === 'D').length;
    const losses = games.length - wins - draws;
    const part = token === 'won' ? wins : token === 'shared' ? draws : losses;
    return fit(share(part, games.length), `${wins}-${draws}-${losses} vs ${other.name}`);
  }

  if (measure === 'form-child') {
    const sample = formSample(row, table, item.functionId, matches);
    if (!sample) return null;
    if (token === 'child') {
      const note = umshayiWezingane(sample.ppg, sample.colour);
      return fit(isRedChildBeater(sample.ppg, sample.colour) ? 100 : 0, note ?? `${sample.ppg.toFixed(2)} PPG`);
    }
    const band = formChildBand(sample.ppg, sample.colour);
    return fit(bandFit(band, token as FormChildBand), `${band} · ${sample.ppg.toFixed(2)} PPG`);
  }

  if (measure === 'colour-verify') {
    const split = token.indexOf('|');
    const direction = token.slice(0, split) as ColourDirection;
    const stat = colourStatById(token.slice(split + 1));
    if (!stat) return null;
    const period = stat.periods.includes('ft') ? 'ft' : stat.periods[0];
    const rates = ratesAgainstColours(row.teamId, stat, table, matches, direction, 'overall', period);
    const passing = rates.filter((rate) => rate.position != null && passesColourPosition(rate.position, direction));
    if (passing.length === 0) {
      return fit(0, 'No successful colour position');
    }
    const best = Math.min(...passing.map((rate) => rate.position ?? 99));
    const perfect = direction === 'strong' ? best === 1 : best === 2;
    const names = passing.map((rate) => rate.colour).join(', ');
    return fit(perfect ? 100 : 80, `Position ${best} vs ${names}`);
  }

  if (measure === 'character') {
    const home = results.filter((result) => result.isHome);
    const away = results.filter((result) => !result.isHome);
    const homeRate = rateOf(home);
    const awayRate = rateOf(away);
    if (homeRate == null || awayRate == null) return null;
    const gap = Math.abs(homeRate - awayRate);
    const split = gap >= 0.5;
    const reason = `Home ${homeRate.toFixed(2)} · away ${awayRate.toFixed(2)}${split ? ' — split character' : ''}`;
    return fit(token === 'split' ? (split ? 100 : 0) : split ? 0 : 100, reason);
  }

  if (measure === 'middle') {
    if (row.zone !== 'mid') return fit(0, 'Not in the middle third');
    const above = results.filter((result) => result.opponentAbove === true);
    const below = results.filter((result) => result.opponentAbove === false);
    const abovePct = above.length === 0 ? null : share(pointsOf(above), above.length * 3);
    const belowPct = below.length === 0 ? null : share(pointsOf(below), below.length * 3);
    if (token.startsWith('above')) {
      if (abovePct == null) return null;
      const on = token === 'above-strong' ? abovePct >= 50 : abovePct < 30;
      const word = token === 'above-strong' ? 'Strong show' : 'Weak show';
      return fit(on ? 100 : 0, `${word}: ${Math.round(abovePct)}% vs sides above`);
    }
    if (belowPct == null) return null;
    const on = token === 'below-strong' ? belowPct >= 75 : belowPct < 45;
    const word = token === 'below-strong' ? 'Strong show' : 'Weak show';
    return fit(on ? 100 : 0, `${word}: ${Math.round(belowPct)}% vs sides below`);
  }

  if (measure === 'bhozoma') {
    const built = cached(context, 'bhozoma', () => buildBhozomaTable(table, matches));
    const found = built.rows.find((item) => item.teamId === row.teamId);
    if (!found) return null;
    const side = token === 'above' || token === 'goliath' ? found.above : found.below;
    if (side.mp === 0 || side.pctAttained == null) return null;
    const called =
      token === 'above' || token === 'goliath'
        ? side.pctAttained < BHOZOMA_ABOVE_PCT
          ? 'goliath'
          : 'above'
        : side.pctAttained > UMNQUMI_BELOW_PCT
          ? 'umnqumi'
          : 'hlathi';
    return fit(called === token ? 100 : 0, side.label ?? `${Math.round(side.pctAttained)}%`);
  }

  if (measure === 'problem') {
    const other = neighbourOf(row, table, context);
    if (!other) return null;
    const games = pairGames(matches, row.teamId, other.teamId, 'overall');
    if (games.length === 0) return null;
    const read = evaluateProblemCauser({
      matches: toH2H(games, table),
      t1Name: row.name,
      t2Name: other.name,
    });
    const name = read.t1.level.name;
    return fit(name === (token as ProblemLevelName) ? 100 : 0, `${name} vs ${other.name}`);
  }

  if (measure === 'imbangi') {
    const built = cached(context, 'imbangi', () => buildImbangiTable(table, matches, null, context?.schedule ?? []));
    const rows = built.rows.filter((item) => item.teamId === row.teamId && item.grade != null);
    const grade = token as ImbangiGrade;
    const hit = rows.some((item) => item.grade === grade);
    const reason = rows[0]?.gradeReason ?? 'More than 4 points from both neighbours';
    return fit(hit ? 100 : 0, reason);
  }

  if (measure === 'indlela') {
    const path = indlelaFor(row, table, context);
    if (!path) return null;
    if (token === 'easy') return yesNo(path.easy, path.call, path.call);
    if (token === 'hard') return yesNo(path.easy == null ? null : !path.easy, path.call, path.call);
    if (token === 'last') return yesNo(path.secondStronger, 'Last opponent is stronger', path.call);
    return yesNo(path.fourthStronger, 'Next opponent is stronger', path.call);
  }

  if (measure === 'twice') {
    if (results.length < 2) return null;
    const [outcome, mode] = token.split(':') as [ResultOutcome, string];
    const clear = neverTwiceInRow(results, outcome);
    const on = mode === 'never' ? clear : !clear;
    const word = outcome === 'L' ? 'losses' : 'wins';
    return fit(on ? 100 : 0, on ? `No two ${word} in a row` : `Two ${word} in a row`);
  }

  if (measure === 'streak') {
    const outcome = token as ResultOutcome;
    const run = currentStreak(results, outcome);
    const word = outcome === 'W' ? 'wins' : 'losses';
    return fit(run >= 6 ? 100 : 0, `${run} ${word} in a row`);
  }

  if (measure === 'child') {
    const recent = results.slice(0, 6);
    if (token === 'method1') {
      const thrash = recent.find((result) => result.outcome === 'W' && result.goalDiff >= 2 && result.opponentAbove === false);
      return fit(thrash ? 100 : 0, thrash ? `${thrash.gf}-${thrash.ga} vs ${thrash.opponentName}` : 'No heavy win over a lower side');
    }
    const heavy = recent.filter(
      (result) =>
        result.outcome === 'W' &&
        result.goalDiff >= 2 &&
        result.opponentRank != null &&
        bandOf(result.opponentRank, table.length) === 'red',
    ).length;
    const eligible = row.zone === 'top' || row.zone === 'mid';
    return fit(!eligible ? 0 : Math.min(100, (heavy / 2) * 100), eligible ? `${heavy} heavy wins vs the bottom third` : 'Bottom third');
  }

  if (measure === 'swing') {
    const swing = ppgSwing(results);
    if (swing.recentPpg == null || swing.priorPpg == null) return null;
    const gap = token === 'drop' ? swing.priorPpg - swing.recentPpg : swing.recentPpg - swing.priorPpg;
    const word = token === 'drop' ? 'SUDDEN DROP' : 'SUDDEN PICK UP';
    return fit(gap >= 0.75 ? 100 : 0, gap >= 0.75 ? word : swing.detail);
  }

  if (measure === 'struggle') {
    const last3 = results.slice(0, 3);
    if (last3.length < 2) return null;
    const losses = last3.filter((result) => result.outcome === 'L').length;
    const active = losses >= 2 || last3.every((result) => result.outcome !== 'W');
    const mot = motivationFor(row, table, context);
    const fight = active && !!mot && (mot.stance === 'chase' || mot.stance === 'escape') && mot.grade !== 'none';
    const seq = last3.map((result) => result.outcome).join(' ');
    if (token === 'fight') return fit(fight ? 100 : 0, fight ? `Struggling (${seq}) and fighting` : `Last 3: ${seq}`);
    if (token === 'yes') return fit(active ? 100 : 0, active ? `Struggling (${seq})` : `Last 3: ${seq}`);
    return fit(active ? 0 : 100, active ? `Struggling (${seq})` : `Last 3: ${seq}`);
  }

  if (measure === 'naming') {
    const last6 = token.startsWith('l6:');
    const key = last6 ? token.slice(3) : token;
    const form = analyseTeamLast6(row.teamId, results, last6 ? LAST6_WINDOW : LAST5_WINDOW);
    if (!form || form.mp === 0) return null;
    if (key === 'inhla') {
      const line = last6 ? 'Inhlambuluko — 3+ draws in the last 6' : 'Inhlambuluko — 3+ draws in the last 5';
      return fit(form.drawn >= 3 ? 100 : 0, form.drawn >= 3 ? line : `${form.drawn} draws`);
    }
    const option = namedOption(form.points, form.drawn);
    return fit(option === key ? 100 : 0, `${OPTION_LABEL[option]} · ${form.points} pts`);
  }

  if (measure === 'l5-change') {
    const team = analyseTeamLast5(row.teamId, results);
    if (!team) return null;
    return fit(team.change === token ? 100 : 0, CHANGE_LABEL[team.change]);
  }

  if (measure === 'ukulumbana') {
    const other = neighbourOf(row, table, context);
    if (!other) return null;
    const last6 = token.startsWith('l6:');
    const wanted = Number(last6 ? token.slice(3) : token);
    const window = last6 ? LAST6_WINDOW : LAST5_WINDOW;
    const mine = analyseTeamLast6(row.teamId, results, window);
    const theirs = analyseTeamLast6(other.teamId, resultsFor(other, table, matches), window);
    if (!mine || !theirs || mine.mp === 0 || theirs.mp === 0) return null;
    const hit = findUkulumbana(namedOption(mine.points, mine.drawn), namedOption(theirs.points, theirs.drawn));
    return fit(hit?.id === wanted ? 100 : 0, hit?.label ?? 'No pairing');
  }

  if (measure === 'h2h-say') {
    const other = neighbourOf(row, table, context);
    if (!other) return null;
    const games = recentMeetings(matches, row.teamId, other.teamId);
    if (games.length === 0) return null;
    const t1 = recordOf(games, row.teamId);
    const t2 = recordOf(games, other.teamId);
    const shareDiff = Math.abs(t1.pts - t2.pts);
    const greaterIsT1 = t1.pts >= t2.pts;
    const greater = greaterIsT1 ? t1 : t2;
    const polar = polarEdgeGrade(games.length, greater.w, greater.d, greater.l) != null;
    const nika =
      isNikaNikaRecord(games.length, t1.w, t1.d, t1.l) || isNikaNikaRecord(games.length, t2.w, t2.d, t2.l);
    const fixture = context?.fixture;
    const homeId = fixture?.homeId ?? row.teamId;
    const awayId = fixture?.awayId ?? other.teamId;
    const homePts = recordOf(games, homeId).pts;
    const awayPts = recordOf(games, awayId).pts;
    const even = shareDiff <= 3;
    if (token === 'polar') return fit(greaterIsT1 && polar ? 100 : 0, greaterIsT1 && polar ? 'T1 edge (polar)' : polar ? 'T2 edge (polar)' : 'No edge (polar)');
    if (token === 'no-polar') return fit(polar ? 0 : 100, polar ? `${greaterIsT1 ? 'T1' : 'T2'} edge (polar)` : 'No edge (polar)');
    if (token === 'nika') return fit(nika ? 100 : 0, nika ? 'Nika nika' : 'Not nika nika');
    if (token === 'level') return fit(shareDiff === 0 ? 100 : 0, shareDiff === 0 ? 'Point difference is 0' : `${t1.pts}–${t2.pts}`);
    if (token === 'even') return fit(even ? 100 : 0, even ? 'Even in past meetings' : `${t1.pts}–${t2.pts}`);
    if (token === 'home-edge') return fit(!even && homePts > awayPts ? 100 : 0, !even && homePts > awayPts ? 'Home edge in H2H' : `${homePts}–${awayPts}`);
    return fit(!even && awayPts > homePts ? 100 : 0, !even && awayPts > homePts ? 'Away edge in H2H' : `${homePts}–${awayPts}`);
  }

  if (measure === 'venue-unbeaten') {
    const fixture = context?.fixture;
    if (!fixture) return null;
    const sideId = token === 'home' ? fixture.homeId : fixture.awayId;
    const games = recentMeetings(matches, fixture.homeId, fixture.awayId).filter((game) =>
      token === 'home' ? game.homeId === sideId : game.awayId === sideId,
    );
    const place = token === 'home' ? 'at home' : 'away';
    if (games.length === 0) return fit(0, `No ${token} H2H in the last 5`);
    const losses = games.filter((game) => outcomeOn(game, sideId) === 'L').length;
    return fit(losses === 0 ? 100 : 0, losses === 0 ? `has never been beaten ${place}` : `has been beaten ${place}`);
  }

  if (measure === 'lens') {
    const fixture = context?.fixture;
    if (!fixture) return null;
    const home = table.find((item) => item.teamId === fixture.homeId);
    const away = table.find((item) => item.teamId === fixture.awayId);
    if (!home || !away) return null;
    const lenses = compareLenses(resultsFor(home, table, matches), resultsFor(away, table, matches));
    const lens = lenses.find((item) => item.id === token);
    if (!lens) return null;
    const word = lens.sameStrength ? 'same strength' : 'split';
    return fit(lens.sameStrength ? 100 : 0, `${lens.label} · ${word}`);
  }

  if (measure === 'ppg-band') {
    const colour = colourFromZone(row.zone);
    const rate = row.played > 0 ? row.points / row.played : null;
    if (!colour || rate == null) return null;
    const band = ppgBandForColour(rate, colour);
    return fit(band === token ? 100 : 0, PPG_BAND_LABEL[band]);
  }

  if (measure === 'mshayi') {
    const colour = colourFromZone(row.zone);
    const rate = row.played > 0 ? row.points / row.played : null;
    if (!colour || rate == null) return null;
    const note = mshayiNote(rate, colour);
    const wanted =
      token === 'high'
        ? 'Bottom-third PPG is high (>1.5) — punching above the colour'
        : 'Top-third PPG is weak (<0.8) — colour and PPG disagree';
    return fit(note === wanted ? 100 : 0, note ?? wanted);
  }

  if (measure === 'death-reading') {
    if (results.length === 0) return null;
    const side = deathTrapSide({ teamId: row.teamId, label: row.name, results, venue: 'overall', period: 'ft' });
    const readings = [side.losses.reading, side.wins.reading].filter((reading): reading is string => reading != null);
    const wanted = token === 'stronger' ? 'Getting stronger' : 'Getting weaker';
    return fit(readings.includes(wanted) ? 100 : 0, readings.length > 0 ? readings.join(' · ') : wanted);
  }

  return null;
}
