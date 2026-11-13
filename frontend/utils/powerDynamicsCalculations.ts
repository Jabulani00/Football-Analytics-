/**
 * Power dynamics calculations.
 * One number per sector for T1 and T2, then three reads:
 * sectors at 6 or more, the total from sectors won, and which side won each one.
 * A core win uses the separation of the two values: clear is 3, mediocre is 1, poor is 0.
 * A Y application is 0.5 when it is on.
 */

import type { H2HMatch } from '@/services/oddAlerts';
import { buildBhozomaTable, type SeasonMatch } from '@/utils/bhozomaEngine';
import { evaluateH2HOptions, h2hGradeScore } from '@/utils/h2hOptions';
import { evaluateImportanceOf3 } from '@/utils/importanceOf3Engine';
import type { ImbangiScheduleMatch } from '@/utils/imbangiEngine';
import type { FixtureInitialState } from '@/utils/last5Analysis';
import { changeScalePlace, last5LabelChanges, last5Overview, type Last5Overview } from '@/utils/last5Sections';
import {
  last6FormLeagueTable,
  last6FormStandings,
  resultsFromSeasonMatches,
  type Last6LeagueRow,
} from '@/utils/last6Form';
import {
  importanceSeparation,
  importanceValueBand,
  problemSeparationLabel,
  sectorSeparationLabel,
} from '@/utils/importanceOf3Engine';
import { rankAfterWin, type StandingLike } from '@/utils/motivationEngine';
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

export const SECTOR_HIT = 6;
export const MARGIN_MID = 4;
export const Y_APPLICATION_VALUE = 0.5;
/** Eight core sectors, each worth at most 3. The two sides share this. */
export const CORE_POINTS_CAP = 24;
/** Five Y applications, each worth 0.5. The two sides share this. */
export const Y_POINTS_CAP = 2.5;
/** Core and Y together. */
export const MIX_POINTS_CAP = 26.5;
export const SEPARATION_AWARD = { clear: 3, mediocre: 1, poor: 0 } as const;
export const IMBANGI_TRUE_VALUE = 6;

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

export type MarginBandId = 'high' | 'mid' | 'low';

export type ComparedSector = {
  id: string;
  label: string;
  t1: number;
  t2: number;
  margin: number;
};

export type MarginBands = Record<MarginBandId, ComparedSector[]>;

