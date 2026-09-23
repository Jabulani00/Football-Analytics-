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
import { h2hOutcomeForTeam, recentH2hMeetings, teamInH2hMatch, teamsMatch } from '@/utils/h2hDisplay';
import type { H2HMatch, OddsByMarket, Probability } from '@/services/oddAlerts';

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
  /** League games played (table W+D+L). */
  played: number | null;
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
  meaning: string;
  /** Raw strength on the A=10 … F=0 ladder (what the side received). */
  received: number | null;
  /** Fixture gap on the 0–10 scale, from the G-grade (may be 2.1 etc.). */
  score: number | null;
};

export type BaselineGap = {
  t1: BaselineSideGap;
  t2: BaselineSideGap;
  pair: string | null;
  /** Pair gap from G-grade: (100 − k/(N−1)×100) / 10. */
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
/** Streamline H2H window — last 5 meetings only. */
export const STREAMLINE_H2H_LIMIT = 5;
export const ZIDANE_PPG_ODDS_RULE =
  'IF PPG is high then the odds are high, if PPG is low then odds are Low';

export type StreamName = 'bateteme' | 'compliant' | 'zidane_law' | 'bookie' | 'bookie2';
export type OddsOutcome = 'compliant' | 'non_compliant';

export const STREAM_ORDER: StreamName[] = [
  'bateteme',
  'compliant',
  'zidane_law',
  'bookie',
  'bookie2',
];

export const STREAM_LABEL: Record<StreamName, string> = {
  bateteme: 'Bateteme stream',
  compliant: 'Compliant stream',
  zidane_law: 'Zidane Law',
  bookie: 'Bookie mistake',
  bookie2: 'Bookie mistake 2',
};

/** Short name for fixture-row chips. */
export const STREAM_CHIP: Record<StreamName, string> = {
  bateteme: 'Bateteme',
  compliant: 'Compliant',
  zidane_law: 'Zidane',
  bookie: 'Bookie',
  bookie2: 'Bookie 2',
};

export const STREAM_ROLE: Record<StreamName, string> = {
  bateteme: 'Close — ΔP ≤ 4',
  compliant: 'T1 is stronger, so T1’s 1X2 odds should be the lower price',
  zidane_law: `${ZIDANE_PPG_ODDS_RULE}. Supported by T1 never beating T2.`,
  bookie: `${ZIDANE_PPG_ODDS_RULE}. In this H2H T1 did beat T2.`,
  bookie2: `${ZIDANE_PPG_ODDS_RULE}. No H2H games were found.`,
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
  t1Played: number | null;
  t2Played: number | null;
  t1Odds: number | null;
  t2Odds: number | null;
  /** Where the 1X2 prices came from. */
  oddsSource: 'bookmaker' | 'model' | null;
  t1PpgHigh: boolean;
  oddsOutcome: OddsOutcome | null;
  h2hMeetings: number;
  t1H2hWins: number;
  t2H2hWins: number;
  t1H2hLosses: number;
  t1H2hDraws: number;
  t1NeverBeatenT2: boolean;
  t1DidBeatT2: boolean;
  t2BeatsT1: boolean;
  /** High PPG ↔ high odds, low PPG ↔ low odds. */
  ppgOddsZidane: boolean;
  inStreams: Record<StreamName, boolean>;
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
  const span = Math.min(Math.max(to - from + 1, 1), tableSize);
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
  return matches.filter(
    (m) => teamInH2hMatch(m, teamName) && h2hOutcomeForTeam(m, teamName) === 'W',
  ).length;
}

export function countH2hLosses(matches: H2HMatch[], teamName: string): number {
  return matches.filter(
    (m) => teamInH2hMatch(m, teamName) && h2hOutcomeForTeam(m, teamName) === 'L',
  ).length;
}

export function countH2hDraws(matches: H2HMatch[], teamName: string): number {
  return matches.filter(
    (m) => teamInH2hMatch(m, teamName) && h2hOutcomeForTeam(m, teamName) === 'D',
  ).length;
}

/** Last 5 H2H meetings for Streamline. */
export function streamlineH2hWindow(matches: H2HMatch[]): H2HMatch[] {
  return recentH2hMeetings(matches, STREAMLINE_H2H_LIMIT);
}

/**
 * Zidane / Bookie pricing: high PPG → high odds, low PPG → low odds.
 * The side with the higher PPG should have the higher 1X2 price.
 */
export function ppgOddsZidaneAligned(
  t1Ppg: number | null | undefined,
  t2Ppg: number | null | undefined,
  t1Odds: number | null | undefined,
  t2Odds: number | null | undefined,
): boolean {
  if (t1Ppg == null || t2Ppg == null || t1Odds == null || t2Odds == null) return false;
  if (t1Ppg === t2Ppg || t1Odds === t2Odds) return false;
  return t1Ppg > t2Ppg === t1Odds > t2Odds;
}

function asPrice(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 1) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) && n > 1 ? n : null;
  }
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return asPrice(row.odd ?? row.odds ?? row.value ?? row.decimal ?? row.price);
  }
  return null;
}

