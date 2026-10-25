/**
 * League-wide call. A power dynamic, one of its functions, and one aspect
 * are scored for every team on a league table. The percentage is how closely
 * that team fits the aspect.
 */
import {
  measureAspects,
  scoreMeasure,
  type CallSearchContext,
  type MeasureAspect,
} from '@/utils/powerDynamicCallMeasures';
import {
  classifyBaselineLetter,
  STREAMLINE_CLOSE_MAX,
  t1IsHomeSide,
  type BaselineLetter,
} from '@/utils/powerDynamicsEngine';

export type { CallSearchContext } from '@/utils/powerDynamicCallMeasures';

export type CallTableRow = {
  rank: number;
  teamId: number;
  name: string;
  played: number;
  points: number;
  homePoints: number;
  awayPoints: number;
  zone: 'top' | 'mid' | 'bottom';
};

export type CallAspect = {
  id: string;
  tabId: string;
  functionId: string;
  label: string;
  detail: string;
  /** Season matches are required before this aspect can be scored. */
  needsFixtures?: boolean;
  measure?: string;
  token?: string;
  /** True/false call, shown with a tick or a wrong. */
  binary?: boolean;
  /** Scored once for the fixture, from T1 toward T2. */
  pair?: boolean;
  mark?: 'tick' | 'wrong';
};

export type CallScore = {
  percent: number;
  reason: string;
};

const LETTERS: BaselineLetter[] = ['A', 'B', 'C', 'D', 'E', 'F'];

const LETTER_ASPECTS: CallAspect[] = LETTERS.map((letter) => ({
  id: `baseline-letter-${letter}`,
  tabId: 'baseline',
  functionId: 'original',
  label: `Grade ${letter}`,
  detail: `How close this side is to baseline grade ${letter}.`,
}));

export const CALL_ASPECTS: CallAspect[] = [
  ...LETTER_ASPECTS,
  {
    id: 'baseline-gap-close',
    tabId: 'baseline',
    functionId: 'gap',
    label: 'Close gap',
    detail: 'Points to the next side. A gap of 0 is a perfect close match. Each point lowers the fit.',
    pair: true,
  },
  {
    id: 'baseline-gap-far',
    tabId: 'baseline',
    functionId: 'gap',
    label: 'Wide gap',
    detail: 'Points to the next side. A wider gap is a stronger wide-gap match.',
    pair: true,
  },
  {
    id: 'bateteme-1-close',
    tabId: 'baseline',
    functionId: 'bateteme_1',
    label: 'Bateteme closeness',
    detail: `Bateteme starts when two sides are within ${STREAMLINE_CLOSE_MAX} points. The closest gap is the best match. Odds are not part of this league scan.`,
    pair: true,
  },
  {
    id: 'bateteme-2-close',
    tabId: 'baseline',
    functionId: 'bateteme_2',
    label: 'Bateteme closeness',
    detail: `Bateteme starts when two sides are within ${STREAMLINE_CLOSE_MAX} points. The closest gap is the best match. Odds are not part of this league scan.`,
    pair: true,
  },
  {
    id: 'colour-green',
    tabId: 'colour_verification',
    functionId: 'ppg_colour',
    label: 'Green table',
    detail: 'Top third of the table. The side at the top of that third is the strongest green match.',
  },
  {
    id: 'colour-yellow',
    tabId: 'colour_verification',
    functionId: 'ppg_colour',
    label: 'Yellow table',
    detail: 'Middle third of the table. The side at the top of that third is the strongest yellow match.',
  },
  {
    id: 'colour-red',
    tabId: 'colour_verification',
    functionId: 'ppg_colour',
    label: 'Red table',
    detail: 'Bottom third of the table. The side at the top of that third is the strongest red match.',
  },
  {
    id: 'venue-home',
    tabId: 'home_away_strong',
    functionId: 'read',
    label: 'Home strong',
    detail: 'Share of points won at home. A higher home share is a stronger home match.',
  },
  {
    id: 'venue-away',
    tabId: 'home_away_strong',
    functionId: 'read',
    label: 'Away strong',
    detail: 'Share of points won away. A higher away share is a stronger away match.',
  },
  {
    id: 'points-tight',
    tabId: 'points_diff',
    functionId: 'read',
    label: 'Tight on the table',
    detail: 'Smallest points gap to the next side. Level sides are the best match.',
    pair: true,
  },
  {
    id: 'points-clear',
    tabId: 'points_diff',
    functionId: 'read',
    label: 'Clear gap',
    detail: 'Largest points gap to the next side. A wider gap is a stronger match.',
    pair: true,
  },
  ...measureAspects(),
];

