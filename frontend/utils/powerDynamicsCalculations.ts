/**
 * Power dynamics calculations.
 * One number per sector for T1 and T2, then three reads:
 * sectors at 6 or more, each side's total, and how many sectors T2 wins.
 */

import type { H2HMatch } from '@/services/oddAlerts';
import { buildBhozomaTable, type SeasonMatch } from '@/utils/bhozomaEngine';
import { evaluateH2HOptions, h2hGradeScore } from '@/utils/h2hOptions';
import { evaluateImportanceOf3 } from '@/utils/importanceOf3Engine';
import type { ImbangiScheduleMatch } from '@/utils/imbangiEngine';
import type { FixtureInitialState, InitialStateSide } from '@/utils/last5Analysis';
import { PERIOD_WORD, VENUE_WORD } from '@/utils/last5Sections';
import {
  last5FormLeagueTable,
  last6FormLeagueTable,
  last6FormStandings,
  resultsFromSeasonMatches,
  type Last6LeagueRow,
  type Last6Period,
  type Last6Venue,
} from '@/utils/last6Form';
import type { StandingLike } from '@/utils/motivationEngine';
import {
  baselineGapFor,
  evaluatePositionGap,
  type IndlelaPath,
  type PowerDynamicsBundle,
  type PpgSwing,
  type SideId,
  type SideSnapshot,
  type StreakSide,
} from '@/utils/powerDynamicsEngine';
import type { ProblemCauserRead } from '@/utils/problemCauser';
import { contestedLeagueBoard } from '@/utils/separatorTools';
import { lastN } from '@/utils/teamResults';

export const SECTOR_HIT = 6;
export const Y_APPLICATION_VALUE = 2;
export const IMBANGI_TRUE_VALUE = 6;

const LAST5_VENUES: Last6Venue[] = ['overall', 'home', 'away'];
const LAST5_PERIODS: Last6Period[] = ['ft', '1h', '2h'];

export type SectorGroup = 'core' | 'semi' | 'y';

export type SectorPart = {
  label: string;
  t1: number | null;
  t2: number | null;
};

export type CalculationSector = {
  id: string;
  label: string;
  group: SectorGroup;
  /** Yellow sides count this Y application inside Core. */
  coreFor: SideId[];
  t1: number | null;
  t2: number | null;
  detail: string;
  parts: SectorPart[];
};

export type CalculationTick = {
  id: string;
  label: string;
  t1: boolean;
  t2: boolean;
  detail: string;
};

export type SectorHit = {
  id: string;
  label: string;
  value: number;
};

export type PowerDynamicsCalculation = {
  t1Yellow: boolean;
  t2Yellow: boolean;
  sectors: CalculationSector[];
  ticks: CalculationTick[];
  calc1: {
    t1: SectorHit[];
    t2: SectorHit[];
    leader: SideId | 'level';
  };
  calc2: { t1: number; t2: number };
  calc3: {
    count: number;
    sectors: { id: string; label: string; t1: number; t2: number }[];
  };
};

export type PowerDynamicsCalculationInput = {
  pd: PowerDynamicsBundle;
  standings: StandingLike[];
  matches: SeasonMatch[];
  schedule: ImbangiScheduleMatch[];
  seasonProgress?: number | null;
  competitionId?: number | string | null;
  h2hMatches: H2HMatch[];
  homeName: string;
  awayName: string;
  competitionName?: string | null;
  initial: FixtureInitialState;
  indlela: { t1: IndlelaPath; t2: IndlelaPath };
  problem: ProblemCauserRead;
  swing: { t1: PpgSwing; t2: PpgSwing };
  loss: { t1: StreakSide; t2: StreakSide };
  win: { t1: StreakSide; t2: StreakSide };
};

type SideNumbers = { t1: number | null; t2: number | null };

function num(value: number | null | undefined): number {
  return value == null || Number.isNaN(value) ? 0 : value;
}

function sumParts(parts: SectorPart[]): SideNumbers {
  const t1 = parts.map((part) => part.t1).filter((value): value is number => value != null);
  const t2 = parts.map((part) => part.t2).filter((value): value is number => value != null);
  return {
    t1: t1.length > 0 ? t1.reduce((sum, value) => sum + value, 0) : null,
    t2: t2.length > 0 ? t2.reduce((sum, value) => sum + value, 0) : null,
  };
}

