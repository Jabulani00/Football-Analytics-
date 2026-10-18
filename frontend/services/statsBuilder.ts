/**
 * Real-time stats-table builder — the OddAlerts API is the database.
 *
 * Instead of precomputing 81 tables into SQLite, this derives the stat-table
 * *representation* on the fly from finished fixtures (`/fixtures/between`). Feed
 * it results, get back the same `TeamStatsExport` shape the app already consumes
 * (`data/teamStatsLoader.ts`) — a drop-in, computed live, no database.
 *
 * Tables produced: the full 81 — 5 base families (ordinary/ppg/series/ft_only/
 * league_avg) × period (FT/HT/2H) × scope (overall/home/away) = 45, plus
 * last-10/8/6/5 ordinary windows × period × scope = 36. Named exactly like the
 * SQLite schema (`ordinary_ft_overall`, `series_ht_away`, `last10_2h_home`, …).
 *
 * Pure + dependency-injected: no React Native imports, so it unit-tests under
 * plain Node/tsx and plugs into the live client via `buildLeagueStatsLive`.
 */

import type { ComplianceLevel } from '@/types/analytics';
import type { TeamStatRow, TeamStatsExport } from '@/types/data';
import { setRowGames, type CountedGame } from '@/utils/countedGames';
import { complianceFromPercent } from '@/utils/compliance';
import { bandOf } from '@/utils/leagueTables';
import { SERIES_DEFS } from '@/utils/fixtureSeries';
import type { TeamResult } from '@/utils/teamResults';
import { firstGoalSide } from '@/utils/firstGoal';
// Type-only (stripped at runtime) — keeps this module free of RN imports.
import type { RawFixture } from '@/services/oddAlerts';

// ---- Dimensions (match backend/schema.py) ----------------------------------
const PERIODS = ['ft', 'ht', '2h'] as const;
const SCOPES = ['overall', 'home', 'away'] as const;
/** window prefix -> match count kept (Infinity = whole season). */
const WINDOWS: Record<string, number> = {
  ordinary: Infinity, // season
  last10: 10,
  last8: 8,
  last6: 6,
  last5: 5,
};

type Period = (typeof PERIODS)[number];

/** Ordinary calculations exposed by the frontend, including derived SF/CF rates. */
const ORDINARY_STATS = [
  'sc_pct', 'conc_pct', 'sc_avg', 'conc_avg', 'btts_yes', 'btts_no', 'cs_pct',
  'avg_goals', 'fts_pct', 'w_pct', 'd_pct', 'l_pct', 'over05', 'over15',
  'over25', 'over35', 'over45', 'under05', 'under15', 'under25', 'under35',
  'under45', 'scoring_05', 'conceding_05', 'scoring_15', 'conceding_15',
  'scoring_25', 'conceding_25', 'scored_first', 'handicap', 'early_goals_1h',
  'conceded_first',
  'early_goals_2h', 'early_goals_conceded', 'late_goals',
] as const;

/** Average-valued stats (not 0–100), so no traffic-light signal. */
const AVERAGE_STATS = new Set(['sc_avg', 'conc_avg', 'avg_goals']);

/**
 * Stats that need exact per-goal timing, which `/fixtures/between` does NOT
 * provide (see docs/ODDALERTS_API_GAPS.md). Emitted as null, honestly.
 */
const NOT_DERIVABLE = new Set([
  'handicap', 'early_goals_1h', 'early_goals_2h',
  'early_goals_conceded', 'late_goals',
]);

// ---- Per-team match record --------------------------------------------------
type TeamMatch = {
  teamId: number | null;
  isHome: boolean;
  opponentId: number | null;
  opponentName: string;
  unix: number;
  gfFt: number; gaFt: number; // full-time goals for / against this team
  gfHt: number; gaHt: number; // first-half
  /** False when the feed had no half-time score. Those matches stay out of half rates. */
  htKnown: boolean;
  /** Team-relative order, derived only when final/half-time scores prove it. */
  firstGoal: 'team' | 'opponent' | 'none' | 'unknown';
  id: number;
  match: string;
  score: string;
  competition: string;
};

/** Goals for/against this team in the requested period. */
function periodGoals(m: TeamMatch, period: Period): { gf: number; ga: number } {
  if (period === 'ft') return { gf: m.gfFt, ga: m.gaFt };
  if (period === 'ht') return { gf: m.gfHt, ga: m.gaHt };
  return { gf: m.gfFt - m.gfHt, ga: m.gaFt - m.gaHt }; // 2h = FT - HT
}

