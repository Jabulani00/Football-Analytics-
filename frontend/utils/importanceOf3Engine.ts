/**
 * Importance of 3 points — Singaye model.
 *
 * Singaye is the side in the fixture (Singaye 1 = T1, Singaye 2 = T2).
 * Ahead is the team directly above. Tail is the team directly below.
 *
 * Take over: ahead.points − (singaye.points + 3).
 *   <= 0 Singaye takes over Ahead. > 0 Singaye is a chaser.
 * Dethrone: singaye.points − (tail.points + 3).
 *   <= 0 Tail dethrones Singaye. > 0 the dethrone comes short.
 * A gap of 4 or less, with a target position in the fight, is motivation.
 *
 * Escape element:
 *   comes short, no target relation        = 0
 *   comes short, motivation to dethrone    = 5
 *   dethrone, no target relation           = 4
 *   dethrone, target relation              = 10
 *
 * Pull factors (take over, chaser, gebe widening) each have seven kinds.
 * The kind equals 10, 8, 6, 4, 4, 2, or 0 from the pull-factor sheet.
 * Fewer games means 10 or fewer still to play. More than 10 is the other side.
 */

import type { SeasonMatch } from '@/utils/bhozomaEngine';
import { COMPETITION_ZONES, type ZoneKind, type ZoneRule } from '@/utils/competitionZones';
import {
  buildImbangiRows,
  imbangiGradeScore,
  IMBANGI_TIGHT_PTS,
  type ImbangiGrade,
  type ImbangiScheduleMatch,
} from '@/utils/imbangiEngine';
import {
  estimateRemainingMatches,
  MOTIVATION_GAP_MAX,
  type StandingLike,
} from '@/utils/motivationEngine';

export type TargetKind = 'number_1' | 'top_3' | 'cup' | 'relegation';

export type TargetBand = {
  label: string;
  kind: TargetKind;
  positions: number[];
};

export type PullFactorKind = 'take_over' | 'chaser' | 'gebe_widening';

/** More than this many games left is the sheet's "more than 10 games remaining". */
export const PULL_FEW_GAMES = 10;

export type PullRowIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** The seven kinds, same ladder for take over, chaser, and gebe widening. */
export const PULL_ROWS: { index: PullRowIndex; equals: number; detail: string }[] = [
  { index: 1, equals: 10, detail: 'Target attached + Imbangi + fewer games' },
  { index: 2, equals: 8, detail: 'Target attached + Imbangi' },
  { index: 3, equals: 6, detail: 'Target attached + fewer games' },
  { index: 4, equals: 4, detail: 'Target attached + non Imbangi + fewer games' },
  { index: 5, equals: 4, detail: 'Target attached + non Imbangi' },
  { index: 6, equals: 2, detail: 'No target + table hierarchy + fewer games' },
  { index: 7, equals: 0, detail: 'No target + table hierarchy + more than 10 games' },
];

export type PullPoint = {
  id: string;
  point: string;
  /** Figure written on this point: place, ΔP, or games left. */
  numberText: string;
  /** What that figure is on the sheet. */
  reading: string;
  /** Imbangi grade score when this point is an Imbangi effect. */
  equalsText: string;
  equalsValue: number | null;
};

export type PullFactorRead = {
  kind: PullFactorKind;
  index: PullRowIndex;
  /** Take over 1, Chaser 4, Gebe widening 2, and so on. */
  type: string;
  detail: string;
  /** What this kind equals on the pull-factor sheet. */
  equals: number;
  points: PullPoint[];
  /** Points Singaye currently holds over Tail. */
  gapNow: number | null;
  /** Same gap after Singaye is given +3. */
  gapAfterWin: number | null;
  /** Singaye is protecting a prize place or the safety spot. */
  widenMotivation: boolean;
};

export function pullRow(index: PullRowIndex) {
  const row = PULL_ROWS.find((item) => item.index === index);
  if (!row) return PULL_ROWS[0];
  return row;
}

/**
 * First matching kind on the sheet.
 * A checked wide gap is non Imbangi. No neighbour to check, with fewer games, is kind 3.
 */
