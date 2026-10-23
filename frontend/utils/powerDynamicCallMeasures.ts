/**
 * League-wide aspects for every power-dynamic read.
 * A pair is this side and the nearest side on the same table.
 * Season reads use that league's finished matches.
 */
import type { H2HMatch } from '@/services/oddAlerts';
import type { SeasonMatch } from '@/utils/bhozomaEngine';
import { BHOZOMA_MIN_MP, buildBhozomaTable } from '@/utils/bhozomaEngine';
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
import { bandOf } from '@/utils/leagueTables';
import { statusFromOutcome } from '@/utils/last5Analysis';
import { last5LabelChanges, twoGoalBandSides, type TwoGoalGrade } from '@/utils/last5Sections';
import {
  LAST5_WINDOW,
  LAST6_SPLIT_PTS,
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
  ppgAlignsWithColour,
  ppgBandForColour,
  ppgSwing,
  type IndlelaPath,
  type TableColour,
} from '@/utils/powerDynamicsEngine';
import { evaluateProblemCauser, type ProblemLevelName } from '@/utils/problemCauser';
import { reverseEngineer } from '@/utils/reverseEngineering';
import type { ResultOutcome } from '@/utils/teamResults';

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
};

export type MeasureScore = { percent: number; reason: string };

export type CallSearchContext = {
  matches?: SeasonMatch[];
  schedule?: ImbangiScheduleMatch[];
  cache?: Map<string, unknown>;
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

function deathAspects(): MeasureAspect[] {
  const out: MeasureAspect[] = [];
  for (const series of DEATH_SERIES) {
    for (const trend of DEATH_TRENDS) {
      out.push(
        aspect({
          id: `death-${series.id}-${trend.id}`,
          tabId: 'last5',
          functionId: 'death_trap',
          label: `${series.label} · ${trend.label}`,
          detail: `Overall full time, last 5. ${series.label} ${trend.label.toLowerCase()}.`,
          needsFixtures: true,
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
  { id: 'mediocre_positive', label: 'Mediocre, still a fight' },
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

export function measureAspects(): MeasureAspect[] {
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
      label: 'Never beaten the next side',
      detail: `Stronger side, and they have met without this side winning. ${PAIR} ${SEASON}`,
      needsFixtures: true,
      measure: 'stream-h2h',
      token: 'never',
    }),
    aspect({
      id: 'bookie-did-beat',
      tabId: 'baseline',
      functionId: 'bookie',
      label: 'Has beaten the next side',
      detail: `Stronger side, and they have a win in the meetings. ${PAIR} ${SEASON}`,
      needsFixtures: true,
      measure: 'stream-h2h',
      token: 'beat',
    }),
    aspect({
      id: 'bookie2-no-meetings',
      tabId: 'baseline',
      functionId: 'bookie2',
      label: 'No meetings with the next side',
      detail: `No finished meeting with the nearest side. ${PAIR}`,
      needsFixtures: true,
      measure: 'stream-h2h',
      token: 'none',
    }),
    aspect({
      id: 'motive-chase',
      tabId: 'importance_3pts',
      functionId: 'read',
      label: 'Chasing',
      detail: 'The three points pull this side up the table.',
      measure: 'motive',
      token: 'chase',
    }),
    aspect({
      id: 'motive-escape',
      tabId: 'importance_3pts',
      functionId: 'read',
      label: 'Escaping',
      detail: 'The three points are about getting out of trouble.',
      measure: 'motive',
      token: 'escape',
    }),
    aspect({
      id: 'motive-none',
      tabId: 'importance_3pts',
      functionId: 'read',
      label: 'Nothing on the line',
      detail: 'No chase and no escape from the table.',
      measure: 'motive',
      token: 'no_reward',
    }),
    aspect({
      id: 'motive-grade-a',
      tabId: 'importance_3pts',
      functionId: 'read',
      label: 'Grade A',
      detail: 'How close the three points are to a grade A need.',
      measure: 'motive',
      token: 'grade-A',
    }),
    aspect({
      id: 'motive-grade-b',
      tabId: 'importance_3pts',
      functionId: 'read',
      label: 'Grade B',
      detail: 'How close the three points are to a grade B need.',
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
    ...MOTIVATION_OUTCOMES.map((item) =>
      aspect({
        id: `motive-${item.id}`,
        tabId: 'importance_3pts',
        functionId: 'read',
        label: item.label,
        detail: `The three-point read is “${item.label}”.`,
        measure: 'motive',
        token: `outcome:${item.id}`,
      }),
    ),
    aspect({
      id: 'last5-good',
      tabId: 'last5',
      functionId: 'initial_state',
      label: 'Good',
      detail: 'Share of the last 5 that Section 1 calls Good.',
      needsFixtures: true,
      measure: 'initial',
      token: 'Good',
    }),
    aspect({
      id: 'last5-med',
      tabId: 'last5',
      functionId: 'initial_state',
      label: 'Med',
      detail: 'Share of the last 5 that Section 1 calls Med.',
      needsFixtures: true,
      measure: 'initial',
      token: 'Med',
    }),
    aspect({
      id: 'last5-bad',
      tabId: 'last5',
      functionId: 'initial_state',
      label: 'Bad',
      detail: 'Share of the last 5 that Section 1 calls Bad.',
      needsFixtures: true,
      measure: 'initial',
      token: 'Bad',
    }),
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
        detail: `Share of the overall last 5 the colour-band sheet calls ${grade.label}. ${PAIR}`,
        needsFixtures: true,
        measure: 'two-goal',
        token: grade.id,
      }),
    ),
    aspect({
      id: 'label-strength',
      tabId: 'last5',
      functionId: 'label_change',
      label: 'Hidden strength',
      detail: `Positive label changes in the last 5. Place 1 is the strongest match. ${PAIR}`,
      needsFixtures: true,
      measure: 'label-change',
      token: 'strength',
    }),
    aspect({
      id: 'label-weakness',
      tabId: 'last5',
      functionId: 'label_change',
      label: 'Hidden weakness',
      detail: `Negative label changes in the last 5. ${PAIR}`,
      needsFixtures: true,
      measure: 'label-change',
      token: 'weakness',
    }),
    aspect({
      id: 'label-cancel',
      tabId: 'last5',
      functionId: 'label_change',
      label: 'Cancel',
      detail: `Positive and negative label changes cancel. ${PAIR}`,
      needsFixtures: true,
      measure: 'label-change',
      token: 'cancel',
    }),
    aspect({
      id: 'label-none',
      tabId: 'last5',
      functionId: 'label_change',
      label: 'No change',
      detail: `The last 5 did not move the label. ${PAIR}`,
      needsFixtures: true,
      measure: 'label-change',
      token: 'no_change',
    }),
    ...deathAspects(),
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
      label: 'Strong',
      detail: 'Last 6 band. Strong is the best match, then mixed, then poor.',
      needsFixtures: true,
      measure: 'form-band',
      token: 'strong',
    }),
    aspect({
      id: 'form-mixed',
      tabId: 'form',
      functionId: 'read',
      label: 'Mixed',
      detail: 'Last 6 band. Mixed is the best match.',
      needsFixtures: true,
      measure: 'form-band',
      token: 'mixed',
    }),
    aspect({
      id: 'form-poor',
      tabId: 'form',
      functionId: 'read',
      label: 'Poor',
      detail: 'Last 6 band. Poor is the best match.',
      needsFixtures: true,
      measure: 'form-band',
      token: 'poor',
    }),
    aspect({
      id: 'form-up',
      tabId: 'form',
      functionId: 'read',
      label: 'Picking up',
      detail: 'Last 3 of the last 6 took more points than the previous 3.',
      needsFixtures: true,
      measure: 'form-trend',
      token: 'picking_up',
    }),
    aspect({
      id: 'form-down',
      tabId: 'form',
      functionId: 'read',
      label: 'Dropping',
      detail: 'Last 3 of the last 6 took fewer points than the previous 3.',
      needsFixtures: true,
      measure: 'form-trend',
      token: 'dropping',
    }),
    aspect({
      id: 'form-steady',
      tabId: 'form',
      functionId: 'read',
      label: 'Steady',
      detail: 'The last 6 did not swing up or down.',
      needsFixtures: true,
      measure: 'form-trend',
      token: 'steady',
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
    ...colourAspects(),
    aspect({
      id: 'ppg-aligns',
      tabId: 'colour_verification',
      functionId: 'ppg_colour',
      label: 'PPG matches the colour',
      detail: 'Season PPG sits in the band the table colour expects.',
      measure: 'ppg-colour',
      token: 'aligns',
    }),
    aspect({
      id: 'ppg-off',
      tabId: 'colour_verification',
      functionId: 'ppg_colour',
      label: 'PPG misses the colour',
      detail: 'Season PPG sits outside the band the table colour expects.',
      measure: 'ppg-colour',
      token: 'off',
    }),
    aspect({
      id: 'character-split',
      tabId: 'character',
      functionId: 'read',
      label: 'Split home and away',
      detail: 'Home PPG and away PPG differ by 0.50 or more.',
      needsFixtures: true,
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
      measure: 'character',
      token: 'even',
    }),
    aspect({
      id: 'middle-above-strong',
      tabId: 'middle_guys',
      functionId: 'read',
      label: 'Takes points above',
      detail: 'Middle third. Share of points taken against sides above. 50% is the strong show.',
      needsFixtures: true,
      measure: 'middle',
      token: 'above-strong',
    }),
    aspect({
      id: 'middle-above-weak',
      tabId: 'middle_guys',
      functionId: 'read',
      label: 'Soft against sides above',
      detail: 'Middle third. A lower share against sides above is a stronger weak-show match.',
      needsFixtures: true,
      measure: 'middle',
      token: 'above-weak',
    }),
    aspect({
      id: 'middle-below-strong',
      tabId: 'middle_guys',
      functionId: 'read',
      label: 'Dominates sides below',
      detail: 'Middle third. Share of points taken against sides below. 75% is the strong show.',
      needsFixtures: true,
      measure: 'middle',
      token: 'below-strong',
    }),
    aspect({
      id: 'middle-below-weak',
      tabId: 'middle_guys',
      functionId: 'read',
      label: 'Drops points below',
      detail: 'Middle third. A lower share against sides below is a stronger weak-show match.',
      needsFixtures: true,
      measure: 'middle',
      token: 'below-weak',
    }),
    aspect({
      id: 'bhozoma-above',
      tabId: 'bhozoma',
      functionId: 'read',
      label: 'Bhozoma',
      detail: 'Points taken against sides above. A higher share is a stronger Bhozoma match.',
      needsFixtures: true,
      measure: 'bhozoma',
      token: 'above',
    }),
    aspect({
      id: 'bhozoma-goliath',
      tabId: 'bhozoma',
      functionId: 'read',
      label: 'Goliath hero',
      detail: 'A low share against sides above. The lower share is the stronger Goliath match.',
      needsFixtures: true,
      measure: 'bhozoma',
      token: 'goliath',
    }),
    aspect({
      id: 'bhozoma-umnqumi',
      tabId: 'bhozoma',
      functionId: 'read',
      label: 'Umnqumi wehlathi',
      detail: 'Points taken against sides below. A higher share is a stronger Umnqumi match.',
      needsFixtures: true,
      measure: 'bhozoma',
      token: 'umnqumi',
    }),
    aspect({
      id: 'bhozoma-hlathi',
      tabId: 'bhozoma',
      functionId: 'read',
      label: 'Hlathi submissive',
      detail: 'A low share against sides below. The lower share is the stronger Hlathi match.',
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
        detail: `Problem-causer level against the nearest side. ${level} is the best match, and the neighbouring levels sit closer than the far ones.`,
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
        detail: `Imbangi grade against a neighbour within 4 points. Grade ${grade} is a full match.`,
        needsFixtures: true,
        measure: 'imbangi',
        token: grade,
      }),
    ),
    aspect({
      id: 'indlela-easy',
      tabId: 'indlela',
      functionId: 'read',
      label: 'Easy',
      detail: 'The next match is easy: this opponent is weaker than both the last opponent and the one after.',
      needsFixtures: true,
      measure: 'indlela',
      token: 'easy',
    }),
    aspect({
      id: 'indlela-hard',
      tabId: 'indlela',
      functionId: 'read',
      label: 'Not easy',
      detail: 'The next match is not easy on the last, current, and next opponents.',
      needsFixtures: true,
      measure: 'indlela',
      token: 'hard',
    }),
    aspect({
      id: 'indlela-last-stronger',
      tabId: 'indlela',
      functionId: 'read',
      label: 'Last opponent stronger',
      detail: 'The previous opponent is stronger than the next match’s opponent.',
      needsFixtures: true,
      measure: 'indlela',
      token: 'last',
    }),
    aspect({
      id: 'indlela-next-stronger',
      tabId: 'indlela',
      functionId: 'read',
      label: 'Next opponent stronger',
      detail: 'The opponent after this match is stronger than the next match’s opponent.',
      needsFixtures: true,
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
      label: 'No reward',
      detail: 'Nothing left to chase or escape.',
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
      label: 'Dethroned',
      detail: 'Dropped out of a critical band and still linked to it.',
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
      detail: 'No two losses in a row in the finished league games.',
      needsFixtures: true,
      measure: 'twice',
      token: 'L:never',
    }),
    aspect({
      id: 'has-lost-twice',
      tabId: 'lost_twice',
      functionId: 'read',
      label: 'Has lost twice',
      detail: 'At least one pair of losses in a row.',
      needsFixtures: true,
      measure: 'twice',
      token: 'L:broke',
    }),
    aspect({
      id: 'never-won',
      tabId: 'won_twice',
      functionId: 'read',
      label: 'Never won twice',
      detail: 'No two wins in a row in the finished league games.',
      needsFixtures: true,
      measure: 'twice',
      token: 'W:never',
    }),
    aspect({
      id: 'has-won-twice',
      tabId: 'won_twice',
      functionId: 'read',
      label: 'Has won twice',
      detail: 'At least one pair of wins in a row.',
      needsFixtures: true,
      measure: 'twice',
      token: 'W:broke',
    }),
    aspect({
      id: 'won-6-current',
      tabId: 'won_6',
      functionId: 'read',
      label: 'Six wins in a row',
      detail: 'Current win run. Six is a full match. A shorter run scores in proportion.',
      needsFixtures: true,
      measure: 'streak',
      token: 'W',
    }),
    aspect({
      id: 'lost-6-current',
      tabId: 'lost_6',
      functionId: 'read',
      label: 'Six losses in a row',
      detail: 'Current loss run. Six is a full match. A shorter run scores in proportion.',
      needsFixtures: true,
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
      label: 'Sudden drop',
      detail: 'Earlier PPG above the last 5. A drop of 0.75 is a full match.',
      needsFixtures: true,
      measure: 'swing',
      token: 'drop',
    }),
    aspect({
      id: 'swing-rise',
      tabId: 'sudden_pickup',
      functionId: 'read',
      label: 'Sudden pick up',
      detail: 'Last-5 PPG above the earlier games. A rise of 0.75 is a full match.',
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
      detail: 'Two losses or a winless run in the last three, and something on the table to fight for.',
      needsFixtures: true,
      measure: 'struggle',
      token: 'fight',
    }),
    aspect({
      id: 'struggle-yes',
      tabId: 'struggle',
      functionId: 'read',
      label: 'Struggling',
      detail: 'Two losses or a winless run in the last three.',
      needsFixtures: true,
      measure: 'struggle',
      token: 'yes',
    }),
    aspect({
      id: 'struggle-no',
      tabId: 'struggle',
      functionId: 'read',
      label: 'Not struggling',
      detail: 'The last three are not a struggle run.',
      needsFixtures: true,
      measure: 'struggle',
      token: 'no',
    }),
  ];
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

function neighbourOf(row: MeasureRow, table: MeasureRow[]): MeasureRow | null {
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
  if (token === 'grade-A' || token === 'grade-B') {
    const target: MotivationGrade = token === 'grade-A' ? 'A' : 'B';
    const order: MotivationGrade[] = ['A', 'B', 'none'];
    const distance = Math.abs(order.indexOf(mot.grade) - order.indexOf(target));
    return fit((1 - distance / (order.length - 1)) * 100, `Grade ${mot.grade} · ${mot.stanceReason}`);
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
  return cached(context, `indlela:${row.teamId}`, () => {
    const schedule = context?.schedule ?? [];
    const current = nextFixture(row, schedule);
    if (!current) return null;
    return indlelaPath({
      teamId: row.teamId,
      homeId: current.homeId,
      awayId: current.awayId,
      kickoffUnix: current.unix,
      schedule,
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
    const other = neighbourOf(row, table);
    if (!other) return null;
    const stronger = strongerThan(row, other);
    const percent = stronger == null ? 50 : stronger ? 100 : 0;
    const reason =
      stronger == null ? `Level with ${other.name}` : stronger ? `Above ${other.name}` : `Below ${other.name}`;
    return fit(percent, reason);
  }

  if (measure === 'stream-h2h') {
    const other = neighbourOf(row, table);
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
    const other = neighbourOf(row, table);
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
    const other = neighbourOf(row, table);
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
      return fit(share(hits, games.length), `${hits} of ${games.length} graded ${token.replace(/_/g, ' ')}`);
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
    if (side.hierarchy.kind !== token) return fit(0, side.hierarchy.title);
    if (token === 'strength' || token === 'weakness') {
      return fit((1 - (side.hierarchy.grade - 1) / 6) * 100, `${side.hierarchy.title} · ${side.hierarchy.code}`);
    }
    return fit(100, side.hierarchy.title);
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
      const order = ['poor', 'mixed', 'strong'];
      const distance = Math.abs(order.indexOf(form.band) - order.indexOf(token));
      return fit((1 - distance / (order.length - 1)) * 100, form.read);
    }
    const order = ['dropping', 'steady', 'picking_up'];
    const distance = Math.abs(order.indexOf(form.trend) - order.indexOf(token));
    return fit((1 - distance / (order.length - 1)) * 100, form.read);
  }

  if (measure === 'h2h') {
    const other = neighbourOf(row, table);
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
    const percent = token === 'split' ? Math.min(100, (gap / 0.5) * 100) : Math.max(0, 100 - (gap / 0.5) * 100);
    return fit(percent, `Home ${homeRate.toFixed(2)} · away ${awayRate.toFixed(2)}`);
  }

  if (measure === 'middle') {
    if (row.zone !== 'mid') return fit(0, 'Not in the middle third');
    const above = results.filter((result) => result.opponentAbove === true);
    const below = results.filter((result) => result.opponentAbove === false);
    const abovePct = above.length === 0 ? null : share(pointsOf(above), above.length * 3);
    const belowPct = below.length === 0 ? null : share(pointsOf(below), below.length * 3);
    if (token.startsWith('above')) {
      if (abovePct == null) return null;
      const percent = token === 'above-strong' ? abovePct : 100 - abovePct;
      return fit(percent, `${Math.round(abovePct)}% vs sides above`);
    }
    if (belowPct == null) return null;
    const percent = token === 'below-strong' ? belowPct : 100 - belowPct;
    return fit(percent, `${Math.round(belowPct)}% vs sides below`);
  }

  if (measure === 'bhozoma') {
    const built = cached(context, 'bhozoma', () => buildBhozomaTable(table, matches));
    const found = built.rows.find((item) => item.teamId === row.teamId);
    if (!found) return null;
    const side = token === 'above' || token === 'goliath' ? found.above : found.below;
    if (side.dataDust || side.mp < BHOZOMA_MIN_MP || side.pctAttained == null) return null;
    const percent = token === 'goliath' || token === 'hlathi' ? 100 - side.pctAttained : side.pctAttained;
    return fit(percent, side.label ?? `${Math.round(side.pctAttained)}%`);
  }

  if (measure === 'problem') {
    const other = neighbourOf(row, table);
    if (!other) return null;
    const games = pairGames(matches, row.teamId, other.teamId, 'overall');
    if (games.length === 0) return null;
    const read = evaluateProblemCauser({
      matches: toH2H(games, table),
      t1Name: row.name,
      t2Name: other.name,
    });
    const scores: Record<ProblemLevelName, number> = { Entry: 3, Moderate: 5, Major: 7, Extreme: 10 };
    const actual = scores[read.t1.level.name];
    const target = scores[token as ProblemLevelName];
    return fit((1 - Math.abs(actual - target) / 7) * 100, `${read.t1.level.name} vs ${other.name}`);
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
    return fit((run / 6) * 100, `${run} ${word} in a row`);
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
    return fit(gap <= 0 ? 0 : Math.min(100, (gap / 0.75) * 100), swing.detail);
  }

  if (measure === 'struggle') {
    const last3 = results.slice(0, 3);
    if (last3.length < 2) return null;
    const losses = last3.filter((result) => result.outcome === 'L').length;
    const active = losses >= 2 || last3.every((result) => result.outcome !== 'W');
    const mot = motivationFor(row, table, context);
    const fight = active && !!mot && (mot.stance === 'chase' || mot.stance === 'escape') && mot.grade !== 'none';
    const seq = last3.map((result) => result.outcome).join(' ');
    if (token === 'fight') return fit(fight ? 100 : active ? 40 : 0, fight ? `Struggling (${seq}) and fighting` : `Last 3: ${seq}`);
    if (token === 'yes') return fit(active ? 100 : 0, active ? `Struggling (${seq})` : `Last 3: ${seq}`);
    return fit(active ? 0 : 100, active ? `Struggling (${seq})` : `Last 3: ${seq}`);
  }

  return null;
}