const FT_MARKET_KEYS = [
  'ft_result',
  '1x2',
  'match_result',
  'full_time',
  'full_time_result',
  'match_winner',
  'ft',
];

/** OddAlerts sometimes sends `odds: []` on upcoming games even when has_odds is true. */
export function normalizeOddsBoard(odds: unknown): OddsByMarket | undefined {
  if (odds == null) return undefined;
  if (Array.isArray(odds)) {
    if (odds.length === 0) return undefined;
    const board: OddsByMarket = {};
    for (const row of odds) {
      if (!row || typeof row !== 'object') continue;
      const rec = row as Record<string, unknown>;
      const market = String(rec.market ?? rec.key ?? rec.name ?? '');
      if (!market) continue;
      const outcomes: Record<string, number> = {};
      for (const [k, v] of Object.entries(rec)) {
        if (k === 'market' || k === 'key' || k === 'name') continue;
        const n = asPrice(v);
        if (n != null) outcomes[k] = n;
      }
      if (Object.keys(outcomes).length > 0) board[market] = outcomes;
    }
    return Object.keys(board).length > 0 ? board : undefined;
  }
  if (typeof odds !== 'object') return undefined;
  if (Object.keys(odds as object).length === 0) return undefined;
  return odds as OddsByMarket;
}

function ftMarket(odds: unknown): Record<string, unknown> | null {
  const bag = normalizeOddsBoard(odds);
  if (!bag) return null;
  const rec = bag as unknown as Record<string, unknown>;
  for (const key of FT_MARKET_KEYS) {
    const market = rec[key];
    if (market && typeof market === 'object' && !Array.isArray(market)) {
      return market as Record<string, unknown>;
    }
  }
  for (const market of Object.values(rec)) {
    if (!market || typeof market !== 'object' || Array.isArray(market)) continue;
    const row = market as Record<string, unknown>;
    if (asPrice(row.home) != null && asPrice(row.away) != null) return row;
    if (asPrice(row['1']) != null && asPrice(row['2']) != null) return row;
  }
  return null;
}

/** Decimal 1X2 price for fixture home or away from the odds board. */
export function ftOdds(odds: OddsByMarket | undefined, venue: 'home' | 'away'): number | null {
  const market = ftMarket(odds);
  if (!market) return null;
  const keys =
    venue === 'home' ? ['home', '1', 'home_win', 'Home'] : ['away', '2', 'away_win', 'Away'];
  for (const key of keys) {
    const n = asPrice(market[key]);
    if (n != null) return n;
  }
  return null;
}

/** Decimal price implied by a 0–100 or 0–1 win probability. */
export function impliedOddsFromProb(pct: number | undefined): number | null {
  if (pct == null || !Number.isFinite(pct) || pct <= 0) return null;
  const p = pct > 1 ? pct / 100 : pct;
  if (p <= 0 || p >= 1) return null;
  return 1 / p;
}

function fmtOdds(n: number): string {
  return n.toFixed(2);
}