export function matchPullRow(input: {
  targetAttached: boolean;
  imbangi: boolean | null;
  fewerGames: boolean;
}): PullRowIndex {
  const { targetAttached, imbangi, fewerGames } = input;
  if (!targetAttached) return fewerGames ? 6 : 7;
  if (imbangi === true) return fewerGames ? 1 : 2;
  if (fewerGames && imbangi === null) return 3;
  if (fewerGames) return 4;
  return 5;
}

export type EscapeScore = 0 | 4 | 5 | 10;

export type RelegationRead = 'escaping' | 'safety' | 'clear' | 'unknown';

export type ImbangiFit = {
  opponentName: string;
  pointsDiff: number;
  /** ΔP is inside the Imbangi range (4 or less). */
  fits: boolean;
  grade: ImbangiGrade | null;
  score: number | null;
  reason: string | null;
  /** Last-game grade is still waiting on the season fixtures. */
  pending: boolean;
};

export type SingayeRead = {
  slot: 1 | 2;
  team: StandingLike;
  ahead: StandingLike | null;
  tail: StandingLike | null;
  /** Labels of target positions this rank sits in. */
  targetsHeld: string[];
  remaining: number;
  takeover: {
    diff: number | null;
    verdict: 'take_over' | 'chaser' | 'none';
    aheadTargets: string[];
    /** Ahead sits in a target and the gap after +3 is 4 or less. */
    motivated: boolean;
  };
  dethrone: {
    diff: number | null;
    verdict: 'dethrone' | 'comes_short' | 'none';
    /** Gap is 4 or less and a target (or the relegation line) is in the fight. */
    motivated: boolean;
    /** Singaye or Tail sits on a target, the drop, or the safety spot. */
    targetInFight: boolean;
    tailTargets: string[];
    relationLabels: string[];
  };
  escape: {
    score: EscapeScore | null;
    relegation: RelegationRead;
    /** First relegation place, when the league has one on file. */
    relegationLine: number | null;
  };
  pull: PullFactorRead;
  imbangiAhead: ImbangiFit | null;
  imbangiTail: ImbangiFit | null;
};

export type ImportanceOf3 = {
  targets: TargetBand[];
  /** True when cup and relegation spots are not on file for this league. */
  zonesMapped: boolean;
  relegationLine: number | null;
  singaye1: SingayeRead | null;
  singaye2: SingayeRead | null;
};

const CUP_KINDS: ZoneKind[] = [
  'continentalTop',
  'continentalTopQual',
  'continentalSecond',
  'continentalThird',
];

type TargetMark = { position: number; label: string; kind: TargetKind };

function isTopAnchored(r: ZoneRule): r is ZoneRule & { from: number; to: number } {
  return (r as { from?: number }).from !== undefined;
}

function pushMark(marks: TargetMark[], position: number, total: number, label: string, kind: TargetKind) {
  if (position < 1 || position > total) return;
  if (marks.some((m) => m.position === position && m.label === label)) return;
  marks.push({ position, label, kind });
}

/** Places teams are fighting to enter or running away from. */
export function targetMarksFor(
  competitionId: number | string | null | undefined,
  totalTeams: number,
): { marks: TargetMark[]; zonesMapped: boolean; relegationLine: number | null } {
  const marks: TargetMark[] = [];
  if (totalTeams >= 1) pushMark(marks, 1, totalTeams, 'Number 1', 'number_1');
  for (let p = 1; p <= Math.min(3, totalTeams); p++) {
    pushMark(marks, p, totalTeams, 'Top 3', 'top_3');
  }

  const rules = competitionId != null ? COMPETITION_ZONES[Number(competitionId)] : undefined;
  const zonesMapped = !!rules && rules.length > 0;
  if (rules) {
    for (const rule of rules) {
      if (CUP_KINDS.includes(rule.kind) && isTopAnchored(rule)) {
        for (let p = rule.from; p <= rule.to; p++) {
          pushMark(marks, p, totalTeams, rule.label, 'cup');
        }
      }
      if ((rule.kind === 'relegation' || rule.kind === 'relegationPlayoff') && !isTopAnchored(rule)) {
        const start = totalTeams - rule.fromBottom + 1;
        const end = totalTeams - rule.toBottom + 1;
        const lo = Math.min(start, end);
        const hi = Math.max(start, end);
        for (let p = lo; p <= hi; p++) {
          pushMark(marks, p, totalTeams, rule.label, 'relegation');
        }
      }
    }
  }

  const relegationPositions = marks.filter((m) => m.kind === 'relegation').map((m) => m.position);
  const relegationLine = relegationPositions.length > 0 ? Math.min(...relegationPositions) : null;
  return { marks, zonesMapped, relegationLine };
}