function isYellow(pd: PowerDynamicsBundle, side: SideId): boolean {
  return pd[side].colour === 'yellow';
}

function scoresOnFormTable(pd: PowerDynamicsBundle, rows: Last6LeagueRow[]): SideNumbers {
  if (rows.length < 2) return { t1: null, t2: null };
  const standings = last6FormStandings(rows);
  const t1Row = rows.find((row) => row.teamId === pd.t1.teamId);
  const t2Row = rows.find((row) => row.teamId === pd.t2.teamId);
  const t1: SideSnapshot = {
    ...pd.t1,
    rank: t1Row?.formRank ?? null,
    points: t1Row?.form?.points ?? null,
    played: t1Row?.form?.mp ?? null,
    goalDiff: t1Row?.form?.gd ?? null,
    goalsFor: t1Row?.form?.gf ?? null,
  };
  const t2: SideSnapshot = {
    ...pd.t2,
    rank: t2Row?.formRank ?? null,
    points: t2Row?.form?.points ?? null,
    played: t2Row?.form?.mp ?? null,
    goalDiff: t2Row?.form?.gd ?? null,
    goalsFor: t2Row?.form?.gf ?? null,
  };
  const positionGap = evaluatePositionGap({
    tableSize: rows.length,
    t1Rank: t1.rank,
    t2Rank: t2.rank,
    t1Label: t1.label,
    t2Label: t2.label,
  });
  const gap = baselineGapFor(t1, t2, standings, positionGap);
  return { t1: gap.t1.score, t2: gap.t2.score };
}

type InitialTally = { points: number; gd: number; gf: number; mp: number };

function tallyInitial(side: InitialStateSide | null | undefined): InitialTally {
  const matches = side?.matches ?? [];
  let gf = 0;
  let ga = 0;
  let points = 0;
  for (const match of matches) {
    if (match.outcome === 'W') points += 3;
    else if (match.outcome === 'D') points += 1;
    gf += match.result.gf;
    ga += match.result.ga;
  }
  return { points, gd: gf - ga, gf, mp: matches.length };
}

function venueLast5Rows(
  standings: StandingLike[],
  matches: SeasonMatch[],
  venue: 'home' | 'away' | 'overall',
  focus: { teamId: number | null; tally: InitialTally }[],
): StandingLike[] {
  const focusById = new Map(
    focus
      .filter((row): row is { teamId: number; tally: InitialTally } => row.teamId != null)
      .map((row) => [row.teamId, row.tally]),
  );
  const rows = standings.map((side) => {
    const kept = focusById.get(side.teamId);
    if (kept) {
      return {
        teamId: side.teamId,
        name: side.name,
        zone: side.zone,
        points: kept.points,
        gd: kept.gd,
        gf: kept.gf,
        played: kept.mp,
      };
    }
    const window = lastN(resultsFromSeasonMatches(side.teamId, matches, standings, { venue }), 5);
    let points = 0;
    let gf = 0;
    let ga = 0;
    for (const result of window) {
      if (result.outcome === 'W') points += 3;
      else if (result.outcome === 'D') points += 1;
      gf += result.gf;
      ga += result.ga;
    }
    return {
      teamId: side.teamId,
      name: side.name,
      zone: side.zone,
      points,
      gd: gf - ga,
      gf,
      played: window.length,
    };
  });
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.teamId - b.teamId;
  });
  return rows.map((row, index) => ({
    rank: index + 1,
    teamId: row.teamId,
    name: row.name,
    points: row.points,
    played: row.played,
    zone: row.zone,
    goalDiff: row.gd,
    goalsFor: row.gf,
  }));
}