export function evaluateStreamline(opts: {
  t1Points: number | null;
  t2Points: number | null;
  t1Label: string;
  t2Label: string;
  t1Ppg?: number | null;
  t2Ppg?: number | null;
  t1Played?: number | null;
  t2Played?: number | null;
  t1Odds?: number | null;
  t2Odds?: number | null;
  oddsSource?: 'bookmaker' | 'model' | null;
  oddsPending?: boolean;
  h2hMeetings?: number;
  t1H2hWins?: number;
  t2H2hWins?: number;
  t1H2hLosses?: number;
  t1H2hDraws?: number;
}): StreamlineRead {
  const t1Points = opts.t1Points;
  const t2Points = opts.t2Points;
  const t1Label = opts.t1Label;
  const t2Label = opts.t2Label;
  const t1Ppg = opts.t1Ppg ?? null;
  const t2Ppg = opts.t2Ppg ?? null;
  const t1Played = opts.t1Played ?? null;
  const t2Played = opts.t2Played ?? null;
  const t1Odds = opts.t1Odds ?? null;
  const t2Odds = opts.t2Odds ?? null;
  const oddsPending = opts.oddsPending === true;
  const oddsSource =
    t1Odds != null && t2Odds != null ? (opts.oddsSource ?? 'bookmaker') : null;
  const h2hMeetings = opts.h2hMeetings ?? 0;
  const t1H2hWins = opts.t1H2hWins ?? 0;
  const t2H2hWins = opts.t2H2hWins ?? 0;
  const t1H2hLosses = opts.t1H2hLosses ?? 0;
  const t1H2hDraws = opts.t1H2hDraws ?? Math.max(0, h2hMeetings - t1H2hWins - t1H2hLosses);
  const delta = t1Points != null && t2Points != null ? t1Points - t2Points : null;
  const close = delta != null && delta <= STREAMLINE_CLOSE_MAX;
  const far = delta != null && delta >= STREAMLINE_FAR_MIN;
  const t1DidBeatT2 = h2hMeetings > 0 && t1H2hWins > 0;
  const t1NeverBeatenT2 = h2hMeetings > 0 && t1H2hWins === 0;
  const t2BeatsT1 = h2hMeetings > 0 && t2H2hWins > 0;
  const ppgOddsZidane = ppgOddsZidaneAligned(t1Ppg, t2Ppg, t1Odds, t2Odds);
  // T1 is already the stronger table side. High PPG and short odds are one bundle:
  // T1’s 1X2 price should be lower than T2. Do not skip the check when PPG is close.
  const t1PpgHigh = t1Ppg != null && t2Ppg != null && t1Ppg > t2Ppg;

  const oddsLabel =
    oddsSource === 'model'
      ? 'Model 1X2 (no bookmaker price)'
      : 'Bookmaker 1X2 odds';

  let oddsOutcome: OddsOutcome | null = null;
  let oddsCall: string;
  if (t1Odds == null || t2Odds == null) {
    oddsCall = oddsPending
      ? `Loading bookmaker 1X2 odds for ${t1Label} vs ${t2Label}…`
      : `No 1X2 odds on this fixture yet, so compliant vs non-compliant cannot be scored. ${t1Label} is the stronger table side, so T1’s 1X2 price should be lower than ${t2Label}.`;
  } else if (t1Odds < t2Odds) {
    oddsOutcome = 'compliant';
    oddsCall = `${oddsLabel}: ${t1Label} ${fmtOdds(t1Odds)}, ${t2Label} ${fmtOdds(t2Odds)}. T1 is the shorter price, as expected. Compliant.`;
  } else {
    oddsOutcome = 'non_compliant';
    oddsCall = `${oddsLabel}: ${t1Label} ${fmtOdds(t1Odds)}, ${t2Label} ${fmtOdds(t2Odds)}. T1 should be the shorter price. Non-compliant.`;
  }

  const inStreams: Record<StreamName, boolean> = {
    bateteme: close,
    compliant: oddsOutcome === 'compliant',
    zidane_law: ppgOddsZidane && t1NeverBeatenT2,
    bookie: ppgOddsZidane && t1DidBeatT2,
    bookie2: ppgOddsZidane && h2hMeetings === 0,
  };
  const primary = STREAM_ORDER.find((name) => inStreams[name]) ?? null;

  const h2hLine = `${h2hMeetings} H2H, T1 ${t1H2hWins}W / ${t1H2hDraws}D / ${t1H2hLosses}L`;
  let call: string;
  if (delta == null) {
    call = 'Need both sides on the table to run Streamline (T1 pts − T2 pts).';
  } else if (primary === 'bateteme') {
    call = `${t1Label} − ${t2Label} = ${delta} pts (≤ 4). Both sides sit in Bateteme stream.`;
  } else if (primary === 'compliant') {
    call = `Compliant stream — T1’s 1X2 odds are lower than T2, as expected.`;
  } else if (primary === 'zidane_law') {
    call = `Zidane Law — ${ZIDANE_PPG_ODDS_RULE}. ${t1Label} has never beaten ${t2Label} (${h2hLine}).`;
  } else if (primary === 'bookie') {
    call = `Bookie mistake — ${ZIDANE_PPG_ODDS_RULE}. ${t1Label} did beat ${t2Label} (${h2hLine}).`;
  } else if (primary === 'bookie2') {
    call = `Bookie mistake 2 — ${ZIDANE_PPG_ODDS_RULE}. No H2H games were found.`;
  } else {
    call = `${t1Label} − ${t2Label} = ${delta} pts. Not in Bateteme, Compliant stream, Zidane Law, or Bookie mistake.`;
  }

  return {
    t1Points,
    t2Points,
    delta,
    close,
    far,
    t1Stream: primary,
    t2Stream: primary,
    t1Ppg,
    t2Ppg,
    t1Played,
    t2Played,
    t1Odds,
    t2Odds,
    oddsSource,
    t1PpgHigh,
    oddsOutcome,
    h2hMeetings,
    t1H2hWins,
    t2H2hWins,
    t1H2hLosses,
    t1H2hDraws,
    t1NeverBeatenT2,
    t1DidBeatT2,
    t2BeatsT1,
    ppgOddsZidane,
    inStreams,
    oddsCall,
    call,
  };
}