export function targetBandsFrom(marks: TargetMark[]): TargetBand[] {
  const bands: TargetBand[] = [];
  for (const mark of marks) {
    const existing = bands.find((b) => b.label === mark.label && b.kind === mark.kind);
    if (existing) {
      if (!existing.positions.includes(mark.position)) existing.positions.push(mark.position);
    } else {
      bands.push({ label: mark.label, kind: mark.kind, positions: [mark.position] });
    }
  }
  for (const band of bands) band.positions.sort((a, b) => a - b);
  return bands;
}

export function formatPositionList(positions: number[]): string {
  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = cur;
    prev = cur;
  }
  return parts.join(', ');
}

function labelsAt(marks: TargetMark[], position: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const mark of marks) {
    if (mark.position !== position || seen.has(mark.label)) continue;
    seen.add(mark.label);
    out.push(mark.label);
  }
  return out;
}

export function takeoverDiff(aheadPoints: number, singayePoints: number): number {
  return aheadPoints - (singayePoints + 3);
}

export function dethroneDiff(singayePoints: number, tailPoints: number): number {
  return singayePoints - (tailPoints + 3);
}

export function escapeScoreFor(verdict: 'dethrone' | 'comes_short', related: boolean): EscapeScore {
  if (verdict === 'comes_short') return related ? 5 : 0;
  return related ? 10 : 4;
}

function relegationRead(rank: number, line: number | null): RelegationRead {
  if (line == null) return 'unknown';
  if (rank >= line) return 'escaping';
  if (rank === line - 1) return 'safety';
  return 'clear';
}

function byRank(rows: StandingLike[]): Map<number, StandingLike> {
  const map = new Map<number, StandingLike>();
  for (const row of rows) map.set(row.rank, row);
  return map;
}

function positionRelated(
  rank: number,
  marks: TargetMark[],
  relegationLine: number | null,
): boolean {
  if (labelsAt(marks, rank).length > 0) return true;
  if (relegationLine == null) return false;
  return rank === relegationLine - 1 || rank >= relegationLine;
}

function fitFromRow(
  opponent: StandingLike,
  pointsDiff: number,
  formReady: boolean,
  grade: ImbangiGrade | null,
  reason: string | null,
): ImbangiFit {
  const fits = pointsDiff <= IMBANGI_TIGHT_PTS;
  if (!formReady) {
    return {
      opponentName: opponent.name,
      pointsDiff,
      fits,
      grade: null,
      score: null,
      reason: null,
      pending: true,
    };
  }
  return {
    opponentName: opponent.name,
    pointsDiff,
    fits,
    grade: fits ? grade : null,
    score: fits ? imbangiGradeScore(grade) : null,
    reason: fits ? reason : null,
    pending: false,
  };
}

function pullTypeLabel(kind: PullFactorKind, index: PullRowIndex): string {
  return `${PULL_FACTOR_LABEL[kind]} ${index}`;
}

function imbangiPoint(fit: ImbangiFit | null): PullPoint {
  if (!fit) {
    return {
      id: 'imbangi',
      point: 'Imbangi',
      numberText: '—',
      reading: 'No neighbour to check',
      equalsText: '—',
      equalsValue: null,
    };
  }
  if (!fit.fits) {
    return {
      id: 'imbangi',
      point: 'Imbangi',
      numberText: `ΔP ${fit.pointsDiff}`,
      reading: 'Non Imbangi',
      equalsText: '—',
      equalsValue: null,
    };
  }
  const gradeEquals = fit.score;
  return {
    id: 'imbangi',
    point: 'Imbangi',
    numberText: `ΔP ${fit.pointsDiff}`,
    reading: fit.pending ? 'Imbangi effect' : `Imbangi effect${fit.grade ? ` · ${fit.grade}` : ''}`,
    equalsText: gradeEquals == null ? '—' : String(gradeEquals),
    equalsValue: gradeEquals,
  };
}