function initialBaseline(
  pd: PowerDynamicsBundle,
  standings: StandingLike[],
  matches: SeasonMatch[],
  initial: FixtureInitialState,
  lens: 'overall' | 'home_away',
): SideNumbers {
  if (standings.length < 2) return { t1: null, t2: null };
  const homeId = pd.t1.venue === 'home' ? pd.t1.teamId : pd.t2.teamId;
  const awayId = pd.t1.venue === 'away' ? pd.t1.teamId : pd.t2.teamId;
  const homeTable =
    lens === 'overall'
      ? venueLast5Rows(standings, matches, 'overall', [
          { teamId: homeId, tally: tallyInitial(initial.overallHome) },
          { teamId: awayId, tally: tallyInitial(initial.overallAway) },
        ])
      : venueLast5Rows(standings, matches, 'home', [{ teamId: homeId, tally: tallyInitial(initial.home) }]);
  const awayTable =
    lens === 'overall'
      ? homeTable
      : venueLast5Rows(standings, matches, 'away', [{ teamId: awayId, tally: tallyInitial(initial.away) }]);
  const homeRank = homeId != null ? homeTable.find((row) => row.teamId === homeId) : undefined;
  const awayRank = awayId != null ? awayTable.find((row) => row.teamId === awayId) : undefined;
  const apply = (snap: SideSnapshot): SideSnapshot => {
    const row = snap.venue === 'home' ? homeRank : awayRank;
    return { ...snap, rank: row?.rank ?? null };
  };
  const t1 = apply(pd.t1);
  const t2 = apply(pd.t2);
  const positionGap = evaluatePositionGap({
    tableSize: standings.length,
    t1Rank: t1.rank,
    t2Rank: t2.rank,
    t1Label: t1.label,
    t2Label: t2.label,
  });
  const gap = baselineGapFor(
    t1,
    t2,
    lens === 'overall' ? homeTable : [...homeTable, ...awayTable],
    positionGap,
  );
  return { t1: gap.t1.score, t2: gap.t2.score };
}

function last5Parts(
  pd: PowerDynamicsBundle,
  standings: StandingLike[],
  matches: SeasonMatch[],
  initial: FixtureInitialState,
): SectorPart[] {
  const parts: SectorPart[] = [
    {
      label: 'Initial state · Overall',
      ...initialBaseline(pd, standings, matches, initial, 'overall'),
    },
    {
      label: 'Initial state · Home/Away',
      ...initialBaseline(pd, standings, matches, initial, 'home_away'),
    },
  ];
  if (standings.length >= 2 && matches.length > 0) {
    for (const venue of LAST5_VENUES) {
      for (const period of LAST5_PERIODS) {
        const table = last5FormLeagueTable(standings, matches, { venue, period });
        parts.push({
          label: `Last 5 · ${VENUE_WORD[venue]} · ${PERIOD_WORD[period]}`,
          ...scoresOnFormTable(pd, table),
        });
      }
    }
  }
  return parts;
}

function h2hGradeValues(
  matches: H2HMatch[],
  homeName: string,
  awayName: string,
  t1Name: string,
  t2Name: string,
  competitionName?: string | null,
): { scores: SideNumbers; detail: string } {
  const read = evaluateH2HOptions({
    matches,
    homeName,
    awayName,
    t1Name,
    t2Name,
    competitionName,
  });
  let t1 = 0;
  let t2 = 0;
  const notes: string[] = [];
  const polar = read.says.find((block) => block.id === 'say_edge_polar' && block.grade);
  const never = read.says.find((block) => block.id === 'say_never_beats' && block.grade);
  if (polar?.grade) {
    const score = h2hGradeScore(polar.grade) ?? 0;
    if (polar.title.startsWith('T1')) {
      t1 = score;
      notes.push(`T1 polar grade ${polar.grade} · ${score}`);
    } else if (polar.title.startsWith('T2')) {
      t2 = score;
      notes.push(`T2 polar grade ${polar.grade} · ${score}`);
    }
  }
  if (never?.grade) {
    const score = h2hGradeScore(never.grade) ?? 0;
    t2 = Math.max(t2, score);
    notes.push(`T1 never beats T2 · grade ${never.grade} · ${score} to T2`);
  }
  return {
    scores: { t1, t2 },
    detail: notes.length > 0 ? notes.join(' · ') : 'No H2H grade',
  };
}