function parseHtScore(ht: string | null | undefined): [number, number] | null {
  if (typeof ht !== 'string') return null;
  const match = /^\s*(\d+)\s*[-–]\s*(\d+)\s*$/.exec(ht);
  if (!match) return null;
  const parts = [Number(match[1]), Number(match[2])];
  return parts.every(Number.isSafeInteger) ? [parts[0], parts[1]] : null;
}

function missingHtScore(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

/** 90-minute results only. Extra time, penalties, and awarded scores are not the full-time total. */
function isFinished(fx: RawFixture): boolean {
  return fx.status === 'FT' && validGoal(fx.home_goals) && validGoal(fx.away_goals);
}

function validGoal(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function halfIsUsable(match: TeamMatch): boolean {
  return match.htKnown && match.gfFt >= match.gfHt && match.gaFt >= match.gaHt;
}

/** Full-time uses every FT match. A half uses only a recorded half-time score with a real second half. */
function matchesForPeriod(matches: TeamMatch[], period: Period): TeamMatch[] {
  if (period === 'ft') return matches;
  return matches.filter(halfIsUsable);
}

/** One decimal from the raw hits, so 2/3 is 66.7 and the complement is counted on its own. */
function rate(hits: number, total: number): number {
  return Math.round((hits * 1000) / total) / 10;
}

// ---- Signal ----------------------------------------------------------------
// One definition, shared with every screen: utils/compliance. It mirrors
// `stat_signal` in backend/schema.py, so a row built here and a row exported
// from the database carry the same colour.
const statSignal = (value: number): ComplianceLevel => complianceFromPercent(value);

const round1 = (n: number) => Math.round(n * 10) / 10;

// ---- Core stat computation for one team/period/window -----------------------
function computeStats(matches: TeamMatch[], period: Period): {
  values: Record<string, number | null>;
  sampleSize: number;
} {
  const counted = matchesForPeriod(matches, period);
  const n = counted.length;
  const values: Record<string, number | null> = {};
  for (const key of ORDINARY_STATS) values[key] = null;
  if (n === 0) return { values, sampleSize: 0 };

  const goals = counted.map((m) => periodGoals(m, period));
  const hits = (pred: (g: { gf: number; ga: number }) => boolean) => goals.filter(pred).length;
  const pair = (yesKey: string, noKey: string, pred: (g: { gf: number; ga: number }) => boolean) => {
    const yes = hits(pred);
    values[yesKey] = rate(yes, n);
    values[noKey] = rate(n - yes, n);
  };
  const mean = (sel: (g: { gf: number; ga: number }) => number) =>
    round1(goals.reduce((s, g) => s + sel(g), 0) / n);

  values.sc_pct = rate(hits((g) => g.gf > 0), n);
  values.conc_pct = rate(hits((g) => g.ga > 0), n);
  values.sc_avg = mean((g) => g.gf);
  values.conc_avg = mean((g) => g.ga);
  values.avg_goals = mean((g) => g.gf + g.ga);
  pair('btts_yes', 'btts_no', (g) => g.gf > 0 && g.ga > 0);
  values.cs_pct = rate(hits((g) => g.ga === 0), n);
  values.fts_pct = rate(hits((g) => g.gf === 0), n);
  values.w_pct = rate(hits((g) => g.gf > g.ga), n);
  values.d_pct = rate(hits((g) => g.gf === g.ga), n);
  values.l_pct = rate(hits((g) => g.gf < g.ga), n);

  const over = (line: number, overKey: string, underKey: string) => {
    const yes = hits((g) => g.gf + g.ga > line);
    values[overKey] = rate(yes, n);
    values[underKey] = rate(n - yes, n);
  };
  over(0.5, 'over05', 'under05');
  over(1.5, 'over15', 'under15');
  over(2.5, 'over25', 'under25');
  over(3.5, 'over35', 'under35');
  over(4.5, 'over45', 'under45');

  values.scoring_05 = rate(hits((g) => g.gf >= 1), n);
  values.scoring_15 = rate(hits((g) => g.gf >= 2), n);
  values.scoring_25 = rate(hits((g) => g.gf >= 3), n);
  values.conceding_05 = rate(hits((g) => g.ga >= 1), n);
  values.conceding_15 = rate(hits((g) => g.ga >= 2), n);
  values.conceding_25 = rate(hits((g) => g.ga >= 3), n);

  const firstGoalKnown = period === 'ft' ? counted.filter((m) => m.firstGoal !== 'unknown') : [];
  const firstGoalSample = firstGoalKnown.length;
  values.scored_first = firstGoalSample
    ? rate(firstGoalKnown.filter((m) => m.firstGoal === 'team').length, firstGoalSample)
    : null;
  values.conceded_first = firstGoalSample
    ? rate(firstGoalKnown.filter((m) => m.firstGoal === 'opponent').length, firstGoalSample)
    : null;
  values.first_goal_sample = period === 'ft' ? firstGoalSample : 0;

  return { values, sampleSize: n };
}

// ---- Additional stat families (ppg / series / ft_only / league_avg) --------
/** Streak keys (current consecutive run lengths — raw counts, no signal). */
const LEGACY_SERIES_STATS = [
  'win_streak', 'unbeaten_streak', 'loss_streak', 'btts_streak',
  'over25_streak', 'cs_streak', 'fts_streak', 'scoring_streak',
] as const;

/** The 29 series definitions from the project catalogue, plus legacy aliases. */
export const SERIES_STATS = [...SERIES_DEFS.map((def) => def.key), ...LEGACY_SERIES_STATS] as const;

/** Full-time-only outcome patterns. Percentages, plus two raw point averages. */
export const FT_ONLY_STATS = [
  'btts_both_halves', 'scored_both_halves', 'btts_over25', 'conceded_both_halves',
  'won_both_halves', 'win_to_nil', 'lost_to_nil', 'rescued_points', 'blown_points',
  'htft_ww', 'htft_wd', 'htft_wl', 'htft_dw', 'htft_dd', 'htft_dl',
  'htft_lw', 'htft_ld', 'htft_ll', 'led_ht',
] as const;

/** 1st-half or 2nd-half catalogue lines for the period the row was built in. */
export const HALF_ONLY_STATS = ['half_nil', 'half_under05', 'half_over15', 'half_avg'] as const;

/** Points-per-game family adds `ppg`/`avg_pts` on top of the ordinary stats. */
export const PPG_STATS = ['ppg', 'avg_pts', 'ppg_vs_green', 'ppg_vs_yellow', 'ppg_vs_red'] as const;

const RAW_KEYS = new Set<string>([
  ...SERIES_STATS, ...PPG_STATS, ...AVERAGE_STATS,
  'rescued_points', 'blown_points', 'rescued_n', 'blown_n', 'half_avg',
]);

/** Current consecutive run of matches (newest-first) satisfying `pred`. */
function streak(matches: TeamMatch[], period: Period, pred: (g: { gf: number; ga: number }) => boolean): number {
  let n = 0;
  for (const m of matches) {
    if (pred(periodGoals(m, period))) n += 1;
    else break;
  }
  return n;
}

function computeSeries(matches: TeamMatch[], period: Period): Record<string, number | null> {
  // For a current streak, an unknown newest half-score breaks observability:
  // skipping that match would falsely continue a run from older matches.
  const counted = period === 'ft'
    ? matches
    : matches.slice(0, matches.findIndex((match) => !halfIsUsable(match)) < 0
      ? matches.length
      : matches.findIndex((match) => !halfIsUsable(match)));
  if (counted.length === 0) return Object.fromEntries(SERIES_STATS.map((key) => [key, null]));
  const results: TeamResult[] = counted.map((match) => {
    const goals = periodGoals(match, period);
    const outcome = goals.gf > goals.ga ? 'W' : goals.gf < goals.ga ? 'L' : 'D';
    return {
      fixtureId: match.id,
      unix: match.unix,
      teamId: match.teamId ?? 0,
      opponentId: match.opponentId,
      opponentName: match.opponentName,
      isHome: match.isHome,
      gf: goals.gf,
      ga: goals.ga,
      outcome,
      opponentRank: null,
      teamRank: null,
      opponentAbove: null,
      goalDiff: goals.gf - goals.ga,
      htGf: match.htKnown ? match.gfHt : null,
      htGa: match.htKnown ? match.gaHt : null,
    };
  });
  const values: Record<string, number | null> = {};
  const seriesRun = (pred: (result: TeamResult) => boolean) => {
    let length = 0;
    for (const result of results) {
      if (!pred(result)) break;
      length += 1;
    }
    return length;
  };
  for (const def of SERIES_DEFS) {
    const pred = def.invert ? (result: TeamResult) => !def.hit(result) : def.hit;
    values[def.key] = seriesRun(pred);
  }
  // Keep the original compact names used by older fixture and board views.
  values.win_streak = streak(counted, period, (goals) => goals.gf > goals.ga);
  values.unbeaten_streak = streak(counted, period, (goals) => goals.gf >= goals.ga);
  values.loss_streak = streak(counted, period, (goals) => goals.gf < goals.ga);
  values.btts_streak = streak(counted, period, (goals) => goals.gf > 0 && goals.ga > 0);
  values.over25_streak = streak(counted, period, (goals) => goals.gf + goals.ga > 2);
  values.cs_streak = streak(counted, period, (goals) => goals.ga === 0);
  values.fts_streak = streak(counted, period, (goals) => goals.gf === 0);
  values.scoring_streak = streak(counted, period, (goals) => goals.gf > 0);
  return values;
}

function computePpg(matches: TeamMatch[], period: Period): number | null {
  const counted = matchesForPeriod(matches, period);
  if (counted.length === 0) return null;
  let pts = 0;
  for (const m of counted) {
    const g = periodGoals(m, period);
    pts += g.gf > g.ga ? 3 : g.gf === g.ga ? 1 : 0;
  }
  return Math.round((pts / counted.length) * 100) / 100;
}

type HalfResult = 'w' | 'd' | 'l';

function halfResult(gf: number, ga: number): HalfResult {
  return gf > ga ? 'w' : gf === ga ? 'd' : 'l';
}

const HTFT_KEY: Record<HalfResult, Record<HalfResult, string>> = {
  w: { w: 'htft_ww', d: 'htft_wd', l: 'htft_wl' },
  d: { w: 'htft_dw', d: 'htft_dd', l: 'htft_dl' },
  l: { w: 'htft_lw', d: 'htft_ld', l: 'htft_ll' },
};

function secondHalf(m: TeamMatch): { gf: number; ga: number } {
  return { gf: m.gfFt - m.gfHt, ga: m.gaFt - m.gaHt };
}

function pointsTaken(match: TeamMatch): number {
  if (match.gfFt > match.gaFt) return 3;
  if (match.gfFt === match.gaFt) return 1;
  return 0;
}

function pointsDropped(match: TeamMatch): number {
  if (match.gfFt < match.gaFt) return 3;
  if (match.gfFt === match.gaFt) return 2;
  return 0;
}

function computeFtOnly(matches: TeamMatch[]): Record<string, number | null> {
  const blank = Object.fromEntries(FT_ONLY_STATS.map((k) => [k, null])) as Record<string, number | null>;
  if (matches.length === 0) return { ...blank, rescued_n: null, blown_n: null };
  const known = matches.filter(halfIsUsable);
  const pctOf = (pool: TeamMatch[], pred: (m: TeamMatch) => boolean) =>
    pool.length === 0 ? null : rate(pool.filter(pred).length, pool.length);
  const htft: Record<string, number | null> = {};
  for (const key of ['htft_ww', 'htft_wd', 'htft_wl', 'htft_dw', 'htft_dd', 'htft_dl', 'htft_lw', 'htft_ld', 'htft_ll']) {
    htft[key] = known.length === 0 ? null : 0;
  }
  if (known.length > 0) {
    const counts = new Map<string, number>();
    for (const m of known) {
      const key = HTFT_KEY[halfResult(m.gfHt, m.gaHt)][halfResult(m.gfFt, m.gaFt)];
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const key of Object.keys(htft)) {
      htft[key] = rate(counts.get(key) ?? 0, known.length);
    }
  }
  const trailed = known.filter((m) => m.gfHt < m.gaHt);
  const led = known.filter((m) => m.gfHt > m.gaHt);
  const situationAvg = (pool: TeamMatch[], pick: (m: TeamMatch) => number) =>
    pool.length === 0 ? null : Math.round((pool.reduce((sum, m) => sum + pick(m), 0) / pool.length) * 100) / 100;
  return {
    ...blank,
    btts_both_halves: pctOf(known, (m) => {
      const sh = secondHalf(m);
      return m.gfHt > 0 && m.gaHt > 0 && sh.gf > 0 && sh.ga > 0;
    }),
    scored_both_halves: pctOf(known, (m) => m.gfHt > 0 && secondHalf(m).gf > 0),
    btts_over25: pctOf(matches, (m) => m.gfFt > 0 && m.gaFt > 0 && m.gfFt + m.gaFt > 2.5),
    conceded_both_halves: pctOf(known, (m) => m.gaHt > 0 && secondHalf(m).ga > 0),
    won_both_halves: pctOf(known, (m) => m.gfHt > m.gaHt && secondHalf(m).gf > secondHalf(m).ga),
    win_to_nil: pctOf(matches, (m) => m.gfFt > m.gaFt && m.gaFt === 0),
    lost_to_nil: pctOf(matches, (m) => m.gfFt < m.gaFt && m.gfFt === 0),
    rescued_points: situationAvg(trailed, pointsTaken),
    blown_points: situationAvg(led, pointsDropped),
    rescued_n: trailed.length,
    blown_n: led.length,
    ...htft,
    led_ht: pctOf(known, (m) => m.gfHt > m.gaHt),
  };
}

/** 0–0, under 0.5, over 1.5, and average goals for one half. */
function computeHalfOnly(matches: TeamMatch[], period: 'ht' | '2h'): Record<string, number | null> {
  const blank = Object.fromEntries(HALF_ONLY_STATS.map((k) => [k, null])) as Record<string, number | null>;
  const known = matchesForPeriod(matches, period);
  if (known.length === 0) return blank;
  const totals = known.map((m) =>
    period === 'ht' ? m.gfHt + m.gaHt : m.gfFt - m.gfHt + (m.gaFt - m.gaHt),
  );
  const n = totals.length;
  const pct = (pred: (total: number) => boolean) => rate(totals.filter(pred).length, n);
  return {
    half_nil: pct((total) => total === 0),
    half_under05: pct((total) => total < 0.5),
    half_over15: pct((total) => total > 1.5),
    half_avg: Math.round((totals.reduce((sum, total) => sum + total, 0) / n) * 10) / 10,
  };
}

// ---- Build the representation ------------------------------------------------
type TeamKey = string; // `${leagueId}::${teamName}`

export type BuildOptions = {
  fixtures: RawFixture[];
  season?: string;
  /** Current league ranks used to classify opponents into the live table thirds. */
  teamRanks?: { teamId: number; rank: number }[];
  /** How to label a fixture's league in the representation (default: competition_id). */
  leagueKey?: (fx: RawFixture) => string;
};

function makeRow(
  name: string,
  league: string,
  season: string,
  values: Record<string, number | null>,
  sample: number,
): TeamStatRow {
  const row: TeamStatRow = { team_name: name, league_id: league, season };
  for (const [key, v] of Object.entries(values)) {
    row[key] = v ?? Number.NaN; // NaN → JSON null; keeps the column present
    row[`${key}_signal`] =
      v == null || RAW_KEYS.has(key) || NOT_DERIVABLE.has(key) ? '' : statSignal(v);
  }
  (row as Record<string, unknown>).sample_size = sample;
  return row;
}

function countedFrom(matches: TeamMatch[]): CountedGame[] {
  return matches.map((match) => ({
    id: match.id,
    unix: match.unix,
    match: match.match,
    score: match.score,
    detail: `${match.competition}${match.isHome ? ' · Home' : ' · Away'}`,
    htKnown: match.htKnown,
    firstGoal: match.firstGoal,
    halfValid: halfIsUsable(match),
    ftFor: match.gfFt,
    ftAgainst: match.gaFt,
    htFor: match.htKnown ? match.gfHt : null,
    htAgainst: match.htKnown ? match.gaHt : null,
    trailed: halfIsUsable(match) && match.gfHt < match.gaHt,
    led: halfIsUsable(match) && match.gfHt > match.gaHt,
  }));
}

const RATE_KEYS = [
  'sc_pct', 'conc_pct', 'btts_yes', 'btts_no', 'cs_pct', 'fts_pct', 'w_pct', 'd_pct', 'l_pct',
  'over05', 'over15', 'over25', 'over35', 'over45', 'under05', 'under15', 'under25', 'under35', 'under45',
  'scoring_05', 'conceding_05', 'scoring_15', 'conceding_15', 'scoring_25', 'conceding_25', 'scored_first', 'conceded_first',
] as const;

const SUM_KEYS = ['sc_avg', 'conc_avg', 'avg_goals'] as const;

type Goal = { gf: number; ga: number };

const RATE_PREDICATE: Record<(typeof RATE_KEYS)[number], (g: Goal) => boolean> = {
  sc_pct: (g) => g.gf > 0,
  conc_pct: (g) => g.ga > 0,
  btts_yes: (g) => g.gf > 0 && g.ga > 0,
  btts_no: (g) => !(g.gf > 0 && g.ga > 0),
  cs_pct: (g) => g.ga === 0,
  fts_pct: (g) => g.gf === 0,
  w_pct: (g) => g.gf > g.ga,
  d_pct: (g) => g.gf === g.ga,
  l_pct: (g) => g.gf < g.ga,
  over05: (g) => g.gf + g.ga > 0.5,
  under05: (g) => !(g.gf + g.ga > 0.5),
  over15: (g) => g.gf + g.ga > 1.5,
  under15: (g) => !(g.gf + g.ga > 1.5),
  over25: (g) => g.gf + g.ga > 2.5,
  under25: (g) => !(g.gf + g.ga > 2.5),
  over35: (g) => g.gf + g.ga > 3.5,
  under35: (g) => !(g.gf + g.ga > 3.5),
  over45: (g) => g.gf + g.ga > 4.5,
  under45: (g) => !(g.gf + g.ga > 4.5),
  scoring_05: (g) => g.gf >= 1,
  scoring_15: (g) => g.gf >= 2,
  scoring_25: (g) => g.gf >= 3,
  conceding_05: (g) => g.ga >= 1,
  conceding_15: (g) => g.ga >= 2,
  conceding_25: (g) => g.ga >= 3,
  scored_first: () => false,
  conceded_first: () => false,
};

type LeaguePool = { games: number; hits: Record<string, number>; sums: Record<string, number>; firstGoalSample: number; firstGoalHits: Record<string, number> };

function emptyPool(): LeaguePool {
  return { games: 0, hits: {}, sums: {}, firstGoalSample: 0, firstGoalHits: {} };
}

function addToPool(pool: LeaguePool, matches: TeamMatch[], period: Period) {
  const goals = matches.map((match) => periodGoals(match, period));
  pool.games += goals.length;
  for (const key of RATE_KEYS) {
    if (key !== 'scored_first' && key !== 'conceded_first') {
      pool.hits[key] = (pool.hits[key] ?? 0) + goals.filter(RATE_PREDICATE[key]).length;
    }
  }
  if (period === 'ft') {
    const known = matches.filter((match) => match.firstGoal !== 'unknown');
    pool.firstGoalSample += known.length;
    pool.firstGoalHits.scored_first = (pool.firstGoalHits.scored_first ?? 0) + known.filter((m) => m.firstGoal === 'team').length;
    pool.firstGoalHits.conceded_first = (pool.firstGoalHits.conceded_first ?? 0) + known.filter((m) => m.firstGoal === 'opponent').length;
  }
  for (const match of goals) {
    pool.sums.sc_avg = (pool.sums.sc_avg ?? 0) + match.gf;
    pool.sums.conc_avg = (pool.sums.conc_avg ?? 0) + match.ga;
    pool.sums.avg_goals = (pool.sums.avg_goals ?? 0) + match.gf + match.ga;
  }
}

/**
 * Build the full 81-table `TeamStatsExport` live from finished fixtures:
 * 5 base families (ordinary/ppg/series/ft_only/league_avg) × period × scope (45)
 * + last-10/8/6/5 ordinary windows × period × scope (36).
 */
export function buildStatsTables(opts: BuildOptions): TeamStatsExport {
  const leagueKey = opts.leagueKey ?? ((fx) => String(fx.competition_id));
  const season = opts.season ?? '';
  const teamRanks = opts.teamRanks ?? [];
  const bandByTeam = new Map(
    teamRanks.map((team) => [team.teamId, bandOf(team.rank, teamRanks.length)]),
  );

  // 1) Collect each team's finished matches.
  const teamMatches = new Map<TeamKey, { name: string; league: string; teamId: number | null; matches: TeamMatch[] }>();
  const add = (name: string, league: string, teamId: number | null, m: TeamMatch) => {
    const key = `${league}::${name}`;
    let entry = teamMatches.get(key);
    if (!entry) { entry = { name, league, teamId, matches: [] }; teamMatches.set(key, entry); }
    else if (entry.teamId == null && teamId != null) entry.teamId = teamId;
    entry.matches.push(m);
  };

  const completedById = new Map<number, RawFixture>();
  let duplicateCompletedFixtures = 0;
  for (const fx of opts.fixtures) {
    if (fx.status !== 'FT') continue;
    if (completedById.has(fx.id)) {
      duplicateCompletedFixtures += 1;
      continue;
    }
    completedById.set(fx.id, fx);
  }
  const completedFixtures = [...completedById.values()];
  const usableFullTimeScores = completedFixtures.filter(isFinished);
  const qualityIssues: NonNullable<TeamStatsExport['data_quality']>['issues'] = [];
  for (const fx of completedFixtures) {
    const match = `${fx.home_name || `Fixture ${fx.id}`} vs ${fx.away_name || 'Unknown team'}`;
    if (!validGoal(fx.home_goals) || !validGoal(fx.away_goals)) {
      const fields = [
        ...(!validGoal(fx.home_goals) ? ['home_goals'] : []),
        ...(!validGoal(fx.away_goals) ? ['away_goals'] : []),
      ];
      qualityIssues.push({
        match, fields,
        categories: ['Scores', 'SL-STATS', 'Ordinary', 'Additional', 'FT-Only', 'Last-N', 'League Stats'],
        reason: 'missing_or_invalid_full_time_score',
      });
      continue;
    }
    if (missingHtScore(fx.ht_score)) {
      qualityIssues.push({
        match, fields: ['ht_score'], categories: ['SL-STATS', 'FT-Only (half-dependent metrics)'],
        reason: 'missing_half_time_score',
      });
      continue;
    }
    const ht = parseHtScore(fx.ht_score);
    if (ht == null || ht[0] > fx.home_goals || ht[1] > fx.away_goals) {
      qualityIssues.push({
        match, fields: ['ht_score'], categories: ['SL-STATS', 'FT-Only (half-dependent metrics)'],
        reason: 'invalid_half_time_score',
      });
    }
  }
  const missingHalfTimeScores = usableFullTimeScores.filter((fx) => missingHtScore(fx.ht_score)).length;
  const invalidHalfTimeScores = usableFullTimeScores.filter((fx) => {
    if (missingHtScore(fx.ht_score)) return false;
    const ht = parseHtScore(fx.ht_score);
    return ht == null || ht[0] > (fx.home_goals as number) || ht[1] > (fx.away_goals as number);
  }).length;

  for (const fx of usableFullTimeScores) {
    if (!isFinished(fx)) continue;
    if (typeof fx.home_name !== 'string' || !fx.home_name.trim() || typeof fx.away_name !== 'string' || !fx.away_name.trim() || !Number.isFinite(fx.unix)) continue;
    const league = leagueKey(fx);
    const hg = fx.home_goals as number;
    const ag = fx.away_goals as number;
    const ht = parseHtScore(fx.ht_score);
    const htKnown = ht != null;
    const firstScorer = firstGoalSide(hg, ag, fx.ht_score);
    const [hHt, aHt] = ht ?? [0, 0];
    const score = `${hg}-${ag}`;
    const match = `${fx.home_name} ${score} ${fx.away_name}`;
    const competition = fx.competition_name || league;
    add(fx.home_name, league, fx.home_id, {
      teamId: fx.home_id,
      isHome: true, opponentId: fx.away_id, opponentName: fx.away_name, unix: fx.unix, gfFt: hg, gaFt: ag, gfHt: hHt, gaHt: aHt, htKnown,
      firstGoal: firstScorer === 'home' ? 'team' : firstScorer === 'away' ? 'opponent' : firstScorer,
      id: fx.id, match, score, competition,
    });
    add(fx.away_name, league, fx.away_id, {
      teamId: fx.away_id,
      isHome: false, opponentId: fx.home_id, opponentName: fx.home_name, unix: fx.unix, gfFt: ag, gaFt: hg, gfHt: aHt, gaHt: hHt, htKnown,
      firstGoal: firstScorer === 'away' ? 'team' : firstScorer === 'home' ? 'opponent' : firstScorer,
      id: fx.id, match, score, competition,
    });
  }

  const tables: Record<string, TeamStatRow[]> = {};
  const ensure = (t: string) => (tables[t] ??= []);
  const pools = new Map<string, LeaguePool>();

  const ordinaryValues = (windowed: TeamMatch[], period: Period): Record<string, number | null> => {
    const { values } = computeStats(windowed, period);
    return values;
  };

  // 2) Per team: base families (season window) + last-N ordinary windows.
  for (const { name, league, teamId, matches } of teamMatches.values()) {
    const sorted = [...matches].sort((a, b) => b.unix - a.unix); // newest first
    for (const scope of SCOPES) {
      const scoped = sorted.filter(
        (m) => scope === 'overall' || (scope === 'home' ? m.isHome : !m.isHome),
      );
      for (const period of PERIODS) {
        const counted = matchesForPeriod(scoped, period);
        const ord = ordinaryValues(counted, period);
        const sample = counted.length;
        const seasonGames = countedFrom(counted);
        const poolKey = `${period}_${scope}`;
        const pool = pools.get(poolKey) ?? emptyPool();
        addToPool(pool, counted, period);
        pools.set(poolKey, pool);
        const withGames = (row: TeamStatRow, games: CountedGame[]) => {
          if (teamId != null) row.team_id = teamId;
          setRowGames(row, games);
          return row;
        };
        ensure(`ordinary_${period}_${scope}`).push(withGames(makeRow(name, league, season, ord, sample), seasonGames));
        const ppg = computePpg(counted, period);
        const tierPpg = (band: 'green' | 'yellow' | 'red') => {
          const againstBand = counted.filter((match) => bandByTeam.get(match.opponentId ?? -1) === band);
          return computePpg(againstBand, period);
        };
        ensure(`ppg_${period}_${scope}`).push(
          withGames(makeRow(name, league, season, {
            ppg,
            avg_pts: ppg,
            ppg_vs_green: tierPpg('green'),
            ppg_vs_yellow: tierPpg('yellow'),
            ppg_vs_red: tierPpg('red'),
            ...ord,
          }, sample), seasonGames),
        );
        ensure(`series_${period}_${scope}`).push(
          withGames(makeRow(name, league, season, computeSeries(scoped, period), sample), seasonGames),
        );
        const half =
          period === 'ft'
            ? (Object.fromEntries(HALF_ONLY_STATS.map((k) => [k, null])) as Record<string, number | null>)
            : computeHalfOnly(counted, period);
        const ftValues = computeFtOnly(scoped);
        const ftRow = makeRow(name, league, season, { ...ftValues, ...half, ...ord }, sample);
        (ftRow as Record<string, unknown>).ht_sample = scoped.filter(halfIsUsable).length;
        ensure(`ft_only_${period}_${scope}`).push(withGames(ftRow, period === 'ft' ? countedFrom(scoped) : seasonGames));
        for (const [winPrefix, winSize] of Object.entries(WINDOWS)) {
          if (winPrefix === 'ordinary') continue;
          const windowed = counted.slice(0, winSize);
          const recentPpg = computePpg(windowed, period);
          const recentTierPpg = (band: 'green' | 'yellow' | 'red') => computePpg(
            windowed.filter((match) => bandByTeam.get(match.opponentId ?? -1) === band),
            period,
          );
          const recentHalf = period === 'ft'
            ? Object.fromEntries(HALF_ONLY_STATS.map((key) => [key, null])) as Record<string, number | null>
            : computeHalfOnly(windowed, period);
          const recentFtOnly = computeFtOnly(windowed);
          ensure(`${winPrefix}_${period}_${scope}`).push(
            withGames(
              makeRow(name, league, season, {
                ...ordinaryValues(windowed, period),
                ppg: recentPpg,
                avg_pts: recentPpg,
                ppg_vs_green: recentTierPpg('green'),
                ppg_vs_yellow: recentTierPpg('yellow'),
                ppg_vs_red: recentTierPpg('red'),
                ...computeSeries(windowed, period),
                ...recentFtOnly,
                ...recentHalf,
              }, windowed.length),
              countedFrom(windowed),
            ),
          );
        }
      }
    }
  }

  // League rows pool the same hits and games, so a one-game team cannot move the league like a full season.
  for (const scope of SCOPES) {
    for (const period of PERIODS) {
      const pool = pools.get(`${period}_${scope}`) ?? emptyPool();
      const avg: Record<string, number | null> = {};
      for (const key of ORDINARY_STATS) {
        if (NOT_DERIVABLE.has(key)) { avg[key] = null; continue; }
        if (key === 'scored_first' || key === 'conceded_first') {
          avg[key] = period === 'ft' && pool.firstGoalSample
            ? rate(pool.firstGoalHits[key] ?? 0, pool.firstGoalSample)
            : null;
          avg.first_goal_sample = period === 'ft' ? pool.firstGoalSample : 0;
          continue;
        }
        if ((SUM_KEYS as readonly string[]).includes(key)) {
          avg[key] = pool.games ? round1((pool.sums[key] ?? 0) / pool.games) : null;
          continue;
        }
        avg[key] = pool.games ? rate(pool.hits[key] ?? 0, pool.games) : null;
      }
      ensure(`league_avg_${period}_${scope}`).push(makeRow('League', String(scope), season, avg, pool.games));
    }
  }

  return {
    meta: {
      tables: Object.keys(tables).length,
      statsPerTable: ORDINARY_STATS.length,
      exported_at: new Date().toISOString(),
    },
    data_quality: {
      fixturesReceived: opts.fixtures.length,
      completedFixtures: completedFixtures.length,
      usableFullTimeScores: usableFullTimeScores.length,
      missingOrInvalidFullTimeScores: completedFixtures.length - usableFullTimeScores.length,
      missingHalfTimeScores,
      invalidHalfTimeScores,
      duplicateCompletedFixtures,
      issues: qualityIssues,
    },
    tables,
  };
}

// ---- Live wrapper (dependency-injected fetcher, no RN import here) -----------
export type FixturesFetcher = (opts: {
  fromUnix: number;
  toUnix: number;
  competitions?: string;
  maxPages?: number;
  cache?: 'off';
}) => Promise<RawFixture[]>;

/**
 * Fetch a competition's finished results and build its stat tables live.
 * Pass `fetchAllFixturesBetween` from `services/oddAlerts` as the fetcher.
 */
export async function buildLeagueStatsLive(
  fetcher: FixturesFetcher,
  opts: {
    competitionId: number | string;
    fromUnix: number;
    toUnix: number;
    season?: string;
    teamRanks?: { teamId: number; rank: number }[];
    maxPages?: number;
    cache?: 'off';
  },
): Promise<TeamStatsExport> {
  const fixtures = await fetcher({
    fromUnix: opts.fromUnix,
    toUnix: opts.toUnix,
    competitions: String(opts.competitionId),
    maxPages: opts.maxPages ?? 6,
    cache: opts.cache,
  });
  return buildStatsTables({
    fixtures,
    season: opts.season,
    teamRanks: opts.teamRanks,
    leagueKey: () => String(opts.competitionId),
  });
}

// Exposed for tests / reuse.
export const __internals = { computeStats, periodGoals, parseHtScore, statSignal, ORDINARY_STATS, NOT_DERIVABLE };