function buildPullFactor(input: {
  kind: PullFactorKind;
  targetAttached: boolean;
  targetNumber: string;
  targetReading: string;
  imbangiFit: ImbangiFit | null;
  remaining: number;
  gapNow: number | null;
  gapAfterWin: number | null;
  widenMotivation: boolean;
}): PullFactorRead {
  const fewerGames = input.remaining <= PULL_FEW_GAMES;
  const imbangi = input.imbangiFit == null ? null : input.imbangiFit.fits;
  const index = matchPullRow({
    targetAttached: input.targetAttached,
    imbangi,
    fewerGames,
  });
  const row = pullRow(index);
  const gamesPoint: PullPoint = {
    id: 'games',
    point: 'Games remaining',
    numberText: String(input.remaining),
    reading: fewerGames ? 'Fewer games remaining' : 'More than 10 games remaining',
    equalsText: '—',
    equalsValue: null,
  };
  const targetPoint: PullPoint = {
    id: 'target',
    point: 'Target position',
    numberText: input.targetNumber,
    reading: input.targetReading,
    equalsText: '—',
    equalsValue: null,
  };
  return {
    kind: input.kind,
    index,
    type: pullTypeLabel(input.kind, index),
    detail: row.detail,
    equals: row.equals,
    points: [targetPoint, imbangiPoint(input.imbangiFit), gamesPoint],
    gapNow: input.gapNow,
    gapAfterWin: input.gapAfterWin,
    widenMotivation: input.widenMotivation,
  };
}