/** Imbangi is the side sitting 1st or 2nd. */
function imbangiValue(rank: number | null, label: string): { value: number; detail: string } {
  if (rank === 1 || rank === 2) {
    return { value: IMBANGI_TRUE_VALUE, detail: `${label} is #${rank}` };
  }
  if (rank == null) return { value: 0, detail: `${label} is not on this table` };
  return { value: 0, detail: `${label} is #${rank}` };
}

function bhozomaValue(
  standings: StandingLike[],
  matches: SeasonMatch[],
  competitionId: number | string | null | undefined,
  teamId: number | null,
  opponentRank: number | null,
  teamRank: number | null,
): { value: number; detail: string } {
  if (teamId == null || teamRank == null || opponentRank == null) {
    return { value: 0, detail: 'Need both places on the table' };
  }
  const row = buildBhozomaTable(standings, matches, competitionId).rows.find((item) => item.teamId === teamId);
  if (!row) return { value: 0, detail: 'No Bhozoma row' };
  if (opponentRank < teamRank) {
    const advantage = row.above.label?.startsWith('Bhozoma') === true && !row.above.dataDust;
    return {
      value: advantage ? Y_APPLICATION_VALUE : 0,
      detail: `Opponent is above · ${row.above.label ?? 'no read'}${row.above.dataDust ? ' · early sample' : ''}`,
    };
  }
  if (opponentRank > teamRank) {
    const advantage = row.below.label?.startsWith('Umnqumi wehlathi') === true && !row.below.dataDust;
    return {
      value: advantage ? Y_APPLICATION_VALUE : 0,
      detail: `Opponent is below · ${row.below.label ?? 'no read'}${row.below.dataDust ? ' · early sample' : ''}`,
    };
  }
  return { value: 0, detail: 'Same place on the table' };
}

function childBeaterValue(pd: PowerDynamicsBundle, side: SideId): { value: number; detail: string } {
  const read = pd.childBeater[side];
  const method2 = read.method2 != null && !read.method2.includes('need');
  if (read.method1 || method2) {
    const bits = [read.method1, method2 ? read.method2 : null].filter(Boolean);
    return { value: Y_APPLICATION_VALUE, detail: bits.join(' · ') };
  }
  return { value: 0, detail: read.method2 ?? 'Not a child beater' };
}

function flagValue(on: boolean, onDetail: string, offDetail: string): { value: number; detail: string } {
  return on
    ? { value: Y_APPLICATION_VALUE, detail: onDetail }
    : { value: 0, detail: offDetail };
}

function sector(
  id: string,
  label: string,
  group: SectorGroup,
  scores: SideNumbers,
  detail: string,
  parts: SectorPart[] = [],
  coreFor: SideId[] = [],
): CalculationSector {
  return { id, label, group, coreFor, t1: scores.t1, t2: scores.t2, detail, parts };
}

export function summariseSectorScores(opts: {
  sectors: CalculationSector[];
  ticks: CalculationTick[];
  t1Yellow: boolean;
  t2Yellow: boolean;
}): PowerDynamicsCalculation {
  const hits = (side: SideId): SectorHit[] =>
    opts.sectors
      .filter((row) => num(row[side]) >= SECTOR_HIT)
      .map((row) => ({ id: row.id, label: row.label, value: num(row[side]) }));
  const t1Hits = hits('t1');
  const t2Hits = hits('t2');
  const leader: SideId | 'level' =
    t1Hits.length === t2Hits.length ? 'level' : t1Hits.length > t2Hits.length ? 't1' : 't2';
  const t2Wins = opts.sectors
    .map((row) => ({ id: row.id, label: row.label, t1: num(row.t1), t2: num(row.t2) }))
    .filter((row) => row.t2 > row.t1);
  return {
    t1Yellow: opts.t1Yellow,
    t2Yellow: opts.t2Yellow,
    sectors: opts.sectors,
    ticks: opts.ticks,
    calc1: { t1: t1Hits, t2: t2Hits, leader },
    calc2: {
      t1: opts.sectors.reduce((sum, row) => sum + num(row.t1), 0),
      t2: opts.sectors.reduce((sum, row) => sum + num(row.t2), 0),
    },
    calc3: { count: t2Wins.length, sectors: t2Wins },
  };
}

