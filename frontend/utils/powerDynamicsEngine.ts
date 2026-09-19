/**
 * Power dynamics sectors — T1 (home) vs T2 (away).
 * Rules from PDF_POWER_DYNAMICS_NOTES.md + PDF_INTEGRATION_BREAKDOWN.md.
 */

import {
  evaluateTeamMotivation,
  type StandingLike,
  type TeamMotivation,
} from '@/utils/motivationEngine';
import { contestedLeagueTop } from '@/utils/separatorTools';
import { leagueProgressInfo } from '@/utils/imbangiEngine';
import {
  filterScope,
  lastN,
  type ResultOutcome,
  type TeamResult,
} from '@/utils/teamResults';
import { h2hOutcomeForTeam, teamsMatch } from '@/utils/h2hDisplay';
import type { H2HMatch, OddsByMarket } from '@/services/oddAlerts';

export type SideId = 't1' | 't2';
export type TableColour = 'green' | 'yellow' | 'red';
export type PpgBand = 'bad' | 'mild' | 'good' | 'great' | 'great_against';
export type Tone = 'good' | 'warn' | 'bad' | 'info';

export type ScopeRecord = {
  mp: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  ppg: number | null;
  /** Points given to opponents per game: (3L + D) / MP. */
  ppga: number | null;
  scored: number | null;
  conceded: number | null;
};

export type LastGameFlag = {
  id: string;
  label: string;
  active: boolean;
  blocked?: boolean;
};

export type SideSnapshot = {
  side: SideId;
  /** Fixture venue — not the T1/T2 identity. */
  venue: 'home' | 'away';
  teamId: number | null;
  name: string;
  label: string;
  rank: number | null;
  points: number | null;
  goalDiff: number | null;
  goalsFor: number | null;
  zone: 'top' | 'mid' | 'bottom' | null;
  colour: TableColour | null;
  overall: ScopeRecord;
  home: ScopeRecord;
  away: ScopeRecord;
  vsAbove: ScopeRecord;
  vsBelow: ScopeRecord;
  vsTopThird: ScopeRecord;
  vsBottomThird: ScopeRecord;
};

export type ColourSideRead = {
  colour: TableColour | null;
  ppg: number | null;
  band: PpgBand | null;
  aligns: boolean | null;
  mshayi: string | null;
  lossesVsPositive: string;
  types: { key: string; label: string; ppg: number | null }[];
};

export type VenueRead = {
  homeStrong: boolean;
  awayStrong: boolean;
  homePpg: number | null;
  awayPpg: number | null;
  overallPpg: number | null;
  detail: string;
};

export type CharacterSide = {
  split: boolean;
  homeAwayGap: number | null;
  original: string;
  other: string;
};

export type ShowRead = {
  yellow: boolean;
  strongShow: string;
  weakShow: string;
  vsAbovePct: number | null;
  vsBelowPct: number | null;
  vsAboveMp: number;
  vsBelowMp: number;
};

export type StreakSide = {
  current: number;
  sequence: string;
  neverTwice: boolean;
  last10: string;
};

export type SwingScope = {
  scope: 'overall' | 'home' | 'away';
  recent: number | null;
  prior: number | null;
  drop: boolean;
  rise: boolean;
  detail: string;
};

export type ChildBeaterSide = {
  method1: string | null;
  method2: string | null;
};

/** SKM page 3 original six types (A strongest … F weakest). */
export type BaselineLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export type BaselineSideGap = {
  letter: BaselineLetter | null;
  recode: BaselineLetter | null;
  meaning: string;
  /** Raw strength on the A=10 … F=0 ladder (what the side received). */
  received: number | null;
  /** Fixture gap: 0 for the weaker / level side, 1–10 for the stronger. */
  score: number | null;
};

export type BaselineGap = {
  t1: BaselineSideGap;
  t2: BaselineSideGap;
  pair: string | null;
  /** |received T1 − received T2| — 0, 2, 4, 6, 8 or 10. */
  separation: number | null;
  /** Gr 1 (max gap) … Gr 6 (none). */
  grade: number | null;
  stronger: SideId | 'level' | null;
  /** Notes: command Gr 3 and up (separation ≥ 6). */
  supports: boolean;
  leagueAvgPpg: number | null;
  call: string;
};

export type PowerDynamicsBundle = {
  t1: SideSnapshot;
  t2: SideSnapshot;
  pointsDiff: number | null;
  closeOnTable: boolean;
  underdog: SideId | 'level' | null;
  baselineGap: BaselineGap;
  /** Table-position gap (1–N scale). Used by the Gap analysis tab. */
  positionGap: PositionGap;
  colour: { t1: ColourSideRead; t2: ColourSideRead; whoFacesWho: string };
  venue: { t1: VenueRead; t2: VenueRead; call: string };
  character: { t1: CharacterSide; t2: CharacterSide };
  middle: { t1: ShowRead; t2: ShowRead };
  indlela: { t1: string[]; t2: string[]; counterpart: string; yellow: boolean };
  streaks: {
    win: { t1: StreakSide; t2: StreakSide };
    loss: { t1: StreakSide; t2: StreakSide };
  };
  swing: { t1: SwingScope[]; t2: SwingScope[] };
  childBeater: { t1: ChildBeaterSide; t2: ChildBeaterSide };
  struggle: { t1: string; t2: string; t1Fight: boolean; t2Fight: boolean };
  contested: { flag: ReturnType<typeof contestedLeagueTop>; t1InPack: boolean; t2InPack: boolean };
  lastGame: { t1: LastGameFlag[]; t2: LastGameFlag[] };
  competition: {
    progress: ReturnType<typeof leagueProgressInfo>;
    t1: TeamMotivation | null;
    t2: TeamMotivation | null;
  };
  streamline: StreamlineRead;
};