function readSingaye(
  slot: 1 | 2,
  team: StandingLike,
  table: StandingLike[],
  marks: TargetMark[],
  relegationLine: number | null,
  seasonProgress: number | null | undefined,
  imbangiRows: ReturnType<typeof buildImbangiRows>,
  formReady: boolean,
): SingayeRead {
  const rankMap = byRank(table);
  const ahead = rankMap.get(team.rank - 1) ?? null;
  const tail = rankMap.get(team.rank + 1) ?? null;
  const targetsHeld = labelsAt(marks, team.rank);
  const aheadTargets = ahead ? labelsAt(marks, ahead.rank) : [];

  const takeDiff = ahead ? takeoverDiff(ahead.points, team.points) : null;
  const takeVerdict: SingayeRead['takeover']['verdict'] =
    takeDiff == null ? 'none' : takeDiff <= 0 ? 'take_over' : 'chaser';
  const takeMotivated = ahead != null && aheadTargets.length > 0 && takeDiff != null && takeDiff <= MOTIVATION_GAP_MAX;

  const dethDiff = tail ? dethroneDiff(team.points, tail.points) : null;
  const dethVerdict: SingayeRead['dethrone']['verdict'] =
    dethDiff == null ? 'none' : dethDiff <= 0 ? 'dethrone' : 'comes_short';
  const singayeRelated = positionRelated(team.rank, marks, relegationLine);
  const tailRelated = tail != null && positionRelated(tail.rank, marks, relegationLine);
  const targetInFight = singayeRelated || tailRelated;
  const dethMotivated = dethDiff != null && dethDiff <= MOTIVATION_GAP_MAX && targetInFight;
  const tailTargets = tail ? labelsAt(marks, tail.rank) : [];
  if (tail && relegationRead(tail.rank, relegationLine) === 'safety' && !tailTargets.includes('Relegation safety')) {
    tailTargets.push('Relegation safety');
  }
  const relationLabels = [...targetsHeld, ...tailTargets].filter(
    (label, index, all) => all.indexOf(label) === index,
  );
  if (relegationRead(team.rank, relegationLine) === 'safety' && !relationLabels.includes('Relegation safety')) {
    relationLabels.push('Relegation safety');
  }

  const escapeScore = dethVerdict === 'none' ? null : escapeScoreFor(dethVerdict, dethMotivated);

  const prize =
    targetsHeld.some((label) => label !== 'Relegation' && !label.toLowerCase().includes('relegation')) ||
    relegationRead(team.rank, relegationLine) === 'safety' ||
    team.rank === 1;
  const gapNow = tail ? team.points - tail.points : null;
  const gapAfterWin = tail ? team.points + 3 - tail.points : null;

  const pullKind: PullFactorKind =
    takeVerdict === 'take_over' ? 'take_over' : takeVerdict === 'chaser' ? 'chaser' : 'gebe_widening';

  const aheadRow = imbangiRows.find((row) => row.teamId === team.teamId && row.relation === 'above');
  const tailRow = imbangiRows.find((row) => row.teamId === team.teamId && row.relation === 'below');
  const imbangiAhead = ahead
    ? fitFromRow(
        ahead,
        aheadRow?.pointsDiff ?? Math.abs(team.points - ahead.points),
        formReady,
        aheadRow?.grade ?? null,
        aheadRow?.gradeReason ?? null,
      )
    : null;
  const imbangiTail = tail
    ? fitFromRow(
        tail,
        tailRow?.pointsDiff ?? Math.abs(team.points - tail.points),
        formReady,
        tailRow?.grade ?? null,
        tailRow?.gradeReason ?? null,
      )
    : null;

  const targetAttached =
    pullKind === 'gebe_widening'
      ? targetsHeld.length > 0 || relegationRead(team.rank, relegationLine) === 'safety' || relegationRead(team.rank, relegationLine) === 'escaping'
      : aheadTargets.length > 0;
  const targetLabels = pullKind === 'gebe_widening' ? targetsHeld : aheadTargets;
  const targetRank = pullKind === 'gebe_widening' ? team.rank : ahead?.rank;
  const pull = buildPullFactor({
    kind: pullKind,
    targetAttached,
    targetNumber: targetRank != null ? `#${targetRank}` : '—',
    targetReading: targetAttached
      ? `Target attached${targetLabels.length > 0 ? ` · ${targetLabels.join(', ')}` : ''}`
      : 'No target attached',
    imbangiFit: pullKind === 'gebe_widening' ? imbangiTail : imbangiAhead,
    remaining: estimateRemainingMatches(team, table, seasonProgress),
    gapNow,
    gapAfterWin,
    widenMotivation: tail != null && prize,
  });

  return {
    slot,
    team,
    ahead,
    tail,
    targetsHeld,
    remaining: estimateRemainingMatches(team, table, seasonProgress),
    takeover: {
      diff: takeDiff,
      verdict: takeVerdict,
      aheadTargets,
      motivated: takeMotivated,
    },
    dethrone: {
      diff: dethDiff,
      verdict: dethVerdict,
      motivated: dethMotivated,
      targetInFight,
      tailTargets,
      relationLabels: dethMotivated ? relationLabels : [],
    },
    escape: {
      score: escapeScore,
      relegation: relegationRead(team.rank, relegationLine),
      relegationLine,
    },
    pull,
    imbangiAhead,
    imbangiTail,
  };
}

export function evaluateImportanceOf3(input: {
  table: StandingLike[];
  t1Id: number | null | undefined;
  t2Id: number | null | undefined;
  competitionId?: number | string | null;
  seasonProgress?: number | null;
  matches?: SeasonMatch[];
  schedule?: ImbangiScheduleMatch[];
  /** When false, Imbangi shows the points gap only — last-game grade waits. */
  formReady?: boolean;
}): ImportanceOf3 {
  const table = input.table;
  const { marks, zonesMapped, relegationLine } = targetMarksFor(input.competitionId ?? null, table.length);
  const formReady = input.formReady !== false;
  const imbangiRows = formReady
    ? buildImbangiRows(table, input.matches ?? [], input.seasonProgress, input.schedule ?? [])
    : [];

  const read = (slot: 1 | 2, teamId: number | null | undefined): SingayeRead | null => {
    if (teamId == null) return null;
    const team = table.find((row) => row.teamId === teamId);
    if (!team) return null;
    return readSingaye(slot, team, table, marks, relegationLine, input.seasonProgress, imbangiRows, formReady);
  };

  return {
    targets: targetBandsFrom(marks),
    zonesMapped,
    relegationLine,
    singaye1: read(1, input.t1Id),
    singaye2: read(2, input.t2Id),
  };
}

export const PULL_FACTOR_LABEL: Record<PullFactorKind, string> = {
  take_over: 'Take over',
  chaser: 'Chaser',
  gebe_widening: 'Gebe widening',
};