export function buildPowerDynamicsCalculations(
  input: PowerDynamicsCalculationInput,
): PowerDynamicsCalculation {
  const { pd, standings, matches } = input;
  const t1Yellow = isYellow(pd, 't1');
  const t2Yellow = isYellow(pd, 't2');
  const yellowSides: SideId[] = [
    ...(t1Yellow ? (['t1'] as const) : []),
    ...(t2Yellow ? (['t2'] as const) : []),
  ];

  const importance = evaluateImportanceOf3({
    table: standings,
    t1Id: pd.t1.teamId,
    t2Id: pd.t2.teamId,
    competitionId: input.competitionId,
    seasonProgress: input.seasonProgress,
    matches,
    schedule: input.schedule,
  });
  const escapeDetail = (score: number | null, name: string) =>
    score == null ? `${name} has no escape element` : `${name} escape element ${score}`;

  const last5 = last5Parts(pd, standings, matches, input.initial);
  const last5Scores = sumParts(last5);
  const formScores = scoresOnFormTable(pd, last6FormLeagueTable(standings, matches));
  const h2h = h2hGradeValues(
    input.h2hMatches,
    input.homeName,
    input.awayName,
    pd.t1.name,
    pd.t2.name,
    input.competitionName,
  );
  const imbangiT1 = imbangiValue(pd.t1.rank, pd.t1.label);
  const imbangiT2 = imbangiValue(pd.t2.rank, pd.t2.label);
  const bhozomaT1 = bhozomaValue(
    standings,
    matches,
    input.competitionId,
    pd.t1.teamId,
    pd.t2.rank,
    pd.t1.rank,
  );
  const bhozomaT2 = bhozomaValue(
    standings,
    matches,
    input.competitionId,
    pd.t2.teamId,
    pd.t1.rank,
    pd.t2.rank,
  );
  const childT1 = childBeaterValue(pd, 't1');
  const childT2 = childBeaterValue(pd, 't2');
  const indlelaT1 = flagValue(
    input.indlela.t1.fourthStronger === true,
    'Next opponent is stronger than this opponent',
    input.indlela.t1.fourthStronger === false
      ? 'Next game is not more intense than this one'
      : 'Next game cannot be compared yet',
  );
  const indlelaT2 = flagValue(
    input.indlela.t2.fourthStronger === true,
    'Next opponent is stronger than this opponent',
    input.indlela.t2.fourthStronger === false
      ? 'Next game is not more intense than this one'
      : 'Next game cannot be compared yet',
  );
  const dropForOpponent = (dropped: boolean, droppedBy: string, receiver: string, read: string) =>
    dropped
      ? { value: Y_APPLICATION_VALUE, detail: `${droppedBy} is in a sudden drop, so ${receiver} receives 2. ${read}` }
      : { value: 0, detail: `${droppedBy} is not in a sudden drop` };
  const dropToT2 = dropForOpponent(input.swing.t1.drop, pd.t1.label, pd.t2.label, input.swing.t1.detail);
  const dropToT1 = dropForOpponent(input.swing.t2.drop, pd.t2.label, pd.t1.label, input.swing.t2.detail);
  const riseT1 = flagValue(input.swing.t1.rise, input.swing.t1.detail, input.swing.t1.detail);
  const riseT2 = flagValue(input.swing.t2.rise, input.swing.t2.detail, input.swing.t2.detail);

  const baselineDetail = pd.baselineGap.call || 'Natural table baseline';
  const sectors: CalculationSector[] = [
    sector(
      'baseline',
      'Baseline',
      'core',
      { t1: pd.baselineGap.t1.score, t2: pd.baselineGap.t2.score },
      baselineDetail,
    ),
    sector(
      'importance_3pts',
      'Importance of 3 points',
      'core',
      {
        t1: importance.singaye1?.escape.score ?? 0,
        t2: importance.singaye2?.escape.score ?? 0,
      },
      `${escapeDetail(importance.singaye1?.escape.score ?? null, pd.t1.label)}. ${escapeDetail(
        importance.singaye2?.escape.score ?? null,
        pd.t2.label,
      )}.`,
    ),
    sector(
      'last5',
      'Last 5',
      'core',
      last5Scores,
      'Sum of every Last 5 baseline, including each venue and period filter.',
      last5,
    ),
    sector('form', 'Form', 'core', formScores, 'Baseline from last-6 form places.'),
    sector('h2h', 'H2H', 'core', h2h.scores, h2h.detail),
    sector(
      'problem_causer',
      'Problem causer',
      'core',
      { t1: input.problem.t1.level.score, t2: input.problem.t2.level.score },
      `${pd.t1.label} ${input.problem.t1.level.name} ${input.problem.t1.level.score} · ${pd.t2.label} ${input.problem.t2.level.name} ${input.problem.t2.level.score}`,
    ),
    sector(
      'imbangi',
      'Imbangi',
      'semi',
      { t1: imbangiT1.value, t2: imbangiT2.value },
      `${pd.t1.label}: ${imbangiT1.detail}. ${pd.t2.label}: ${imbangiT2.detail}.`,
    ),
    sector(
      'home_away_strong',
      'Home/Away strong',
      'semi',
      { t1: pd.baselineGap.t1.score, t2: pd.baselineGap.t2.score },
      'Baseline shown on Home/Away strong.',
    ),
    sector(
      'indlela',
      'Indlela',
      'y',
      { t1: indlelaT1.value, t2: indlelaT2.value },
      `${pd.t1.label}: ${indlelaT1.detail}. ${pd.t2.label}: ${indlelaT2.detail}.`,
      [],
      yellowSides,
    ),
    sector(
      'bhozoma',
      'Bhozoma',
      'y',
      { t1: bhozomaT1.value, t2: bhozomaT2.value },
      `${pd.t1.label}: ${bhozomaT1.detail}. ${pd.t2.label}: ${bhozomaT2.detail}.`,
      [],
      yellowSides,
    ),
    sector(
      'child_beater',
      'Child beater',
      'y',
      { t1: childT1.value, t2: childT2.value },
      `${pd.t1.label}: ${childT1.detail}. ${pd.t2.label}: ${childT2.detail}.`,
      [],
      yellowSides,
    ),
    sector(
      'sudden_drop',
      'Sudden drop',
      'y',
      { t1: dropToT1.value, t2: dropToT2.value },
      `${dropToT1.detail}. ${dropToT2.detail}.`,
      [],
      yellowSides,
    ),
    sector(
      'sudden_pickup',
      'Sudden pick up',
      'y',
      { t1: riseT1.value, t2: riseT2.value },
      `${pd.t1.label}: ${riseT1.detail}. ${pd.t2.label}: ${riseT2.detail}.`,
      [],
      yellowSides,
    ),
  ];

  const board = contestedLeagueBoard(standings);
  const inPack = (side: SideId) => {
    const rank = pd[side].rank;
    return board.active && rank != null && rank <= 5;
  };
  const tick = (
    id: string,
    label: string,
    t1: boolean,
    t2: boolean,
    detail: string,
  ): CalculationTick => ({ id, label, t1, t2, detail });

  const ticks: CalculationTick[] = [
    tick(
      'lost_6',
      'Lost 6 in a row',
      input.loss.t1.current >= 6,
      input.loss.t2.current >= 6,
      `Current loss run · ${pd.t1.label} ${input.loss.t1.current} · ${pd.t2.label} ${input.loss.t2.current}`,
    ),
    tick(
      'won_6',
      'Won 6 in a row',
      input.win.t1.current >= 6,
      input.win.t2.current >= 6,
      `Current win run · ${pd.t1.label} ${input.win.t1.current} · ${pd.t2.label} ${input.win.t2.current}`,
    ),
    tick(
      'never_lost_twice',
      'Never lost twice',
      input.loss.t1.neverTwice,
      input.loss.t2.neverTwice,
      'Yes means they have never lost two matches back to back.',
    ),
    tick(
      'never_won_twice',
      'Never won twice',
      input.win.t1.neverTwice,
      input.win.t2.neverTwice,
      'Yes means they have never won two matches back to back.',
    ),
    tick(
      'contested_league',
      'Contested league',
      inPack('t1'),
      inPack('t2'),
      board.detail,
    ),
  ];

  return summariseSectorScores({ sectors, ticks, t1Yellow, t2Yellow });
}