export const STREAMLINE_CLOSE_MAX = 4;
export const STREAMLINE_FAR_MIN = 4.1;

export type StreamName = 'bateteme' | 'zidane_law' | 'bookie';
export type OddsOutcome = 'compliant' | 'non_compliant';

export const STREAM_LABEL: Record<StreamName, string> = {
  bateteme: 'Bateteme stream',
  zidane_law: 'Zidane Law',
  bookie: 'Bookie mistake',
};

export const STREAM_ROLE: Record<StreamName, string> = {
  bateteme: 'Close — ΔP ≤ 4',
  zidane_law: 'T1 has never beaten T2',
  bookie: 'T2 does beat T1, while stats say T1 has never beaten T2',
};

export type StreamlineRead = {
  t1Points: number | null;
  t2Points: number | null;
  /** T1 points − T2 points (T1 has more points). */
  delta: number | null;
  close: boolean;
  far: boolean;
  t1Stream: StreamName | null;
  t2Stream: StreamName | null;
  t1Ppg: number | null;
  t2Ppg: number | null;
  t1Odds: number | null;
  t2Odds: number | null;
  t1PpgHigh: boolean;
  oddsOutcome: OddsOutcome | null;
  h2hMeetings: number;
  t1H2hWins: number;
  t2H2hWins: number;
  t1NeverBeatenT2: boolean;
  t2BeatsT1: boolean;
  oddsCall: string;
  call: string;
};

export type PositionGap = {
  tableSize: number;
  t1Rank: number | null;
  t2Rank: number | null;
  /** Inclusive count of table places from T1 to T2. */
  span: number | null;
  /** 1 = largest gap (full table). Higher = closer on the table. */
  gradeIndex: number | null;
  /** G{gradeIndex}. */
  grade: string | null;
  from: number | null;
  to: number | null;
  higher: SideId | 'level' | null;
  call: string;
};

function rankOrNull(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v) || v < 1) return null;
  return Math.trunc(v);
}

/**
 * Gap analysis on the live table. G1 is the largest gap (place 1 through N).
 * Closer sides get G2, G3, … up to G{N-1} for neighbours.
 */
export type PositionGapGradeRow = {
  grade: string;
  gradeIndex: number;
  /** Inclusive places covered by this grade. */
  span: number;
};

/** G1…G{N-1} for a league of N teams. G1 covers the full table. */
export function positionGapScale(tableSize: number): PositionGapGradeRow[] {
  const n = Math.max(0, Math.trunc(tableSize));
  if (n < 2) return [];
  const rows: PositionGapGradeRow[] = [];
  for (let gradeIndex = 1; gradeIndex <= n - 1; gradeIndex++) {
    rows.push({
      grade: `G${gradeIndex}`,
      gradeIndex,
      span: n - gradeIndex + 1,
    });
  }
  return rows;
}

export function evaluatePositionGap(opts: {
  tableSize: number;
  t1Rank: number | null | undefined;
  t2Rank: number | null | undefined;
  t1Label: string;
  t2Label: string;
}): PositionGap {
  const tableSize = Math.max(0, Math.trunc(opts.tableSize));
  const t1Rank = rankOrNull(opts.t1Rank);
  const t2Rank = rankOrNull(opts.t2Rank);
  const empty: PositionGap = {
    tableSize,
    t1Rank,
    t2Rank,
    span: null,
    gradeIndex: null,
    grade: null,
    from: null,
    to: null,
    higher: null,
    call: 'Need both ranks on the table to run gap analysis.',
  };
  if (tableSize < 2) {
    return { ...empty, call: 'Need a full table to set the gap scale.' };
  }
  if (t1Rank == null || t2Rank == null) {
    return {
      ...empty,
      call: 'Need both ranks on the table to run gap analysis.',
    };
  }

  const from = Math.min(t1Rank, t2Rank);
  const to = Math.max(t1Rank, t2Rank);
  const span = to - from + 1;
  const gradeIndex = tableSize - span + 1;
  const grade = `G${gradeIndex}`;
  let higher: SideId | 'level' = 'level';
  if (t1Rank < t2Rank) higher = 't1';
  else if (t2Rank < t1Rank) higher = 't2';

  return {
    tableSize,
    t1Rank,
    t2Rank,
    span,
    gradeIndex,
    grade,
    from,
    to,
    higher,
    call: grade,
  };
}

export function h2hMeetingsForSides(
  matches: H2HMatch[],
  t1Name: string,
  t2Name: string,
): H2HMatch[] {
  return matches.filter((m) => {
    const a = teamsMatch(m.home_name, t1Name) || teamsMatch(m.away_name, t1Name);
    const b = teamsMatch(m.home_name, t2Name) || teamsMatch(m.away_name, t2Name);
    return a && b;
  });
}

export function countH2hWins(matches: H2HMatch[], teamName: string): number {
  return matches.filter((m) => h2hOutcomeForTeam(m, teamName) === 'W').length;
}