const ASPECT_BY_ID = new Map(CALL_ASPECTS.map((aspect) => [aspect.id, aspect]));

export function callAspectsFor(tabId: string, functionId: string): CallAspect[] {
  return CALL_ASPECTS.filter((aspect) => aspect.tabId === tabId && aspect.functionId === functionId);
}

export function callAspectById(id: string): CallAspect | undefined {
  return ASPECT_BY_ID.get(id);
}

function ppg(row: CallTableRow): number | null {
  if (row.played <= 0) return null;
  return row.points / row.played;
}

function tablePpg(table: CallTableRow[]): number | null {
  const played = table.reduce((sum, row) => sum + row.played, 0);
  if (played <= 0) return null;
  const points = table.reduce((sum, row) => sum + row.points, 0);
  return points / played;
}

/** Smallest points gap to the side directly above or below. */
export function nearestPointsGap(row: CallTableRow, table: CallTableRow[]): number | null {
  const index = table.findIndex((item) => item.teamId === row.teamId);
  if (index < 0) return null;
  const gaps: number[] = [];
  if (index > 0) gaps.push(Math.abs(table[index - 1].points - row.points));
  if (index < table.length - 1) gaps.push(Math.abs(table[index + 1].points - row.points));
  if (gaps.length === 0) return null;
  return Math.min(...gaps);
}

function closePercent(gap: number): number {
  return Math.max(0, Math.round(100 - gap * 20));
}

function widePercent(gap: number): number {
  return Math.min(100, Math.round((gap / 15) * 100));
}

function letterPercent(actual: BaselineLetter, target: BaselineLetter): number {
  const distance = Math.abs(LETTERS.indexOf(actual) - LETTERS.indexOf(target));
  return Math.round((1 - distance / (LETTERS.length - 1)) * 100);
}

function colourPercent(row: CallTableRow, table: CallTableRow[], zone: CallTableRow['zone']): number {
  if (row.zone !== zone) return 0;
  const band = table.filter((item) => item.zone === zone);
  if (band.length <= 1) return 100;
  const index = band.findIndex((item) => item.teamId === row.teamId);
  if (index < 0) return 0;
  return Math.round(100 - (index / (band.length - 1)) * 30);
}

function venuePercent(row: CallTableRow, home: boolean): number | null {
  const sum = row.homePoints + row.awayPoints;
  if (sum <= 0) return null;
  const homeShare = Math.round((row.homePoints / sum) * 100);
  return home ? homeShare : 100 - homeShare;
}

function gapFor(row: CallTableRow, table: CallTableRow[], context?: CallSearchContext): number | null {
  if (context?.opponentId != null) {
    const other = table.find((item) => item.teamId === context.opponentId);
    if (other) return Math.abs(other.points - row.points);
  }
  return nearestPointsGap(row, table);
}

function withMark(aspect: CallAspect, score: CallScore | null): CallScore | null {
  if (!score || aspect.mark !== 'wrong') return score;
  return { percent: 100 - score.percent, reason: score.reason };
}