export type SideMarginRead = {
  count: number;
  bands: MarginBands;
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
  calc2: {
    core: { t1: number; t2: number };
    y: { t1: number; t2: number };
    /** Core sectors plus Y applications. */
    t1: number;
    t2: number;
  };
  calc3: {
    t1: SideMarginRead;
    t2: SideMarginRead;
  };
  /** Last 5 fixture overview. Absent on a hand-built total. */
  last5?: Last5Overview | null;
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

/** Same tenth the screen prints, so a sector lands in the group the user sees. */
function shown(value: number): number {
  return Math.round(value * 10) / 10;
}

function emptyBands(): MarginBands {
  return { high: [], mid: [], low: [] };
}

function marginBand(margin: number): MarginBandId {
  if (margin >= SECTOR_HIT) return 'high';
  if (margin >= MARGIN_MID) return 'mid';
  return 'low';
}

function readBands(bands: MarginBands): SideMarginRead {
  return {
    count: bands.high.length + bands.mid.length + bands.low.length,
    bands,
  };
}

export type SeparationAward = {
  kind: 'clear' | 'mediocre' | 'poor';
  winner: SideId | null;
  points: number;
};

/** Core T1 against T2. The higher value wins. The points come from the separation, not the raw scores. */
export function coreSeparationAward(t1: number | null, t2: number | null): SeparationAward {
  const left = shown(num(t1));
  const right = shown(num(t2));
  const kind = importanceSeparation(importanceValueBand(left), importanceValueBand(right));
  const points = SEPARATION_AWARD[kind];
  if (points === 0 || left === right) return { kind, winner: null, points: 0 };
  return { kind, winner: left > right ? 't1' : 't2', points };
}

function awardBand(points: number): MarginBandId {
  if (points >= SEPARATION_AWARD.clear) return 'high';
  if (points >= SEPARATION_AWARD.mediocre) return 'mid';
  return 'low';
}

/** The winner keeps 3, 1, or 0. The other side is 0. Poor separation leaves both at 0. */
function applyCoreAwards(sectors: CalculationSector[]): CalculationSector[] {
  return sectors.map((row) => {
    const settled = num(row.t1) <= SEPARATION_AWARD.clear && num(row.t2) <= SEPARATION_AWARD.clear;
    if (row.group !== 'core' || (row.id === 'last5' && settled)) return row;
    const award = coreSeparationAward(row.t1, row.t2);
    return {
      ...row,
      t1: award.winner === 't1' ? award.points : 0,
      t2: award.winner === 't2' ? award.points : 0,
    };
  });
}

function sectorWins(sectors: CalculationSector[]): { t1: SideMarginRead; t2: SideMarginRead } {
  const t1 = emptyBands();
  const t2 = emptyBands();
  for (const row of sectors) {
    const left = shown(num(row.t1));
    const right = shown(num(row.t2));
    if (row.group === 'semi' || left === right) continue;
    const points = row.group === 'core' ? Math.max(left, right) : shown(Math.abs(left - right));
    if (points === 0) continue;
    const side = left > right ? t1 : t2;
    side[row.group === 'core' ? awardBand(points) : marginBand(points)].push({
      id: row.id,
      label: row.label,
      t1: left,
      t2: right,
      margin: points,
    });
  }
  return { t1: readBands(t1), t2: readBands(t2) };
}

function groupTotal(sectors: CalculationSector[], group: SectorGroup, side: SideId): number {
  return sectors.reduce((sum, row) => (row.group === group ? sum + num(row[side]) : sum), 0);
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
function imbangiValue(
  table: StandingLike[],
  teamId: number | null,
  rank: number | null,
  label: string,
): { value: number; detail: string } {
  if (rank === 1 || rank === 2) {
    return { value: IMBANGI_TRUE_VALUE, detail: `${label} is #${rank}` };
  }
  const landed = teamId != null ? rankAfterWin(table, teamId) : null;
  if (landed === 1 || landed === 2) {
    return {
      value: IMBANGI_TRUE_VALUE,
      detail: `${label} is #${rank ?? '—'}. A win lands them at #${landed}`,
    };
  }
  if (rank == null) return { value: 0, detail: `${label} is not on this table` };
  return { value: 0, detail: `${label} is #${rank}. A win leaves them outside #1 and #2` };
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
  const sectors = applyCoreAwards(opts.sectors);
  const hits = (side: SideId): SectorHit[] =>
    sectors
      .filter((row) => num(row[side]) >= SECTOR_HIT)
      .map((row) => ({ id: row.id, label: row.label, value: num(row[side]) }));
  const t1Hits = hits('t1');
  const t2Hits = hits('t2');
  const leader: SideId | 'level' =
    t1Hits.length === t2Hits.length ? 'level' : t1Hits.length > t2Hits.length ? 't1' : 't2';
  return {
    t1Yellow: opts.t1Yellow,
    t2Yellow: opts.t2Yellow,
    sectors,
    ticks: opts.ticks,
    calc1: { t1: t1Hits, t2: t2Hits, leader },
    calc2: {
      core: { t1: groupTotal(sectors, 'core', 't1'), t2: groupTotal(sectors, 'core', 't2') },
      y: { t1: groupTotal(sectors, 'y', 't1'), t2: groupTotal(sectors, 'y', 't2') },
      t1: groupTotal(sectors, 'core', 't1') + groupTotal(sectors, 'y', 't1'),
      t2: groupTotal(sectors, 'core', 't2') + groupTotal(sectors, 'y', 't2'),
    },
    calc3: sectorWins(sectors),
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
  const separationLine = (t1: number | null, t2: number | null) => {
    const label = sectorSeparationLabel(t1, t2);
    return label ? ` ${label}.` : '';
  };
  const problemLine = problemSeparationLabel(
    Math.max(input.problem.t1.level.score, input.problem.t2.level.score),
    false,
  );

  const homeId = pd.t1.venue === 'home' ? pd.t1.teamId : pd.t2.teamId;
  const last5Read =
    pd.t1.teamId == null || pd.t2.teamId == null
      ? null
      : last5LabelChanges({
          t1Id: pd.t1.teamId,
          t2Id: pd.t2.teamId,
          t1Label: pd.t1.label,
          t2Label: pd.t2.label,
          t1Results: resultsFromSeasonMatches(pd.t1.teamId, matches, standings),
          t2Results: resultsFromSeasonMatches(pd.t2.teamId, matches, standings),
          standings,
          mode: 'overall',
          fixtureHomeId: homeId,
        });
  const last5View =
    last5Read?.left && last5Read.right
      ? last5Overview(changeScalePlace(last5Read.left.hierarchy), changeScalePlace(last5Read.right.hierarchy))
      : null;
  const last5Scores = {
    t1: last5View?.winner === 't1' ? last5View.points : 0,
    t2: last5View?.winner === 't2' ? last5View.points : 0,
  };
  const formScores = scoresOnFormTable(pd, last6FormLeagueTable(standings, matches));
  const h2h = h2hGradeValues(
    input.h2hMatches,
    input.homeName,
    input.awayName,
    pd.t1.name,
    pd.t2.name,
    input.competitionName,
  );
  const imbangiT1 = imbangiValue(standings, pd.t1.teamId, pd.t1.rank, pd.t1.label);
  const imbangiT2 = imbangiValue(standings, pd.t2.teamId, pd.t2.rank, pd.t2.label);
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
      ? { value: Y_APPLICATION_VALUE, detail: `${droppedBy} is in a sudden drop, so ${receiver} receives 0.5. ${read}` }
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
      `${baselineDetail}${separationLine(pd.baselineGap.t1.score, pd.baselineGap.t2.score)}`,
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
      )}.${separationLine(importance.singaye1?.escape.score ?? 0, importance.singaye2?.escape.score ?? 0)}`,
    ),
    sector(
      'last5',
      'Last 5',
      'core',
      last5Scores,
      last5View?.detail ?? 'Last 5 has no change read yet.',
    ),
    sector(
      'form',
      'Form',
      'core',
      formScores,
      `Baseline from last-6 form places.${separationLine(formScores.t1, formScores.t2)}`,
    ),
    sector(
      'h2h',
      'H2H',
      'core',
      h2h.scores,
      `${h2h.detail}${separationLine(pd.baselineGap.t1.score, pd.baselineGap.t2.score)}`,
    ),
    sector(
      'problem_causer',
      'Problem causer',
      'core',
      { t1: input.problem.t1.level.score, t2: input.problem.t2.level.score },
      `${pd.t1.label} ${input.problem.t1.level.name} ${input.problem.t1.level.score} · ${pd.t2.label} ${input.problem.t2.level.name} ${input.problem.t2.level.score}. ${problemLine}.`,
    ),
    sector(
      'imbangi',
      'Imbangi',
      'core',
      { t1: imbangiT1.value, t2: imbangiT2.value },
      `${pd.t1.label}: ${imbangiT1.detail}. ${pd.t2.label}: ${imbangiT2.detail}.${separationLine(imbangiT1.value, imbangiT2.value)}`,
    ),
    sector(
      'home_away_strong',
      'Home/Away strong',
      'core',
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

  return { ...summariseSectorScores({ sectors, ticks, t1Yellow, t2Yellow }), last5: last5View };
}