function findTableRow(
  table: StandingLike[],
  teamId: number | null | undefined,
  name: string,
): StandingLike | null {
  if (teamId != null) {
    const byId = table.find((t) => t.teamId === teamId || Number(t.teamId) === Number(teamId));
    if (byId) return byId;
  }
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  return table.find((t) => t.name.trim().toLowerCase() === needle) ?? null;
}

/**
 * Primary Streamline for a fixture from the league table (+ optional H2H / 1X2).
 * Same T1/T2 rules as the match screen.
 */
export function streamlineForMatchup(opts: {
  table: StandingLike[];
  homeId?: number | null;
  awayId?: number | null;
  homeName: string;
  awayName: string;
  h2hMatches?: H2HMatch[];
  homeOdds?: number | null;
  awayOdds?: number | null;
  oddsSource?: 'bookmaker' | 'model' | null;
}): StreamName | null {
  const table = opts.table;
  if (table.length === 0) return null;
  const homeRow = findTableRow(table, opts.homeId, opts.homeName);
  const awayRow = findTableRow(table, opts.awayId, opts.awayName);
  if (!homeRow && !awayRow) return null;

  const homeKeys: TableOrderKeys = {
    points: homeRow?.points ?? null,
    goalDiff: homeRow?.goalDiff ?? null,
    goalsFor: homeRow?.goalsFor ?? null,
    rank: homeRow?.rank ?? null,
  };
  const awayKeys: TableOrderKeys = {
    points: awayRow?.points ?? null,
    goalDiff: awayRow?.goalDiff ?? null,
    goalsFor: awayRow?.goalsFor ?? null,
    rank: awayRow?.rank ?? null,
  };
  const t1Home = t1IsHomeSide(homeKeys, awayKeys);
  const t1Row = t1Home ? homeRow : awayRow;
  const t2Row = t1Home ? awayRow : homeRow;
  const t1Name = t1Home ? opts.homeName : opts.awayName;
  const t2Name = t1Home ? opts.awayName : opts.homeName;
  const meetings = streamlineH2hWindow(h2hMeetingsForSides(opts.h2hMatches ?? [], t1Name, t2Name));
  const t1Odds = t1Home ? (opts.homeOdds ?? null) : (opts.awayOdds ?? null);
  const t2Odds = t1Home ? (opts.awayOdds ?? null) : (opts.homeOdds ?? null);

  return evaluateStreamline({
    t1Points: t1Row?.points ?? null,
    t2Points: t2Row?.points ?? null,
    t1Label: `T1 (${t1Name})`,
    t2Label: `T2 (${t2Name})`,
    t1Ppg: leaguePpg(t1Row?.points, leaguePlayedFromRow(t1Row)),
    t2Ppg: leaguePpg(t2Row?.points, leaguePlayedFromRow(t2Row)),
    t1Played: leaguePlayedFromRow(t1Row) || null,
    t2Played: leaguePlayedFromRow(t2Row) || null,
    t1Odds,
    t2Odds,
    oddsSource: t1Odds != null && t2Odds != null ? (opts.oddsSource ?? 'bookmaker') : null,
    h2hMeetings: meetings.length,
    t1H2hWins: countH2hWins(meetings, t1Name),
    t2H2hWins: countH2hWins(meetings, t2Name),
    t1H2hLosses: countH2hLosses(meetings, t1Name),
    t1H2hDraws: countH2hDraws(meetings, t1Name),
  }).t1Stream;
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

export function gapValueFromPositionGrade(gradeIndex: number, tableSize: number): number | null {
  const denom = tableSize - 1;
  if (denom < 1 || !Number.isFinite(gradeIndex) || gradeIndex < 1) return null;
  const g = Math.min(gradeIndex, denom);
  const percent = (g / denom) * 100;
  return Math.round(((100 - percent) / 10) * 10) / 10;
}

export function letterFromGapValue(value: number): BaselineLetter {
  if (value >= 9) return 'A';
  if (value >= 7) return 'B';
  if (value >= 5) return 'C';
  if (value >= 3) return 'D';
  if (value >= 1) return 'E';
  return 'F';
}

export function fmtGapScore(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return (Math.round(v * 10) / 10).toFixed(1);
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
    meaning: 'Need a G-grade from gap analysis',
    received: null,
    score: null,
  };
}