/** 0–100 fit for one team. Null when this aspect cannot be measured for the side. */
export function scoreCallAspect(
  aspectId: string,
  row: CallTableRow,
  table: CallTableRow[],
  context?: CallSearchContext,
): CallScore | null {
  const aspect = callAspectById(aspectId);
  if (!aspect || row.played <= 0) return null;
  if (aspect.needsFixtures && !context?.matches) return null;
  if (aspect.measure && aspect.token) {
    return withMark(aspect, scoreMeasure(aspect as MeasureAspect, row, table, context));
  }

  if (aspectId.startsWith('baseline-letter-')) {
    const target = aspectId.slice(-1) as BaselineLetter;
    const letter = classifyBaselineLetter(row.zone, ppg(row), tablePpg(table));
    if (!letter) return null;
    const rate = ppg(row);
    return {
      percent: letterPercent(letter, target),
      reason: `Baseline ${letter}${rate != null ? ` · ${rate.toFixed(2)} PPG` : ''}`,
    };
  }

  if (aspectId === 'baseline-gap-close' || aspectId === 'bateteme-1-close' || aspectId === 'bateteme-2-close' || aspectId === 'points-tight') {
    const gap = gapFor(row, table, context);
    if (gap == null) return null;
    return {
      percent: closePercent(gap),
      reason: gap === 0 ? 'Level with the next side' : `${gap} pt${gap === 1 ? '' : 's'} from the next side`,
    };
  }

  if (aspectId === 'baseline-gap-far' || aspectId === 'points-clear') {
    const gap = gapFor(row, table, context);
    if (gap == null) return null;
    return {
      percent: widePercent(gap),
      reason: gap === 0 ? 'Level with the next side' : `${gap} pt${gap === 1 ? '' : 's'} from the next side`,
    };
  }

  if (aspectId === 'colour-green' || aspectId === 'colour-yellow' || aspectId === 'colour-red') {
    const zone = aspectId === 'colour-green' ? 'top' : aspectId === 'colour-yellow' ? 'mid' : 'bottom';
    const word = zone === 'top' ? 'Green' : zone === 'mid' ? 'Yellow' : 'Red';
    return {
      percent: colourPercent(row, table, zone),
      reason: row.zone === zone ? `${word} · #${row.rank}` : `Not on the ${word.toLowerCase()} third`,
    };
  }

  if (aspectId === 'venue-home' || aspectId === 'venue-away') {
    const home = aspectId === 'venue-home';
    const percent = venuePercent(row, home);
    if (percent == null) return null;
    return {
      percent,
      reason: home
        ? `${row.homePoints} of ${row.homePoints + row.awayPoints} split points at home`
        : `${row.awayPoints} of ${row.homePoints + row.awayPoints} split points away`,
    };
  }

  return null;
}

/** Fit of one fixture. Pair reads use T1 against T2. Team reads use the closer side. */
export function scoreCallFixture(
  aspectId: string,
  home: CallTableRow,
  away: CallTableRow,
  table: CallTableRow[],
  context?: CallSearchContext,
): CallScore | null {
  const aspect = callAspectById(aspectId);
  if (!aspect) return null;
  const fixture = context?.fixture ?? { homeId: home.teamId, awayId: away.teamId, unix: 0 };
  const scoreSide = (side: CallTableRow, opponent: CallTableRow) =>
    scoreCallAspect(aspectId, side, table, { ...context, opponentId: opponent.teamId, fixture });
  if (aspect.pair) {
    const t1 = t1IsHomeSide(home, away) ? home : away;
    const t2 = t1.teamId === home.teamId ? away : home;
    return scoreSide(t1, t2);
  }
  const homeScore = scoreSide(home, away);
  const awayScore = scoreSide(away, home);
  if (!homeScore) return awayScore;
  if (!awayScore) return homeScore;
  if (awayScore.percent > homeScore.percent) {
    return { percent: awayScore.percent, reason: `${away.name} · ${awayScore.reason}` };
  }
  return { percent: homeScore.percent, reason: `${home.name} · ${homeScore.reason}` };
}