function ftOdds(odds: OddsByMarket | undefined, venue: 'home' | 'away'): number | null {
  const n = odds?.ft_result?.[venue];
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export function evaluateStreamline(opts: {
  t1Points: number | null;
  t2Points: number | null;
  t1Label: string;
  t2Label: string;
  t1Ppg?: number | null;
  t2Ppg?: number | null;
  t1Odds?: number | null;
  t2Odds?: number | null;
  h2hMeetings?: number;
  t1H2hWins?: number;
  t2H2hWins?: number;
}): StreamlineRead {
  const t1Points = opts.t1Points;
  const t2Points = opts.t2Points;
  const t1Label = opts.t1Label;
  const t2Label = opts.t2Label;
  const t1Ppg = opts.t1Ppg ?? null;
  const t2Ppg = opts.t2Ppg ?? null;
  const t1Odds = opts.t1Odds ?? null;
  const t2Odds = opts.t2Odds ?? null;
  const h2hMeetings = opts.h2hMeetings ?? 0;
  const t1H2hWins = opts.t1H2hWins ?? 0;
  const t2H2hWins = opts.t2H2hWins ?? 0;
  const delta = t1Points != null && t2Points != null ? t1Points - t2Points : null;
  const close = delta != null && delta <= STREAMLINE_CLOSE_MAX;
  const far = delta != null && delta >= STREAMLINE_FAR_MIN;
  const t1NeverBeatenT2 = h2hMeetings > 0 && t1H2hWins === 0;
  const t2BeatsT1 = h2hMeetings > 0 && t2H2hWins > 0;
  const t1PpgHigh = t1Ppg != null && t2Ppg != null && t1Ppg > t2Ppg;

  let oddsOutcome: OddsOutcome | null = null;
  let oddsCall: string;
  if (!t1PpgHigh) {
    oddsCall =
      t1Ppg != null && t2Ppg != null
        ? `T1 PPG ${t1Ppg.toFixed(2)} is not higher than T2 ${t2Ppg.toFixed(2)}, so the high-PPG odds check does not apply.`
        : 'Need both sides\' PPG to check odds compliance.';
  } else if (t1Odds == null || t2Odds == null) {
    oddsCall = `T1 PPG ${t1Ppg!.toFixed(2)} is higher than T2 ${t2Ppg!.toFixed(2)}, so T1 odds should be lower. Need 1X2 odds to score compliant vs non-compliant.`;
  } else if (t1Odds < t2Odds) {
    oddsOutcome = 'compliant';
    oddsCall = `T1 PPG ${t1Ppg!.toFixed(2)} vs T2 ${t2Ppg!.toFixed(2)} — T1 odds ${t1Odds} < T2 ${t2Odds}. Compliant.`;
  } else {
    oddsOutcome = 'non_compliant';
    oddsCall = `T1 PPG ${t1Ppg!.toFixed(2)} vs T2 ${t2Ppg!.toFixed(2)} — expected T1 odds lower, got T1 ${t1Odds} vs T2 ${t2Odds}. Non-compliant.`;
  }

  const empty = (call: string, t1Stream: StreamName | null, t2Stream: StreamName | null): StreamlineRead => ({
    t1Points,
    t2Points,
    delta,
    close,
    far,
    t1Stream,
    t2Stream,
    t1Ppg,
    t2Ppg,
    t1Odds,
    t2Odds,
    t1PpgHigh,
    oddsOutcome,
    h2hMeetings,
    t1H2hWins,
    t2H2hWins,
    t1NeverBeatenT2,
    t2BeatsT1,
    oddsCall,
    call,
  });

  if (delta == null) {
    return empty('Need both sides on the table to run Streamline (T1 pts − T2 pts).', null, null);
  }

  if (t1NeverBeatenT2 && t2BeatsT1) {
    return empty(
      `Bookie mistake — ${t2Label} does beat ${t1Label}, but H2H stats still say ${t1Label} has never beaten ${t2Label} (${h2hMeetings} meetings, T1 ${t1H2hWins}W / T2 ${t2H2hWins}W).`,
      'bookie',
      'bookie',
    );
  }

  if (t1NeverBeatenT2) {
    return empty(
      `Zidane Law — ${t1Label} has never beaten ${t2Label} (${h2hMeetings} meetings, T1 ${t1H2hWins}W / T2 ${t2H2hWins}W).`,
      'zidane_law',
      'zidane_law',
    );
  }

  if (close) {
    return empty(
      `${t1Label} − ${t2Label} = ${delta} pts (≤ 4). Both sides sit in Bateteme stream.`,
      'bateteme',
      'bateteme',
    );
  }

  return empty(
    `${t1Label} − ${t2Label} = ${delta} pts. No Zidane Law / Bookie mistake in H2H (T1 has beaten T2).`,
    null,
    null,
  );
}

const VENUE_GAP = 0.3;
const CLOSE_PTS = 4;

/** A=10 … F=0 — degrees of separation on the baseline ladder. */
export const BASELINE_LETTER_STRENGTH: Record<BaselineLetter, number> = {
  A: 10,
  B: 8,
  C: 6,
  D: 4,
  E: 2,
  F: 0,
};

export const BASELINE_LETTER_MEANING: Record<BaselineLetter, string> = {
  A: 'Strong + above average',
  B: 'Strong + below average',
  C: 'Balanced + above average',
  D: 'Balanced + below average',
  E: 'Weak + above average',
  F: 'Weak + below average',
};

/** Page 3 purple recode of the six types. */
export const BASELINE_RECODE: Record<BaselineLetter, BaselineLetter> = {
  A: 'A',
  B: 'C',
  C: 'B',
  D: 'E',
  E: 'D',
  F: 'F',
};

export function leagueAvgPpg(table: StandingLike[]): number | null {
  let sum = 0;
  let n = 0;
  for (const r of table) {
    if (r.played <= 0) continue;
    sum += r.points / r.played;
    n += 1;
  }
  return n > 0 ? sum / n : null;
}

function strengthBand(
  zone: 'top' | 'mid' | 'bottom' | null,
  ppg: number | null,
  avg: number | null,
): 'strong' | 'balanced' | 'weak' | null {
  if (zone === 'top') return 'strong';
  if (zone === 'mid') return 'balanced';
  if (zone === 'bottom') return 'weak';
  if (ppg == null || avg == null) return null;
  if (ppg >= avg + 0.35) return 'strong';
  if (ppg <= avg - 0.35) return 'weak';
  return 'balanced';
}

export function classifyBaselineLetter(
  zone: 'top' | 'mid' | 'bottom' | null,
  ppg: number | null,
  avg: number | null,
): BaselineLetter | null {
  const band = strengthBand(zone, ppg, avg);
  if (band == null || ppg == null || avg == null) return null;
  const above = ppg >= avg;
  if (band === 'strong') return above ? 'A' : 'B';
  if (band === 'balanced') return above ? 'C' : 'D';
  return above ? 'E' : 'F';
}

export function separationGrade(separation: number): number {
  if (separation >= 10) return 1;
  if (separation >= 8) return 2;
  if (separation >= 6) return 3;
  if (separation >= 4) return 4;
  if (separation >= 2) return 5;
  return 6;
}

function emptyBaselineSide(): BaselineSideGap {
  return {
    letter: null,
    recode: null,
    meaning: 'Need table PPG to grade baseline',
    received: null,
    score: null,
  };
}

export function baselineGapFor(t1: SideSnapshot, t2: SideSnapshot, table: StandingLike[]): BaselineGap {
  const avg = leagueAvgPpg(table);
  const letter1 = classifyBaselineLetter(t1.zone, t1.overall.ppg, avg);
  const letter2 = classifyBaselineLetter(t2.zone, t2.overall.ppg, avg);

  const side = (letter: BaselineLetter | null): BaselineSideGap => {
    if (!letter) return emptyBaselineSide();
    return {
      letter,
      recode: BASELINE_RECODE[letter],
      meaning: BASELINE_LETTER_MEANING[letter],
      received: BASELINE_LETTER_STRENGTH[letter],
      score: null,
    };
  };

  const s1 = side(letter1);
  const s2 = side(letter2);

  if (s1.received == null || s2.received == null) {
    return {
      t1: s1,
      t2: s2,
      pair: null,
      separation: null,
      grade: null,
      stronger: null,
      supports: false,
      leagueAvgPpg: avg,
      call: 'Need both sides on the table with PPG to score the baseline gap.',
    };
  }

  const separation = Math.abs(s1.received - s2.received);
  const grade = separationGrade(separation);
  let stronger: SideId | 'level' = 'level';
  if (s1.received > s2.received) stronger = 't1';
  else if (s2.received > s1.received) stronger = 't2';

  s1.score = stronger === 't1' ? separation : 0;
  s2.score = stronger === 't2' ? separation : 0;

  const pair = `${letter1}${letter2}`;
  const supports = separation >= 6;
  const strongLabel = stronger === 't1' ? t1.label : stronger === 't2' ? t2.label : null;
  let call: string;
  if (stronger === 'level') {
    call = `Same baseline type (${letter1}) — gap 0, no separation.`;
  } else {
    call = `${strongLabel} leads ${separation}/10 on baseline strength (${pair}, Gr ${grade})${
      supports ? ' — Gr 3+ so this gap can support a call' : ''
    }.`;
  }

  return {
    t1: s1,
    t2: s2,
    pair,
    separation,
    grade,
    stronger,
    supports,
    leagueAvgPpg: avg,
    call,
  };
}

export function sideLabel(side: SideId, name: string): string {
  return side === 't1' ? `T1 (${name})` : `T2 (${name})`;
}

export function venueWord(venue: 'home' | 'away'): string {
  return venue === 'home' ? 'Home' : 'Away';
}

/** League-table keys used to pick T1 (better side) vs T2. */
export type TableOrderKeys = {
  points?: number | null;
  goalDiff?: number | null;
  goalsFor?: number | null;
  rank?: number | null;
};

/**
 * Positive when `a` sits above `b` on the table.
 * Order: points → goal difference → goals scored → better rank.
 */
export function compareTableOrder(a: TableOrderKeys, b: TableOrderKeys): number {
  if (a.points != null && b.points != null && a.points !== b.points) return a.points - b.points;
  if (a.points != null && b.points == null) return 1;
  if (b.points != null && a.points == null) return -1;
  if (a.goalDiff != null && b.goalDiff != null && a.goalDiff !== b.goalDiff) {
    return a.goalDiff - b.goalDiff;
  }
  if (a.goalsFor != null && b.goalsFor != null && a.goalsFor !== b.goalsFor) {
    return a.goalsFor - b.goalsFor;
  }
  if (a.rank != null && b.rank != null && a.rank !== b.rank) return b.rank - a.rank;
  return 0;
}

/**
 * T1 is the side with more points. Equal points → better goal difference,
 * then more goals scored, then better rank. Last resort: fixture home.
 */
export function t1IsHomeSide(home: TableOrderKeys, away: TableOrderKeys): boolean {
  const cmp = compareTableOrder(home, away);
  if (cmp !== 0) return cmp > 0;
  return true;
}

export function colourFromZone(zone?: 'top' | 'mid' | 'bottom' | null): TableColour | null {
  if (zone === 'top') return 'green';
  if (zone === 'mid') return 'yellow';
  if (zone === 'bottom') return 'red';
  return null;
}

export function colourWord(c: TableColour | null): string {
  if (c === 'green') return 'Green';
  if (c === 'yellow') return 'Yellow';
  if (c === 'red') return 'Red';
  return 'Unknown';
}

/** SKM PPG bands — thresholds change by table colour. */
export function ppgBandForColour(ppg: number, colour: TableColour): PpgBand {
  if (colour === 'green') {
    if (ppg < 0.8) return 'bad';
    if (ppg < 1.2) return 'good';
    return 'great_against';
  }
  if (colour === 'red') {
    if (ppg < 1.0) return 'bad';
    if (ppg < 1.5) return 'mild';
    if (ppg < 1.7) return 'good';
    return 'great';
  }
  if (ppg < 1.1) return 'bad';
  if (ppg < 1.4) return 'mild';
  if (ppg < 1.7) return 'good';
  return 'great';
}

export function ppgAlignsWithColour(ppg: number, colour: TableColour): boolean {
  const band = ppgBandForColour(ppg, colour);
  if (colour === 'green') return band !== 'bad';
  if (colour === 'red') return band === 'bad' || band === 'mild';
  return band === 'mild' || band === 'good';
}

export const PPG_BAND_LABEL: Record<PpgBand, string> = {
  bad: 'Bad',
  mild: 'Mild / ok',
  good: 'Good',
  great: 'Great',
  great_against: 'Great against',
};

/** Named call-out: red PPG too high, or green PPG too low. */
export function mshayiNote(ppg: number, colour: TableColour): string | null {
  if (colour === 'red' && ppg > 1.5) {
    return 'Bottom-third PPG is high (>1.5) — punching above the colour';
  }
  if (colour === 'green' && ppg < 0.8) {
    return 'Top-third PPG is weak (<0.8) — colour and PPG disagree';
  }
  return null;
}

export function emptyRecord(): ScopeRecord {
  return {
    mp: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    points: 0,
    ppg: null,
    ppga: null,
    scored: null,
    conceded: null,
  };
}

export function recordFromResults(results: TeamResult[]): ScopeRecord {
  const mp = results.length;
  if (mp === 0) return emptyRecord();
  let won = 0;
  let drawn = 0;
  let lost = 0;
  let gf = 0;
  let ga = 0;
  for (const r of results) {
    if (r.outcome === 'W') won += 1;
    else if (r.outcome === 'D') drawn += 1;
    else lost += 1;
    gf += r.gf;
    ga += r.ga;
  }
  const points = won * 3 + drawn;
  return {
    mp,
    won,
    drawn,
    lost,
    points,
    ppg: points / mp,
    ppga: (lost * 3 + drawn) / mp,
    scored: gf / mp,
    conceded: ga / mp,
  };
}

export function recordFromStanding(row: StandingLike & { won?: number; drawn?: number; lost?: number }): ScopeRecord {
  const mp = row.played;
  if (mp <= 0) return emptyRecord();
  const won = row.won ?? 0;
  const drawn = row.drawn ?? 0;
  const lost = row.lost ?? Math.max(0, mp - won - drawn);
  return {
    mp,
    won,
    drawn,
    lost,
    points: row.points,
    ppg: row.points / mp,
    ppga: (lost * 3 + drawn) / mp,
    scored: null,
    conceded: null,
  };
}

function thirdCuts(n: number): { topCut: number; bottomStart: number } {
  const topCut = Math.max(1, Math.ceil(n / 3));
  const bottomStart = n - Math.ceil(n / 3) + 1;
  return { topCut, bottomStart };
}

export function currentStreak(results: TeamResult[], outcome: ResultOutcome): number {
  let n = 0;
  for (const r of results) {
    if (r.outcome !== outcome) break;
    n += 1;
  }
  return n;
}

export function neverTwiceInRow(
  results: TeamResult[],
  outcome: ResultOutcome,
  window = 10,
): boolean {
  const slice = results.slice(0, window);
  if (slice.length < 6) return false;
  for (let i = 0; i < slice.length - 1; i++) {
    if (slice[i].outcome === outcome && slice[i + 1].outcome === outcome) return false;
  }
  return true;
}

function sequenceOf(results: TeamResult[], n = 6): string {
  const slice = lastN(results, n);
  if (slice.length === 0) return '—';
  return slice.map((r) => r.outcome).join(' ');
}

function pointsFrom(results: TeamResult[]): number {
  let pts = 0;
  for (const r of results) {
    if (r.outcome === 'W') pts += 3;
    else if (r.outcome === 'D') pts += 1;
  }
  return pts;
}

function formSwing(results: TeamResult[], scope: 'overall' | 'home' | 'away'): SwingScope {
  const scoped = filterScope(results, scope);
  if (scoped.length < 6) {
    return {
      scope,
      recent: null,
      prior: null,
      drop: false,
      rise: false,
      detail: `${scope}: need 6 ${scope === 'overall' ? '' : `${scope} `}games`,
    };
  }
  const recent = pointsFrom(scoped.slice(0, 3));
  const prior = pointsFrom(scoped.slice(3, 6));
  const drop = prior - recent >= 5;
  const rise = recent - prior >= 5;
  return {
    scope,
    recent,
    prior,
    drop,
    rise,
    detail: `${scope}: last 3 = ${recent} pts, previous 3 = ${prior} pts`,
  };
}

function pctOf(rec: ScopeRecord): number | null {
  if (rec.mp <= 0 || rec.ppg == null) return null;
  return (rec.points / (rec.mp * 3)) * 100;
}

export function lastGameFlags(last: TeamResult | null, avgScored: number | null): LastGameFlag[] {
  if (!last) {
    return [{ id: 'none', label: 'No finished game yet', active: false }];
  }
  const htKnown = last.htGf != null && last.htGa != null;
  const shGf = htKnown ? last.gf - (last.htGf ?? 0) : null;
  const shGa = htKnown ? last.ga - (last.htGa ?? 0) : null;
  return [
    { id: 'won', label: 'Last game won', active: last.outcome === 'W' },
    { id: 'lost', label: 'Last game lost', active: last.outcome === 'L' },
    { id: 'draw', label: 'Last game draw', active: last.outcome === 'D' },
    { id: 'lost_draw', label: 'Last game lost / draw', active: last.outcome !== 'W' },
    { id: 'fts', label: 'Last game FTS', active: last.gf === 0 },
    { id: 'scored_05', label: 'Last game scored 0.5+', active: last.gf >= 1 },
    { id: 'conceded_05', label: 'Last game conceded 0.5+', active: last.ga >= 1 },
    {
      id: 'avg_down',
      label: 'Last game AVG down',
      active: avgScored != null && last.gf < avgScored,
    },
    {
      id: 'avg_up',
      label: 'Last game AVG up',
      active: avgScored != null && last.gf > avgScored,
    },
    { id: 'cs', label: 'Last game CS', active: last.ga === 0 },
    { id: 'no_btts', label: 'Last game no BTTS', active: !(last.gf >= 1 && last.ga >= 1) },
    { id: 'btts', label: 'Last game BTTS', active: last.gf >= 1 && last.ga >= 1 },
    {
      id: '00_ht',
      label: 'Last game 0–0 HT',
      active: htKnown && last.htGf === 0 && last.htGa === 0,
      blocked: !htKnown,
    },
    {
      id: '00_2h',
      label: 'Last game 0–0 2nd half',
      active: shGf === 0 && shGa === 0,
      blocked: !htKnown,
    },
  ];
}

function tallyFromResults(results: TeamResult[]): { goalDiff: number; goalsFor: number } | null {
  if (results.length === 0) return null;
  let goalsFor = 0;
  let goalDiff = 0;
  for (const r of results) {
    goalsFor += r.gf;
    goalDiff += r.goalDiff;
  }
  return { goalsFor, goalDiff };
}

function snapshotFor(
  name: string,
  teamId: number | null,
  row: (StandingLike & { won?: number; drawn?: number; lost?: number }) | null | undefined,
  results: TeamResult[],
  leagueSize: number,
  venue: 'home' | 'away',
): Omit<SideSnapshot, 'side' | 'label'> {
  const overallResults = recordFromResults(results);
  const overall = overallResults.mp > 0 ? overallResults : row ? recordFromStanding(row) : emptyRecord();
  const fromResults = tallyFromResults(results);
  const { topCut, bottomStart } = thirdCuts(leagueSize);
  return {
    venue,
    teamId,
    name,
    rank: row?.rank ?? null,
    points: row?.points ?? null,
    goalDiff: row?.goalDiff ?? fromResults?.goalDiff ?? null,
    goalsFor: row?.goalsFor ?? fromResults?.goalsFor ?? null,
    zone: row?.zone ?? null,
    colour: colourFromZone(row?.zone),
    overall,
    home: recordFromResults(filterScope(results, 'home')),
    away: recordFromResults(filterScope(results, 'away')),
    vsAbove: recordFromResults(results.filter((r) => r.opponentAbove === true)),
    vsBelow: recordFromResults(results.filter((r) => r.opponentAbove === false)),
    vsTopThird: recordFromResults(
      results.filter((r) => r.opponentRank != null && r.opponentRank <= topCut),
    ),
    vsBottomThird: recordFromResults(
      results.filter((r) => r.opponentRank != null && r.opponentRank >= bottomStart),
    ),
  };
}

function asSide(snap: Omit<SideSnapshot, 'side' | 'label'>, side: SideId): SideSnapshot {
  return { ...snap, side, label: sideLabel(side, snap.name) };
}

function colourRead(snap: SideSnapshot): ColourSideRead {
  const ppg = snap.overall.ppg;
  const colour = snap.colour;
  const band = ppg != null && colour ? ppgBandForColour(ppg, colour) : null;
  const aligns = ppg != null && colour ? ppgAlignsWithColour(ppg, colour) : null;
  const rec = snap.overall;
  const positive = rec.won + rec.drawn;
  return {
    colour,
    ppg,
    band,
    aligns,
    mshayi: ppg != null && colour ? mshayiNote(ppg, colour) : null,
    lossesVsPositive:
      rec.mp > 0 ? `${rec.lost} losses vs ${positive} wins+draws` : 'No sample',
    types: [
      { key: 'overall', label: 'Overall PPG', ppg: snap.overall.ppg },
      { key: 'home', label: 'Home PPG', ppg: snap.home.ppg },
      { key: 'away', label: 'Away PPG', ppg: snap.away.ppg },
      { key: 'ppga', label: 'PPG against', ppg: snap.overall.ppga },
      { key: 'above', label: 'PPG vs top third', ppg: snap.vsTopThird.ppg },
      { key: 'below', label: 'PPG vs bottom third', ppg: snap.vsBottomThird.ppg },
    ],
  };
}

function venueRead(snap: SideSnapshot): VenueRead {
  const overall = snap.overall.ppg;
  const home = snap.home.ppg;
  const away = snap.away.ppg;
  const homeStrong = home != null && overall != null && home - overall >= VENUE_GAP;
  const awayStrong = away != null && overall != null && away - overall >= VENUE_GAP;
  const bits: string[] = [];
  if (homeStrong) bits.push(`home PPG ${home!.toFixed(2)} vs overall ${overall!.toFixed(2)}`);
  if (awayStrong) bits.push(`away PPG ${away!.toFixed(2)} vs overall ${overall!.toFixed(2)}`);
  return {
    homeStrong,
    awayStrong,
    homePpg: home,
    awayPpg: away,
    overallPpg: overall,
    detail: bits.length > 0 ? bits.join(' · ') : 'No clear home/away lift vs overall',
  };
}

function characterSide(snap: SideSnapshot): CharacterSide {
  const h = snap.home.ppg;
  const a = snap.away.ppg;
  const o = snap.overall.ppg;
  const gap = h != null && a != null ? h - a : null;
  const split = gap != null && Math.abs(gap) >= 0.5;
  return {
    split,
    homeAwayGap: gap,
    original:
      o != null
        ? `Original (overall) PPG ${o.toFixed(2)} · ${snap.overall.mp} MP ${snap.overall.won}-${snap.overall.drawn}-${snap.overall.lost}`
        : 'No overall sample yet',
    other:
      h != null || a != null
        ? `Home PPG ${h != null ? h.toFixed(2) : '—'} · Away PPG ${a != null ? a.toFixed(2) : '—'}${
            split ? ' — split character' : ''
          }`
        : 'Need home and away games',
  };
}

function middleShow(snap: SideSnapshot): ShowRead {
  const abovePct = pctOf(snap.vsAbove);
  const belowPct = pctOf(snap.vsBelow);
  const yellow = snap.zone === 'mid';
  const strongBits: string[] = [];
  const weakBits: string[] = [];
  if (abovePct != null && abovePct >= 50) strongBits.push(`takes ${Math.round(abovePct)}% vs sides above`);
  if (belowPct != null && belowPct >= 75) strongBits.push(`dominates sides below (${Math.round(belowPct)}%)`);
  if (abovePct != null && abovePct < 30) weakBits.push(`soft vs sides above (${Math.round(abovePct)}%)`);
  if (belowPct != null && belowPct < 45) weakBits.push(`drops points to sides below (${Math.round(belowPct)}%)`);
  return {
    yellow,
    strongShow: strongBits.length > 0 ? strongBits.join(' · ') : 'No strong-show pattern yet',
    weakShow: weakBits.length > 0 ? weakBits.join(' · ') : 'No weak-show pattern yet',
    vsAbovePct: abovePct,
    vsBelowPct: belowPct,
    vsAboveMp: snap.vsAbove.mp,
    vsBelowMp: snap.vsBelow.mp,
  };
}

function streakSide(results: TeamResult[], outcome: ResultOutcome): StreakSide {
  return {
    current: currentStreak(results, outcome),
    sequence: sequenceOf(results, 8),
    neverTwice: neverTwiceInRow(results, outcome),
    last10: lastN(results, 10)
      .map((r) => r.outcome)
      .join(' '),
  };
}

function indlelaPaths(results: TeamResult[]): string[] {
  const out: string[] = [];
  const w = currentStreak(results, 'W');
  const l = currentStreak(results, 'L');
  if (w >= 4) out.push(`Win path (${w} in a row)`);
  if (l >= 4) out.push(`Loss path (${l} in a row)`);
  if (neverTwiceInRow(results, 'L')) out.push('Never lost twice in a row');
  if (neverTwiceInRow(results, 'W')) out.push('Never won twice in a row');
  if (out.length === 0) out.push('No clear path in recent form');
  return out;
}

function childBeater(
  results: TeamResult[],
  zone: 'top' | 'mid' | 'bottom' | null,
  leagueSize: number,
): ChildBeaterSide {
  const recent = lastN(results, 6);
  const thrash = recent.find((r) => r.outcome === 'W' && r.goalDiff >= 2 && r.opponentAbove === false);
  const { bottomStart } = thirdCuts(leagueSize);
  const vsBottom = recent.filter(
    (r) =>
      r.outcome === 'W' &&
      r.goalDiff >= 2 &&
      r.opponentRank != null &&
      r.opponentRank >= bottomStart,
  );
  const method2Ok = (zone === 'top' || zone === 'mid') && vsBottom.length >= 2;
  return {
    method1: thrash
      ? `Beat lower side ${thrash.gf}-${thrash.ga} vs ${thrash.opponentName}`
      : null,
    method2: method2Ok
      ? `${vsBottom.length} heavy wins vs bottom-third sides in last 6`
      : vsBottom.length > 0
        ? `${vsBottom.length} heavy win vs bottom third (need 2+)`
        : null,
  };
}

function struggleLine(
  results: TeamResult[],
  teamId: number | null,
  table: StandingLike[],
  seasonProgress: number | null | undefined,
): { text: string; fight: boolean } {
  const last3 = results.slice(0, 3);
  if (last3.length < 2) return { text: 'Need 2+ recent games', fight: false };
  const losses = last3.filter((r) => r.outcome === 'L').length;
  const winless = last3.every((r) => r.outcome !== 'W');
  const active = losses >= 2 || winless;
  const seq = last3.map((r) => r.outcome).join(' ');
  if (!active) return { text: `Not struggling · last 3: ${seq}`, fight: false };
  let fight = false;
  let fightDetail = 'no position of interest';
  if (teamId != null && table.length > 0) {
    const m = evaluateTeamMotivation(teamId, table, { seasonProgress });
    if (m && (m.stance === 'chase' || m.stance === 'escape') && m.grade !== 'none') {
      fight = true;
      fightDetail = m.stanceReason;
    }
  }
  return {
    text: fight
      ? `Struggling (${seq}) AND something to fight for — ${fightDetail}`
      : `Struggling (${seq}) but ${fightDetail}`,
    fight,
  };
}

export function evaluatePowerDynamics(opts: {
  table: StandingLike[];
  homeId: number | null | undefined;
  awayId: number | null | undefined;
  homeName: string;
  awayName: string;
  homeResults: TeamResult[];
  awayResults: TeamResult[];
  seasonProgress?: number | null;
  competitionId?: number | string | null;
  h2hMatches?: H2HMatch[];
  odds?: OddsByMarket;
}): PowerDynamicsBundle {
  const {
    table,
    homeId,
    awayId,
    homeName,
    awayName,
    homeResults,
    awayResults,
    seasonProgress,
    competitionId,
    h2hMatches = [],
    odds,
  } = opts;

  const homeRow = homeId != null ? table.find((t) => t.teamId === homeId) : null;
  const awayRow = awayId != null ? table.find((t) => t.teamId === awayId) : null;
  const n = table.length;

  const homeSnap = snapshotFor(homeName, homeId ?? null, homeRow, homeResults, n, 'home');
  const awaySnap = snapshotFor(awayName, awayId ?? null, awayRow, awayResults, n, 'away');
  const t1Home = t1IsHomeSide(homeSnap, awaySnap);
  const t1 = asSide(t1Home ? homeSnap : awaySnap, 't1');
  const t2 = asSide(t1Home ? awaySnap : homeSnap, 't2');
  const t1Results = t1Home ? homeResults : awayResults;
  const t2Results = t1Home ? awayResults : homeResults;
  const t1Id = t1.teamId;
  const t2Id = t2.teamId;

  const pointsDiff =
    t1.points != null && t2.points != null ? Math.abs(t1.points - t2.points) : null;
  const closeOnTable = pointsDiff != null && pointsDiff <= CLOSE_PTS;

  let underdog: SideId | 'level' | null = null;
  const order = compareTableOrder(t1, t2);
  if (t1.points != null || t2.points != null || t1.goalDiff != null || t2.goalDiff != null) {
    if (order > 0) underdog = 't2';
    else if (order < 0) underdog = 't1';
    else underdog = 'level';
  }

  const c1 = colourRead(t1);
  const c2 = colourRead(t2);
  const v1 = venueRead(t1);
  const v2 = venueRead(t2);
  const baselineGap = baselineGapFor(t1, t2, table);

  const dog = underdog === 't1' ? t1 : underdog === 't2' ? t2 : null;
  const dogV = underdog === 't1' ? v1 : underdog === 't2' ? v2 : null;
  let venueCall = 'No underdog-strength call yet';
  if (dog && dogV) {
    const atHome = dog.venue === 'home';
    if (atHome && dogV.homeStrong) {
      venueCall = `${dog.label} is the underdog and is strong at home`;
    } else if (!atHome && dogV.awayStrong) {
      venueCall = `${dog.label} is the underdog and is strong away`;
    } else if (atHome && dogV.awayStrong) {
      venueCall = `${dog.label} is the underdog — away lift, playing at home here`;
    } else if (!atHome && dogV.homeStrong) {
      venueCall = `${dog.label} is the underdog — home lift, playing away here`;
    } else {
      venueCall = `${dog.label} is the underdog, without a clear venue lift`;
    }
  } else if (underdog === 'level') {
    venueCall = 'Sides are level on the table — home/away strength is the split';
  }

  const t1Paths = indlelaPaths(t1Results);
  const t2Paths = indlelaPaths(t2Results);
  const t1Win = currentStreak(t1Results, 'W') >= 4;
  const t2Loss = currentStreak(t2Results, 'L') >= 4;
  const t2Win = currentStreak(t2Results, 'W') >= 4;
  const t1Loss = currentStreak(t1Results, 'L') >= 4;
  let counterpart = 'No inverse path between the sides';
  if (t1Win && t2Loss) counterpart = `${t1.label} win path vs ${t2.label} loss path (negative counterpart)`;
  else if (t2Win && t1Loss) counterpart = `${t2.label} win path vs ${t1.label} loss path (negative counterpart)`;

  const s1 = struggleLine(t1Results, t1Id, table, seasonProgress);
  const s2 = struggleLine(t2Results, t2Id, table, seasonProgress);

  const contested = contestedLeagueTop(table);
  const t1InPack = t1.rank != null && t1.rank <= 5;
  const t2InPack = t2.rank != null && t2.rank <= 5;

  const t1Mot =
    t1Id != null && table.length > 0
      ? evaluateTeamMotivation(t1Id, table, { competitionId, seasonProgress })
      : null;
  const t2Mot =
    t2Id != null && table.length > 0
      ? evaluateTeamMotivation(t2Id, table, { competitionId, seasonProgress })
      : null;
  const meetings = h2hMeetingsForSides(h2hMatches, t1.name, t2.name);

  return {
    t1,
    t2,
    pointsDiff,
    closeOnTable,
    underdog,
    baselineGap,
    positionGap: evaluatePositionGap({
      tableSize: n,
      t1Rank: t1.rank,
      t2Rank: t2.rank,
      t1Label: t1.label,
      t2Label: t2.label,
    }),
    colour: {
      t1: c1,
      t2: c2,
      whoFacesWho: `${t1.label} ${colourWord(c1.colour)} vs ${t2.label} ${colourWord(c2.colour)}`,
    },
    venue: { t1: v1, t2: v2, call: venueCall },
    character: { t1: characterSide(t1), t2: characterSide(t2) },
    middle: { t1: middleShow(t1), t2: middleShow(t2) },
    indlela: {
      t1: t1Paths,
      t2: t2Paths,
      counterpart,
      yellow: t1.zone === 'mid' || t2.zone === 'mid',
    },
    streaks: {
      win: { t1: streakSide(t1Results, 'W'), t2: streakSide(t2Results, 'W') },
      loss: { t1: streakSide(t1Results, 'L'), t2: streakSide(t2Results, 'L') },
    },
    swing: {
      t1: (['overall', 'home', 'away'] as const).map((s) => formSwing(t1Results, s)),
      t2: (['overall', 'home', 'away'] as const).map((s) => formSwing(t2Results, s)),
    },
    childBeater: {
      t1: childBeater(t1Results, t1.zone, n),
      t2: childBeater(t2Results, t2.zone, n),
    },
    struggle: { t1: s1.text, t2: s2.text, t1Fight: s1.fight, t2Fight: s2.fight },
    contested: { flag: contested, t1InPack, t2InPack },
    lastGame: {
      t1: lastGameFlags(t1Results[0] ?? null, t1.overall.scored),
      t2: lastGameFlags(t2Results[0] ?? null, t2.overall.scored),
    },
    competition: {
      progress: leagueProgressInfo(table, seasonProgress),
      t1: t1Mot,
      t2: t2Mot,
    },
    streamline: evaluateStreamline({
      t1Points: t1.points,
      t2Points: t2.points,
      t1Label: t1.label,
      t2Label: t2.label,
      t1Ppg: t1.overall.ppg,
      t2Ppg: t2.overall.ppg,
      t1Odds: ftOdds(odds, t1.venue),
      t2Odds: ftOdds(odds, t2.venue),
      h2hMeetings: meetings.length,
      t1H2hWins: countH2hWins(meetings, t1.name),
      t2H2hWins: countH2hWins(meetings, t2.name),
    }),
  };
}

export function fmtPpg(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toFixed(2);
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${Math.round(v)}%`;
}

export function wdl(rec: ScopeRecord): string {
  if (rec.mp <= 0) return '—';
  return `${rec.mp} MP · ${rec.won}-${rec.drawn}-${rec.lost}`;
}