export function baselineGapFor(
  t1: SideSnapshot,
  t2: SideSnapshot,
  table: StandingLike[],
  positionGap: PositionGap,
): BaselineGap {
  const avg = leagueAvgPpg(table);
  const value = positionGap.gradeIndex != null
    ? gapValueFromPositionGrade(positionGap.gradeIndex, positionGap.tableSize)
    : null;

  if (value == null) {
    const empty = emptyBaselineSide();
    return {
      t1: empty,
      t2: empty,
      pair: null,
      separation: null,
      grade: null,
      stronger: null,
      supports: false,
      leagueAvgPpg: avg,
      call: 'Need a G-grade from gap analysis to set A–F types.',
    };
  }

  const letter = letterFromGapValue(value);
  const grade = separationGrade(value);
  const stronger: SideId | 'level' = value > 0 ? 't1' : 'level';
  const weakLetter: BaselineLetter = 'F';

  const s1: BaselineSideGap = {
    letter: stronger === 't1' ? letter : weakLetter,
    meaning: BASELINE_LETTER_MEANING[stronger === 't1' ? letter : weakLetter],
    received: stronger === 't1' ? value : 0,
    score: stronger === 't1' ? value : 0,
  };
  const s2: BaselineSideGap = {
    letter: weakLetter,
    meaning: BASELINE_LETTER_MEANING[weakLetter],
    received: 0,
    score: 0,
  };

  const pair = `${s1.letter}${s2.letter}`;
  const supports = value >= 6;
  const denom = Math.max(1, positionGap.tableSize - 1);
  const g = Math.min(positionGap.gradeIndex ?? denom, denom);
  const call =
    stronger === 'level'
      ? `${positionGap.grade} · ${g}/${denom} · gap ${fmtGapScore(value)} · type ${letter}`
      : `${positionGap.grade} · ${g}/${denom} · gap ${fmtGapScore(value)} · type ${letter}`;

  return {
    t1: s1,
    t2: s2,
    pair,
    separation: value,
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

/** League matches played from the table: W+D+L, else the played column. */
export function leaguePlayedFromRow(
  row: { played?: number | null; won?: number | null; drawn?: number | null; lost?: number | null } | null | undefined,
): number {
  if (!row) return 0;
  const fromWdl = (row.won ?? 0) + (row.drawn ?? 0) + (row.lost ?? 0);
  if (fromWdl > 0) return fromWdl;
  return row.played ?? 0;
}

export function recordFromStanding(row: StandingLike & { won?: number; drawn?: number; lost?: number }): ScopeRecord {
  const won = row.won ?? 0;
  const drawn = row.drawn ?? 0;
  const fromWdl = won + drawn + (row.lost ?? 0);
  const mp = leaguePlayedFromRow(row);
  if (mp <= 0) return emptyRecord();
  const lost = fromWdl > 0 ? (row.lost ?? 0) : Math.max(0, mp - won - drawn);
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

/** League PPG = table points ÷ games played in that league. */
export function leaguePpg(points: number | null | undefined, played: number | null | undefined): number | null {
  if (points == null || played == null || !Number.isFinite(points) || !Number.isFinite(played) || played <= 0) {
    return null;
  }
  return points / played;
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
  const tableMp = leaguePlayedFromRow(row);
  const overall =
    row && tableMp > 0
      ? recordFromStanding(row)
      : overallResults.mp > 0
        ? overallResults
        : emptyRecord();
  const fromResults = tallyFromResults(results);
  const { topCut, bottomStart } = thirdCuts(leagueSize);
  return {
    venue,
    teamId,
    name,
    rank: row?.rank ?? null,
    points: row?.points ?? null,
    played: overall.mp > 0 ? overall.mp : tableMp || (row?.played ?? null),
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
  odds?: OddsByMarket | unknown;
  probability?: Probability;
  /** Extra 1X2 board (e.g. Hollywoodbets) when OddAlerts `odds` is empty. */
  book1x2?: { home: number; away: number } | null;
  oddsPending?: boolean;
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
    probability,
    book1x2 = null,
    oddsPending = false,
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
  const positionGap = evaluatePositionGap({
    tableSize: n,
    t1Rank: t1.rank,
    t2Rank: t2.rank,
    t1Label: t1.label,
    t2Label: t2.label,
  });
  const baselineGap = baselineGapFor(t1, t2, table, positionGap);

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
  const meetings = streamlineH2hWindow(h2hMeetingsForSides(h2hMatches, t1.name, t2.name));
  let t1Odds = ftOdds(odds, t1.venue);
  let t2Odds = ftOdds(odds, t2.venue);
  let oddsSource: 'bookmaker' | 'model' | null =
    t1Odds != null && t2Odds != null ? 'bookmaker' : null;
  if (oddsSource == null && book1x2) {
    t1Odds = t1.venue === 'home' ? book1x2.home : book1x2.away;
    t2Odds = t2.venue === 'home' ? book1x2.home : book1x2.away;
    if (t1Odds != null && t2Odds != null) oddsSource = 'bookmaker';
  }
  if (oddsSource == null && probability) {
    const t1Implied = impliedOddsFromProb(
      t1.venue === 'home' ? probability.home_win : probability.away_win,
    );
    const t2Implied = impliedOddsFromProb(
      t2.venue === 'home' ? probability.home_win : probability.away_win,
    );
    if (t1Implied != null && t2Implied != null) {
      t1Odds = t1Implied;
      t2Odds = t2Implied;
      oddsSource = 'model';
    }
  }

  return {
    t1,
    t2,
    pointsDiff,
    closeOnTable,
    underdog,
    baselineGap,
    positionGap,
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
      t1Ppg: leaguePpg(t1.points, t1.played),
      t2Ppg: leaguePpg(t2.points, t2.played),
      t1Played: t1.played,
      t2Played: t2.played,
      t1Odds: t1Odds,
      t2Odds: t2Odds,
      oddsSource,
      oddsPending: oddsSource == null && oddsPending,
      h2hMeetings: meetings.length,
      t1H2hWins: countH2hWins(meetings, t1.name),
      t2H2hWins: countH2hWins(meetings, t2.name),
      t1H2hLosses: Math.max(
        countH2hLosses(meetings, t1.name),
        countH2hWins(meetings, t2.name),
      ),
      t1H2hDraws: countH2hDraws(meetings, t1.name),
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
