/**
 * Strategy Builder — the orchestration / query layer over the analytics engines
 * the app already has. It owns no statistics of its own: every dimension below
 * delegates to an existing engine (Stats Characters, Stats Grading M1/M2,
 * Dominance, Opposite Stats, Gap Analysis, the Stats-call grid) and only reshapes
 * that engine's output into a common per-team result so conditions can be combined
 * with AND / OR logic and classified green / yellow / red.
 *
 * Pure: no network, no React. The panel feeds it per-league bundles (a built
 * TeamStatsExport and/or the season's raw fixtures) and the user's conditions.
 */
import type { TeamStatRow, TeamStatsExport } from '@/types/data';
import type { RawFixture, TeamGoalTiming } from '@/services/oddAlerts';
import { differenceDaBand } from '@/utils/daBands';
import {
  DOMINANCE_STATS, HALF_STATS, buildHalfDominance, buildHomeAwayDominance, type StatDef,
} from '@/utils/dominance';
import {
  GRADABLE_STATS, SOURCE_LISTS, directionOf, gradableStatLabel, gradeAllTeamsForStat,
  type Grade, type RomanGrade, type SourceListId, type TeamGradeRow,
} from '@/utils/statsGrading';
import { statStreaksFor, type StatStreaks } from '@/utils/fixtureRfs';
import { filterScope, teamResultsFromFixtures, type TeamResult } from '@/utils/teamResults';
import { buildMethod2Grid } from '@/utils/statsGradingMethod2';
import { OPPOSITE_PAIRS, buildOppositeStats, type OppositeScope } from '@/utils/oppositeStats';
import {
  GAP_MARKETS, analyzeTeamGames, analyzeTeamGoals,
  type GapMarket, type GapPeriod, type GoalTeamAnalysis,
} from '@/utils/gapAnalytics';
import { SERIES_DEFS } from '@/utils/fixtureSeries';
import { liveRowsToDisplay } from '@/utils/statsTableAdapter';
import {
  TRANSCRIBED_STATS, HALF_CHOICE_KEYS, renderMixedValue, transcribedTeamRows, type TranscribedSources,
} from '@/utils/mixedTranscribed';
import { buildOmitTestFromExport, type OmitDirection } from '@/utils/omitTest';
import {
  STATS_CHARACTERS, characterFor, levelForAvgM1, levelForRankM2,
  levelGlyph, MIN_GAMES_OVERALL, MIN_GAMES_PER_VENUE, type CharColour, type CharLevel,
} from '@/utils/statsCharacters';
import { predictFromStats, type FixturePrediction, type LeagueBaseline, type VenueStats } from '@/services/predictionEngine';
import { buildRecommendation, type FixtureRecommendation, type MarketModule } from '@/utils/fixtureRecommendation';
import { theme } from '@/styles/theme';

/* ----------------------------------------------------------------- common types */

/** FT/1H/2H × Overall/Home/Away. A single value encodes both the half and the
 *  venue; the global panel sets it for every condition. */
export type StrategyPeriod =
  | 'overall' | 'home' | 'away'
  | 'firsthalf' | 'firsthalf_home' | 'firsthalf_away'
  | 'secondhalf' | 'secondhalf_home' | 'secondhalf_away'
  /** Goal-timing windows — the measured 15-minute buckets (overall only). */
  | 'first15' | 'last20';
export type StatHalf = 'ft' | 'ht' | '2h';
export type StatScope = 'overall' | 'home' | 'away';
export type ResultColor = 'green' | 'yellow' | 'red' | 'none';

/** Split a period into its half (ft/ht/2h) and venue scope. */
export function splitPeriod(p: StrategyPeriod): { half: StatHalf; scope: StatScope } {
  switch (p) {
    case 'home': return { half: 'ft', scope: 'home' };
    case 'away': return { half: 'ft', scope: 'away' };
    case 'firsthalf': return { half: 'ht', scope: 'overall' };
    case 'firsthalf_home': return { half: 'ht', scope: 'home' };
    case 'firsthalf_away': return { half: 'ht', scope: 'away' };
    case 'secondhalf': return { half: '2h', scope: 'overall' };
    case 'secondhalf_home': return { half: '2h', scope: 'home' };
    case 'secondhalf_away': return { half: '2h', scope: 'away' };
    default: return { half: 'ft', scope: 'overall' };
  }
}
/** Build a period from a half + venue (the global panel's two axes). */
export function periodFrom(half: StatHalf, scope: StatScope): StrategyPeriod {
  if (half === 'ht') return scope === 'home' ? 'firsthalf_home' : scope === 'away' ? 'firsthalf_away' : 'firsthalf';
  if (half === '2h') return scope === 'home' ? 'secondhalf_home' : scope === 'away' ? 'secondhalf_away' : 'secondhalf';
  return scope === 'home' ? 'home' : scope === 'away' ? 'away' : 'overall';
}
function isHalf(p: StrategyPeriod): boolean { return splitPeriod(p).half !== 'ft'; }

export const PERIODS: { value: StrategyPeriod; label: string }[] = [
  { value: 'overall', label: 'Overall' }, { value: 'home', label: 'Home' }, { value: 'away', label: 'Away' },
];
export function periodLabel(p: StrategyPeriod): string {
  if (p === 'first15') return 'First 15′';
  if (p === 'last20') return 'Last 20′';
  const { half, scope } = splitPeriod(p);
  const h = half === 'ft' ? 'FT' : half === 'ht' ? '1H' : '2H';
  return `${h}${scope === 'home' ? ' Home' : scope === 'away' ? ' Away' : ''}`;
}
/** A goal-timing window period (measured 15-min buckets). */
export function isWindowPeriod(p: StrategyPeriod): boolean {
  return p === 'first15' || p === 'last20';
}

/** One team's reading for one condition, in a shape common to every engine. */
export type TeamEval = {
  teamId: number | null;
  team: string;
  competition: string;
  qualifies: boolean;
  value: number | null;
  valueText: string;
  grade: string | null;
  color: ResultColor;
  dimensionId: string;
  dimensionLabel: string;
  /** Exact feature / stat name from the engine. */
  feature: string;
  /** Exact method / option description from the engine. */
  method: string;
  period: StrategyPeriod;
  reason: string;
  sample: number | null;
  /** The condition this eval proves — set when assembled into a result. */
  conditionId?: string;
  /** Combined-list rank for grading (1 = strongest · Strong I … 14 = weakest · Weak VII). */
  rank?: number;
  /** Grading only: which column (Ordinary / +Series / …) the headline qualified in. */
  gradeColumn?: QualColumn;
  /** Grading only: every grade-group · column this team qualifies for, strongest first. */
  qualifications?: GradeQualification[];
  /** The Home vs Overall readings that quantify a DA (Double Agent) — their
   *  divergence is what makes a B/E grade a DA. Set for every combined-list grade. */
  daInfo?: { home: number | null; overall: number | null };
};

/* ---- grading grade-group × column qualifications (doc Page 1) ---- */

/** The four columns a graded stat can qualify in (doc Page 1, exact terms). */
export type QualColumn = 'ordinary' | 'series' | 'ordinary_rfs' | 'series_rfs';
export const COLUMN_LABEL: Record<QualColumn, string> = {
  ordinary: 'Ordinary',
  series: '+ Series',
  ordinary_rfs: 'Ordinary + RFS',
  series_rfs: 'Series + RFS',
};
/** Column preference within a grade group (best → worst): a confirmed live run is
 *  the premium signal, then a clean ordinary read, then the recency-failure
 *  columns (cautionary — the usual just broke). */
const COLUMN_RANK: Record<QualColumn, number> = { series: 0, ordinary: 1, ordinary_rfs: 2, series_rfs: 3 };
export const QUAL_COLUMNS: { value: QualColumn; label: string }[] =
  (['ordinary', 'series', 'ordinary_rfs', 'series_rfs'] as QualColumn[]).map((c) => ({ value: c, label: COLUMN_LABEL[c] }));

/** One grade-group · column a team qualifies for (doc: "grade + column"). */
export type GradeQualification = {
  source: SourceListId;
  roman: RomanGrade;
  letter: Grade;
  direction: 'strong' | 'weak';
  da: boolean;
  column: QualColumn;
  /** Combined-list group rank (1 = Strong I … 14 = Weak VII). */
  groupRank: number;
  /** Lower = stronger overall — group rank first, then column preference. */
  overallRank: number;
  /** Combined-list identity, e.g. "1·A". */
  combined: string;
};

export type MethodOpt = { value: string; label: string };
/**
 * A condition selector. 'select' (default) renders as a dropdown of `options`;
 * 'number' renders as a numeric text input (used for a ≥/≤ limit value). An
 * option can hide itself for the current selection via `visible`.
 */
export type OptionDef = {
  key: string;
  label: string;
  options: MethodOpt[];
  default: string;
  kind?: 'select' | 'number';
  visible?: (options: Record<string, string>) => boolean;
};

/** One team's measured goal-timing for a season (overall only — the feed has no venue split). */
export type TimingRow = { team: string; teamId: number | null; timing: TeamGoalTiming };

/** A league's prepared data: the built export, its season fixtures, and/or the
 *  per-team goal-timing windows (first-15 / last-20, from stats/season). */
export type LeagueBundle = { competition: string; stats?: TeamStatsExport; fixtures?: RawFixture[]; timing?: TimingRow[] };

export type Selection = { period: StrategyPeriod; methodId: string; options: Record<string, string> };

export type Dimension = {
  id: string;
  label: string;
  /** Which prepared data this dimension reads. */
  source: 'export' | 'fixtures';
  periods: StrategyPeriod[];
  /** Feature list for the chosen period (includes an "All" entry where it applies). */
  methods: (period: StrategyPeriod) => MethodOpt[];
  /**
   * Feature list when it depends on the chosen options (e.g. the Stat filter's
   * family drives which stats are offered). When present the panel uses this
   * instead of `methods`, and resets the method if the option changes it away.
   */
  methodsFor?: (period: StrategyPeriod, options: Record<string, string>) => MethodOpt[];
  /** Extra selectors (method, direction, grade, band…) beyond the feature. */
  options?: OptionDef[];
  /** Teams that QUALIFY for this condition, with their exact reading. */
  evaluate: (bundle: LeagueBundle, sel: Selection) => TeamEval[];
};

/* ----------------------------------------------------------------- small helpers */

const ALL = 'all';
const norm = (s: string) => s.trim().toLowerCase();
export const teamKeyOf = (e: { teamId: number | null; team: string }) =>
  e.teamId == null ? `name:${norm(e.team)}` : `id:${e.teamId}`;

function numTeamId(row: TeamStatRow | undefined): number | null {
  const raw = row?.['team_id'];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}
function roster(stats: TeamStatsExport): { team: string; teamId: number | null }[] {
  return (stats.tables['ordinary_ft_overall'] ?? []).map((r) => ({ team: String(r.team_name), teamId: numTeamId(r) }));
}
function tableVal(stats: TeamStatsExport, family: string, periodKey: string, scope: string, team: string, key: string): number | null {
  const rows = stats.tables[`${family}_${periodKey}_${scope}`] ?? [];
  const row = rows.find((r) => norm(String(r.team_name)) === norm(team));
  const cell = row?.[key];
  return typeof cell === 'number' && Number.isFinite(cell) ? cell : null;
}
/** Where a period reads from in the export tables. */
function exportLoc(p: StrategyPeriod): { periodKey: string; scope: string } {
  const { half, scope } = splitPeriod(p);
  return { periodKey: half, scope };
}
function pctText(v: number | null): string { return v == null ? '—' : `${Math.round(v)}%`; }
/** The document's direction arrow for a percentage: ↑ strong · mid · ↓ weak. */
function arrowOf(v: number | null): string {
  if (v == null) return '—';
  const d = directionOf(v);
  return d === 'up' ? '↑' : d === 'down' ? '↓' : 'mid';
}
function avgText(v: number | null): string { return v == null ? '—' : v.toFixed(2); }
function colourToResult(c: CharColour): ResultColor { return c === 'green' ? 'green' : c === 'red' ? 'red' : 'yellow'; }

export function resultColour(c: ResultColor): string {
  return c === 'green' ? theme.accentGreen : c === 'yellow' ? theme.yellow : c === 'red' ? theme.loss : theme.textMuted;
}
export function resultBackground(c: ResultColor): string {
  return c === 'green' ? 'rgba(5,150,105,0.10)' : c === 'yellow' ? 'rgba(202,138,4,0.12)' : c === 'red' ? 'rgba(220,38,38,0.08)' : 'rgba(148,163,184,0.10)';
}
/** The Difference-Alert level carried in a grade string, if any (reuses existing grade text). */
export function daLevelOf(grade: string | null | undefined): 'da' | 'lean' | null {
  if (!grade) return null;
  if (/lean/i.test(grade)) return 'lean';
  if (/\bDA\b/.test(grade) && !/none\s*da/i.test(grade)) return 'da';
  return null;
}
const COLOR_RANK: Record<ResultColor, number> = { green: 3, yellow: 2, red: 1, none: 0 };
function strongestColor(colors: ResultColor[]): ResultColor {
  return colors.reduce<ResultColor>((best, c) => (COLOR_RANK[c] > COLOR_RANK[best] ? c : best), 'none');
}

/* ----------------------------------------------------------------- 1 · Stats call */

const STATS_CALL_BANDS: MethodOpt[] = [
  { value: 'up', label: 'Strong · 60+' },
  { value: 'mid', label: 'Middle · 40–59' },
  { value: 'down', label: 'Low · 0–39' },
  { value: ALL, label: 'Any level' },
];

const statsCall: Dimension = {
  id: 'statscall',
  label: 'Stats call',
  source: 'export',
  periods: ['overall', 'home', 'away', 'firsthalf', 'secondhalf'],
  methods: (p) => (isHalf(p) ? HALF_STATS : DOMINANCE_STATS).map((d) => ({ value: d.key, label: d.label })),
  options: [{ key: 'band', label: 'Level', options: STATS_CALL_BANDS, default: 'up' }],
  evaluate: (b, sel) => {
    const stats = b.stats;
    if (!stats) return [];
    const defs: StatDef[] = isHalf(sel.period) ? HALF_STATS : DOMINANCE_STATS;
    const def = defs.find((d) => d.key === sel.methodId);
    if (!def) return [];
    const band = sel.options.band ?? 'up';
    const loc = exportLoc(sel.period);
    const out: TeamEval[] = [];
    for (const t of roster(stats)) {
      const v = tableVal(stats, def.family, loc.periodKey, loc.scope, t.team, def.key);
      if (v == null) continue;
      const dir = def.pctBased ? directionOf(v) : null;
      const color: ResultColor = dir === 'up' ? 'green' : dir === 'mid' ? 'yellow' : dir === 'down' ? 'red' : 'none';
      const qualifies = band === ALL ? true : def.pctBased ? dir === band : true;
      if (!qualifies) continue;
      const sample = tableVal(stats, 'ordinary', loc.periodKey, loc.scope, t.team, 'sample_size');
      out.push({
        teamId: t.teamId, team: t.team, competition: b.competition, qualifies: true,
        value: v, valueText: def.pctBased ? pctText(v) : v.toFixed(def.decimals),
        grade: dir ? dir.toUpperCase() : null, color,
        dimensionId: 'statscall', dimensionLabel: 'Stats call',
        feature: def.label, method: STATS_CALL_BANDS.find((x) => x.value === band)?.label ?? band,
        period: sel.period, reason: `${def.label} ${def.pctBased ? pctText(v) : v.toFixed(def.decimals)} (${periodLabel(sel.period)})`,
        sample,
      });
    }
    return out;
  },
};

/* ----------------------------------------------------------------- 2 · Characters */

const charGapPeriod = (p: StrategyPeriod): GapPeriod => { const h = splitPeriod(p).half; return h === 'ht' ? 'firsthalf' : h === '2h' ? 'secondhalf' : 'fulltime'; };
const charScope = (p: StrategyPeriod): 'home' | 'away' | 'overall' => splitPeriod(p).scope;

const characters: Dimension = {
  id: 'characters',
  label: 'Stats Characters',
  source: 'fixtures',
  periods: ['overall', 'home', 'away', 'firsthalf', 'secondhalf'],
  methods: () => [{ value: ALL, label: 'All characters' }, ...STATS_CHARACTERS.map((c) => ({ value: String(c.n), label: `${c.n} · ${c.name}` }))],
  options: [{ key: 'method', label: 'Method', options: [{ value: 'method1', label: 'Method 1 · fixed bands' }, { value: 'method2', label: 'Method 2 · on league' }], default: 'method1' }],
  evaluate: (b, sel) => {
    const fixtures = b.fixtures;
    if (!fixtures || !fixtures.length) return [];
    const method = sel.options.method ?? 'method1';
    const scope = charScope(sel.period);
    const goals = analyzeTeamGoals(fixtures, charGapPeriod(sel.period));
    const base = goals.map((g) => {
      const venue = scope === 'home' ? g.home : scope === 'away' ? g.away : g.overall;
      const scAvg = venue.avgFor;
      const concAvg = venue.avgAgainst;
      const qualifies = g.overall.games >= MIN_GAMES_OVERALL && g.home.games >= MIN_GAMES_PER_VENUE && g.away.games >= MIN_GAMES_PER_VENUE && scAvg != null && concAvg != null;
      return { team: g.team, teamId: g.teamId, scAvg, concAvg, games: venue.games, qualifies };
    });
    const scSorted = base.filter((t) => t.qualifies).map((t) => t.scAvg!).sort((a, b2) => b2 - a);
    const concSorted = base.filter((t) => t.qualifies).map((t) => t.concAvg!).sort((a, b2) => b2 - a);
    const wantN = sel.methodId === ALL ? null : Number(sel.methodId);

    const out: TeamEval[] = [];
    for (const t of base) {
      if (!t.qualifies) continue;
      const scLevel: CharLevel | null = method === 'method1' ? levelForAvgM1(t.scAvg) : levelForRankM2(t.scAvg, scSorted);
      const concLevel: CharLevel | null = method === 'method1' ? levelForAvgM1(t.concAvg) : levelForRankM2(t.concAvg, concSorted);
      if (!scLevel || !concLevel) continue;
      const char = characterFor(scLevel, concLevel);
      if (wantN != null && char.n !== wantN) continue;
      out.push({
        teamId: t.teamId, team: t.team, competition: b.competition, qualifies: true,
        value: t.scAvg != null && t.concAvg != null ? t.scAvg - t.concAvg : null,
        valueText: `Sc ${avgText(t.scAvg)} / Conc ${avgText(t.concAvg)}`,
        grade: `Sc${levelGlyph(scLevel)} · Conc${levelGlyph(concLevel)}`,
        color: colourToResult(char.colour),
        dimensionId: 'characters', dimensionLabel: 'Stats Characters',
        feature: `(${char.n}) ${char.name}`, method: method === 'method1' ? 'Method 1' : 'Method 2',
        period: sel.period,
        reason: `Sc ${avgText(t.scAvg)} (${levelGlyph(scLevel)}) · Conc ${avgText(t.concAvg)} (${levelGlyph(concLevel)}) → (${char.n}) ${char.name}`,
        sample: t.games,
      });
    }
    return out;
  },
};

/* ----------------------------------------------------------------- 3 · Stats Grading · Method 1 */

const ROMAN_INDEX: Record<RomanGrade, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 };
/** Combined-list rank: Strong I=1 … Strong VII=7, then Weak I=8 … Weak VII=14 (weakest). */
function combinedRank(direction: 'strong' | 'weak', roman: RomanGrade): number {
  return (direction === 'weak' ? 7 : 0) + ROMAN_INDEX[roman];
}
/**
 * The combined list's only non-DA letters are A (strong) and F (weak); every
 * other letter is a Double Agent. The document's rule "Series has no DA" means a
 * DA grade group can never qualify in the Series / Series + RFS columns.
 */
function letterCarriesDa(letter: Grade): boolean {
  return letter !== 'A' && letter !== 'F';
}

/**
 * Goal-timing states. The TIME is a Period (First 15′ / Last 20′), not part of the
 * stat — exactly like 1st/2nd half — so the stat here is just Scored or Conceded,
 * read from whichever window the Period names. The feed carries measured 15-minute
 * buckets only (no per-minute data), so the windows are the opening 15′ and the
 * closing phase from 70′ ("last 20"); there is no venue split, so these band on
 * the overall % (↑/mid/↓) and carry no A–F letter or Series/RFS columns.
 */
type TimingStat = { key: string; label: string; early: (t: TeamGoalTiming) => number; late: (t: TeamGoalTiming) => number };
const TIMING_STATS: TimingStat[] = [
  { key: 'tm_sc', label: 'Scored', early: (t) => t.scoredIn15.pct, late: (t) => t.scoredAfter70.pct },
  { key: 'tm_cs', label: 'Conceded', early: (t) => t.concededIn15.pct, late: (t) => t.concededAfter70.pct },
];
const isTimingStat = (id: string) => id.startsWith('tm_');
/** The Scored/Conceded states available on a goal-timing window Period. */
export const TIMING_STATE_OPTIONS: MethodOpt[] = TIMING_STATS.map((s) => ({ value: s.key, label: s.label }));
export function timingStatLabel(key: string): string {
  return TIMING_STATS.find((s) => s.key === key)?.label ?? key;
}

/**
 * Betting-market stats derived from the season's own results (final score +
 * half-time score) — handicaps, the higher/lower-scoring half, and the first-half
 * clean-sheet / BTTS markets. Everything here is computed from goals the feed
 * already reports (nothing invented); the per-game predicate runs over each team's
 * scoped results, and the % of games banded ↑/mid/↓ like every other stat.
 */
const firstHalfGoals = (r: TeamResult) => (r.htGf ?? 0) + (r.htGa ?? 0);
const secondHalfGoals = (r: TeamResult) => (r.gf - (r.htGf ?? 0)) + (r.ga - (r.htGa ?? 0));
const hasHalfTime = (r: TeamResult) => r.htGf != null && r.htGa != null;

type MarketStat = { key: string; label: string; short: string; needsHt?: boolean; hit: (r: TeamResult) => boolean };
const MARKET_STATS: MarketStat[] = [
  // Handicaps (margins off the final score).
  { key: 'mk_win1', label: 'Wins by 1+ (−0.5 handicap)', short: 'Win −0.5', hit: (r) => r.gf - r.ga >= 1 },
  { key: 'mk_win2', label: 'Wins by 2+ (−1.5 handicap)', short: 'Win −1.5', hit: (r) => r.gf - r.ga >= 2 },
  { key: 'mk_win3', label: 'Wins by 3+ (−2.5 handicap)', short: 'Win −2.5', hit: (r) => r.gf - r.ga >= 3 },
  { key: 'mk_unbeaten', label: 'Unbeaten (+0.5 handicap)', short: '+0.5', hit: (r) => r.gf >= r.ga },
  { key: 'mk_lose2', label: 'Loses by 2+ goals', short: 'Lose 2+', hit: (r) => r.ga - r.gf >= 2 },
  // Higher / lower-scoring half (from the half-time score).
  { key: 'mk_2h_higher', label: '2nd half is the higher-scoring half', short: '2H higher', needsHt: true, hit: (r) => secondHalfGoals(r) > firstHalfGoals(r) },
  { key: 'mk_1h_higher', label: '1st half is the higher-scoring half', short: '1H higher', needsHt: true, hit: (r) => firstHalfGoals(r) > secondHalfGoals(r) },
  // First-half markets.
  { key: 'mk_cs_1h', label: 'Clean sheet in the 1st half', short: 'CS 1H', needsHt: true, hit: (r) => (r.htGa ?? 0) === 0 },
  { key: 'mk_btts_no_1h', label: 'BTTS No in the 1st half', short: 'BTTS No 1H', needsHt: true, hit: (r) => !((r.htGf ?? 0) > 0 && (r.htGa ?? 0) > 0) },
  { key: 'mk_scored_1h', label: 'Scores in the 1st half', short: 'Score 1H', needsHt: true, hit: (r) => (r.htGf ?? 0) > 0 },
];
const isMarketStat = (id: string) => id.startsWith('mk_');
/** Fewer scoped games than this and a market % is not worth banding. */
const MARKET_MIN_GAMES = 5;
export function marketStatLabel(key: string): string {
  return MARKET_STATS.find((s) => s.key === key)?.label ?? key;
}

const grading1: Dimension = {
  id: 'grading1',
  label: 'Stats Grading · Method 1',
  source: 'export',
  periods: ['overall', 'firsthalf', 'secondhalf', 'first15', 'last20'],
  methods: () => [
    ...GRADABLE_STATS.map((s) => ({ value: s.key, label: s.label })),
    ...MARKET_STATS.map((s) => ({ value: s.key, label: `🎯 ${s.label}` })),
    // Additional analytics stats gathered into the Rule (banded on their %/value):
    // the extra Ordinary stats, the FT-only patterns, and Points-per-game.
    ...ORD_FILTER.filter((i) => !GRADABLE_STATS.some((g) => g.key === i.key)).map((i) => ({ value: `sf:ordinary:${i.key}`, label: `📊 ${i.label}` })),
    ...FT_ONLY_FILTER.map((i) => ({ value: `sf:ftonly:${i.key}`, label: `📈 ${i.label}` })),
    ...PPG_FILTER.map((i) => ({ value: `sf:ppg:${i.key}`, label: `📐 ${i.label}` })),
    ...SERIES_FILTER.map((i) => ({ value: `sf:series:${i.key}`, label: `🔥 Series · ${i.label}` })),
    // Mixed Stats · Last left-over stats (1–23) — the derived half-share / second-half /
    // BTTS-outcome / form / performance views, each callable on its own.
    ...TRANSCRIBED_STATS.map(([key, label]) => ({ value: `mx:${key}`, label: `🧮 ${label}` })),
    // Composite analyses folded into the Rule, each callable on its own — they
    // delegate to their existing engines (Stats Characters / Opposite Stats / Omit Test).
    ...characters.methods('overall').map((m) => ({ value: `ch:${m.value}`, label: `🎭 Character · ${m.label}` })),
    ...opposite.methods('overall').map((m) => ({ value: `op:${m.value}`, label: `🪞 Opposite · ${m.label}` })),
    ...omit.methods('overall').map((m) => ({ value: `om:${m.value}`, label: `🧪 Omit · ${m.label}` })),
    { value: 'pd:placeholder', label: '⚡ Power Dynamics (added separately)' },
    ...TIMING_STATS.map((s) => ({ value: s.key, label: s.label })),
  ],
  options: [
    { key: 'show', label: 'Show', options: [{ value: ALL, label: 'Strong & weak' }, { value: 'strong', label: 'Strong only' }, { value: 'weak', label: 'Weak only' }], default: ALL },
  ],
  evaluate: (b, sel) => {
    // Power Dynamics — placeholder; the real stats are added separately.
    if (sel.methodId.startsWith('pd:')) return [];
    // Mixed Stats · Last left-over stats (1–23). These are derived from the Ordinary
    // FT/1H/2H tables (with their attached season games + half-time scores), the
    // FT-only patterns and the PPG table — data the export already carries — so the
    // builder rebuilds those source tables from its own export and runs the shared
    // transcription engine. Overall-only by nature; a missing half-time / ppg / ft-only
    // table just yields a null value for that team (skipped), never a crash.
    if (sel.methodId.startsWith('mx:')) {
      if (!b.stats) return [];
      const key = sel.methodId.slice(3);
      const meta = TRANSCRIBED_STATS.find(([k]) => k === key);
      if (!meta) return [];
      const [, statLabel, formula] = meta;
      const toRows = (name: string, fam: 'ordinary' | 'ppg' | 'ft_only') =>
        liveRowsToDisplay(b.stats!.tables[name] ?? [], fam);
      const sources: TranscribedSources = {
        ordinaryByPeriod: {
          fulltime: toRows('ordinary_ft_overall', 'ordinary'),
          firsthalf: toRows('ordinary_ht_overall', 'ordinary'),
          secondhalf: toRows('ordinary_2h_overall', 'ordinary'),
        },
        ftOnly: toRows('ft_only_ft_overall', 'ft_only'),
        ppgFt: toRows('ppg_ft_overall', 'ppg'),
      };
      const idByTeam = new Map(roster(b.stats).map((t) => [norm(t.team), t.teamId]));
      const isHalfChoice = HALF_CHOICE_KEYS.includes(key);
      const out: TeamEval[] = [];
      for (const row of transcribedTeamRows(sources)) {
        const metric = row.metrics.find((m) => m.key === key);
        if (metric?.value == null) continue; // unavailable data for this team
        const raw = metric.raw === true;
        const valueText = renderMixedValue(key, metric.value, raw);
        let color: ResultColor; let band: string;
        if (isHalfChoice) {
          color = 'none'; band = valueText; // "1st Half" / "2nd Half" / "Tie"
        } else if (raw) {
          color = 'none'; band = valueText; // raw average — carried as-is, no band
        } else {
          const dir = directionOf(metric.value);
          color = dir === 'up' ? 'green' : dir === 'mid' ? 'yellow' : 'red';
          band = dir === 'up' ? 'UP' : dir === 'mid' ? 'MID' : 'DOWN';
        }
        out.push({
          teamId: idByTeam.get(norm(row.team)) ?? null, team: row.team, competition: b.competition, qualifies: true,
          value: metric.value, valueText, grade: `${statLabel} · ${band}`, color,
          dimensionId: 'grading1', dimensionLabel: 'Stats Grading · Method 1',
          feature: `Mixed · ${statLabel}`, method: `Mixed stats · ${band}`,
          period: 'overall',
          reason: `${statLabel}: ${valueText} (${formula})`,
          sample: null,
        });
      }
      return out;
    }
    // Composite analyses folded into the Rule. Each delegates to its existing
    // engine with sensible defaults (Characters on Method 1 fixed bands, Opposite
    // surfacing any triggered pair, Omit classifying any sensitivity) and returns
    // the engine's own evals unchanged — no statistic is re-implemented here.
    // Defaults surface teams from the Rule UI (which carries only `show`); a preset
    // can pass the engine's own option (allocation / direction / method) to sharpen it.
    if (sel.methodId.startsWith('ch:')) {
      return characters.evaluate(b, { period: sel.period, methodId: sel.methodId.slice(3), options: { method: 'method1', ...sel.options } });
    }
    if (sel.methodId.startsWith('op:')) {
      return opposite.evaluate(b, { period: sel.period, methodId: sel.methodId.slice(3), options: { allocation: ALL, ...sel.options } });
    }
    if (sel.methodId.startsWith('om:')) {
      return omit.evaluate(b, { period: 'overall', methodId: sel.methodId.slice(3), options: { direction: ALL, ...sel.options } });
    }
    // Additional analytics stats (📊/📈/📐): read any family column at the chosen
    // period/venue and band it ↑/mid/↓ (pct), by run length (series) or as a value.
    if (sel.methodId.startsWith('sf:')) {
      if (!b.stats) return [];
      const [, fam, key] = sel.methodId.split(':');
      const family = statFamily(fam);
      const item = family.items.find((i) => i.key === key);
      if (!item) return [];
      const loc = exportLoc(sel.period);
      const rows = b.stats.tables[`${family.prefix}_${loc.periodKey}_${loc.scope}`] ?? [];
      const show = sel.options.show ?? ALL;
      const out: TeamEval[] = [];
      for (const r of rows) {
        const raw = r[item.key];
        if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
        let color: ResultColor; let band: string | null; let valueText: string;
        if (item.kind === 'pct') {
          const dir = directionOf(raw);
          if (show === 'strong' && dir !== 'up') continue;
          if (show === 'weak' && dir !== 'down') continue;
          band = dir === 'up' ? 'UP' : dir === 'mid' ? 'MID' : 'DOWN';
          color = dir === 'up' ? 'green' : dir === 'mid' ? 'yellow' : 'red';
          valueText = pctText(raw);
        } else if (item.kind === 'run') {
          if (raw < 1) continue; // only teams on an active run
          color = raw >= 4 ? 'green' : raw >= 2 ? 'yellow' : 'red';
          band = `${raw}×`; valueText = `${raw} in a row`;
        } else {
          color = 'none'; band = null; valueText = raw.toFixed(2);
        }
        const sampleRaw = r['sample_size'];
        const sample = typeof sampleRaw === 'number' && Number.isFinite(sampleRaw) ? sampleRaw : null;
        out.push({
          teamId: numTeamId(r), team: String(r.team_name), competition: b.competition, qualifies: true,
          value: raw, valueText, grade: band ? `${item.label} · ${band}` : item.label, color,
          dimensionId: 'grading1', dimensionLabel: 'Stats Grading · Method 1',
          feature: `${family.label} · ${item.label}`, method: `${family.label}${band ? ` · ${band}` : ''} · ${periodLabel(sel.period)}`,
          period: sel.period,
          reason: `${item.label}: ${valueText} (${periodLabel(sel.period)})`,
          sample,
        });
      }
      return out;
    }
    // Goal-timing window Period (First 15′ / Last 20′): the stat is just Scored or
    // Conceded, read from the window the Period names — overall-only % banded ↑/mid/↓.
    if (isWindowPeriod(sel.period) || isTimingStat(sel.methodId)) {
      const def = TIMING_STATS.find((s) => s.key === sel.methodId);
      if (!def || !b.timing || !isWindowPeriod(sel.period)) return [];
      const early = sel.period === 'first15';
      const pick = early ? def.early : def.late;
      const winLabel = early ? 'First 15′' : 'Last 20′';
      const winShort = early ? '0–15′' : '70′+';
      const show = sel.options.show ?? ALL;
      const out: TeamEval[] = [];
      for (const r of b.timing) {
        if (r.timing.coveragePct <= 0) continue; // no timing data for this team
        const v = pick(r.timing);
        const dir = directionOf(v);
        if (show === 'strong' && dir !== 'up') continue;
        if (show === 'weak' && dir !== 'down') continue;
        const color: ResultColor = dir === 'up' ? 'green' : dir === 'mid' ? 'yellow' : 'red';
        const band = dir === 'up' ? 'UP' : dir === 'mid' ? 'MID' : 'DOWN';
        out.push({
          teamId: r.teamId, team: r.team, competition: b.competition, qualifies: true,
          value: v, valueText: pctText(v), grade: `${def.label} ${winShort} · ${band}`, color,
          dimensionId: 'grading1', dimensionLabel: 'Stats Grading · Method 1',
          feature: `${def.label} · ${winLabel}`, method: `Goal timing · ${winLabel} · ${band} · ${pctText(v)}`,
          period: sel.period,
          reason: `${def.label} in the ${winLabel.toLowerCase()}: ${pctText(v)} of matches this season (overall · timing coverage ${Math.round(r.timing.coveragePct)}%)`,
          sample: null,
        });
      }
      return out;
    }
    // Betting-market stats: computed from the team's own scoped results (handicaps
    // and the half-scoring / first-half markets), banded ↑/mid/↓ on the % of games.
    if (isMarketStat(sel.methodId)) {
      const def = MARKET_STATS.find((s) => s.key === sel.methodId);
      if (!def || !b.fixtures || !b.stats) return [];
      const show = sel.options.show ?? ALL;
      const scope = splitPeriod(sel.period).scope;
      const scopeLabel = scope === 'home' ? 'Home' : scope === 'away' ? 'Away' : 'Overall';
      const out: TeamEval[] = [];
      for (const t of roster(b.stats)) {
        if (t.teamId == null) continue;
        const scoped = filterScope(teamResultsFromFixtures(b.fixtures, t.teamId, null, {}), scope);
        const usable = def.needsHt ? scoped.filter(hasHalfTime) : scoped;
        if (usable.length < MARKET_MIN_GAMES) continue;
        const pct = Math.round((100 * usable.filter(def.hit).length) / usable.length);
        const dir = directionOf(pct);
        if (show === 'strong' && dir !== 'up') continue;
        if (show === 'weak' && dir !== 'down') continue;
        const color: ResultColor = dir === 'up' ? 'green' : dir === 'mid' ? 'yellow' : 'red';
        const band = dir === 'up' ? 'UP' : dir === 'mid' ? 'MID' : 'DOWN';
        out.push({
          teamId: t.teamId, team: t.team, competition: b.competition, qualifies: true,
          value: pct, valueText: pctText(pct), grade: `${def.short} · ${band}`, color,
          dimensionId: 'grading1', dimensionLabel: 'Stats Grading · Method 1',
          feature: def.label, method: `Market · ${scopeLabel} · ${band} · ${pctText(pct)}`,
          period: sel.period,
          reason: `${def.label}: ${pctText(pct)} of ${scopeLabel.toLowerCase()} games (${usable.length}g)`,
          sample: usable.length,
        });
      }
      return out;
    }
    const stats = b.stats;
    if (!stats) return [];
    const show = sel.options.show ?? ALL;
    const half = splitPeriod(sel.period).half; // 'ft' | 'ht' | '2h' — grade the chosen half
    const per = periodLabel(sel.period);

    // The Ordinary / Series / RFS columns read a team's season games; built once
    // per team, league-scoped (the fixtures feed is already one league's), and only
    // when that league's fixtures are loaded — otherwise a team shows Ordinary only.
    const resultsByTeam = new Map<string, TeamResult[]>();
    const streakOf = (g: TeamGradeRow): StatStreaks | null => {
      if (!b.fixtures || g.teamId == null) return null;
      const key = teamKeyOf(g);
      let res = resultsByTeam.get(key);
      if (!res) {
        res = teamResultsFromFixtures(b.fixtures, g.teamId, null, {}).sort((x, y) => y.unix - x.unix);
        resultsByTeam.set(key, res);
      }
      return statStreaksFor(res, g.statKey);
    };

    // Grade each team at all three source lists; for each grade, add every column
    // the team qualifies in. A team may hold several grade-group · column
    // qualifications — the document says to keep them all and headline the
    // strongest (lowest overall rank: group first, then column preference).
    const byTeam = new Map<string, { rows: Map<SourceListId, TeamGradeRow>; quals: GradeQualification[] }>();
    for (const sid of [1, 2, 3] as SourceListId[]) {
      for (const g of gradeAllTeamsForStat(stats, sid, sel.methodId, b.competition, half)) {
        if (g.grade == null || g.direction == null || g.roman == null) continue;
        if (show === 'strong' && g.direction !== 'strong') continue;
        if (show === 'weak' && g.direction !== 'weak') continue;
        const key = teamKeyOf(g);
        const entry = byTeam.get(key) ?? { rows: new Map<SourceListId, TeamGradeRow>(), quals: [] };
        entry.rows.set(sid, g);
        const groupRank = combinedRank(g.direction, g.roman);
        const combined = `${sid}·${g.grade}`; // combined-list entry, e.g. "1·A" / "3·F"
        const streaks = streakOf(g);
        const seriesOk = !letterCarriesDa(g.grade); // "Series has no DA"
        const columns: QualColumn[] = ['ordinary'];
        if (streaks?.ordinaryRfs) columns.push('ordinary_rfs');
        if (seriesOk && (streaks?.seriesRun ?? 0) > 0) columns.push('series');
        if (seriesOk && (streaks?.brokeRun ?? 0) > 0) columns.push('series_rfs');
        for (const column of columns) {
          entry.quals.push({
            source: sid, roman: g.roman, letter: g.grade, direction: g.direction, da: g.da,
            column, groupRank, combined, overallRank: groupRank * 10 + COLUMN_RANK[column],
          });
        }
        byTeam.set(key, entry);
      }
    }

    const out: TeamEval[] = [];
    for (const { rows, quals } of byTeam.values()) {
      if (!quals.length) continue;
      quals.sort((a, c) => a.overallRank - c.overallRank);
      const head = quals[0];
      const g = rows.get(head.source)!; // the headline source's row carries its %s
      const dirWord = head.direction === 'strong' ? 'Strong' : 'Weak';
      const srcLabel = SOURCE_LISTS.find((s) => s.id === head.source)?.label ?? String(head.source);
      const leagueNote = head.letter === 'C' ? ' (above league avg)' : head.letter === 'D' ? ' (below league avg)' : '';
      const colLabel = COLUMN_LABEL[head.column];
      out.push({
        teamId: g.teamId, team: g.team, competition: b.competition, qualifies: true,
        value: g.overallValue, valueText: pctText(g.overallValue),
        // Combined-list identity: "(I) 1·A", "(IV) 2·B · DA". The column(s) show as
        // chips on the row, so they are not repeated in the grade text.
        grade: `${head.roman} · ${head.combined}${head.da ? ' · DA' : ''}`,
        color: head.direction === 'strong' ? 'green' : 'red',
        dimensionId: 'grading1', dimensionLabel: 'Stats Grading · Method 1',
        feature: gradableStatLabel(sel.methodId),
        method: `${dirWord} · ${srcLabel} · ${colLabel} · ${per}`,
        period: sel.period,
        reason: `Home ${pctText(g.homeValue)} ${arrowOf(g.homeValue)} / Overall ${pctText(g.overallValue)} ${arrowOf(g.overallValue)}${leagueNote} → (${head.roman}) ${head.combined} · ${colLabel}`,
        sample: g.sample,
        rank: head.groupRank,
        gradeColumn: head.column,
        qualifications: quals,
        daInfo: { home: g.homeValue, overall: g.overallValue },
      });
    }
    return out;
  },
};

/* ----------------------------------------------------------------- 4 · Stats Grading · Method 2 */

const grading2: Dimension = {
  id: 'grading2',
  label: 'Stats Grading · Method 2',
  source: 'export',
  periods: ['overall'],
  methods: () => GRADABLE_STATS.map((s) => ({ value: s.key, label: s.label })),
  options: [
    { key: 'direction', label: 'Direction', options: [{ value: ALL, label: 'Strong or weak' }, { value: 'strong', label: 'Strong' }, { value: 'weak', label: 'Weak' }], default: ALL },
  ],
  evaluate: (b, sel) => {
    const stats = b.stats;
    if (!stats) return [];
    const direction = sel.options.direction ?? ALL;
    const grid = buildMethod2Grid(stats, sel.methodId, b.competition);
    const buckets = [
      ...(direction === 'weak' ? [] : grid.strong.map((x) => ({ bucket: x, dir: 'strong' as const }))),
      ...(direction === 'strong' ? [] : grid.weak.map((x) => ({ bucket: x, dir: 'weak' as const }))),
    ];
    const seen = new Set<string>();
    const out: TeamEval[] = [];
    for (const { bucket, dir } of buckets) {
      for (const t of bucket.teams) {
        const key = teamKeyOf(t);
        if (seen.has(key)) continue; // a team's best (first) bucket wins
        seen.add(key);
        out.push({
          teamId: t.teamId, team: t.team, competition: b.competition, qualifies: true,
          value: t.overallValue, valueText: pctText(t.overallValue),
          grade: `${bucket.label}${bucket.da ? ' · DA' : ''}`, color: dir === 'strong' ? (bucket.da ? 'yellow' : 'green') : (bucket.da ? 'yellow' : 'red'),
          dimensionId: 'grading2', dimensionLabel: 'Stats Grading · Method 2',
          feature: gradableStatLabel(sel.methodId), method: `${dir} · ${bucket.label}`,
          period: 'overall',
          reason: `Home ${pctText(t.homeValue)} / Overall ${pctText(t.overallValue)} → ${bucket.label}`,
          sample: null,
        });
      }
    }
    return out;
  },
};

/* ----------------------------------------------------------------- 5 · Dominance Checker */

const dominance: Dimension = {
  id: 'dominance',
  label: 'Dominance Checker',
  source: 'export',
  periods: ['overall'],
  methods: () => DOMINANCE_STATS.map((d) => ({ value: d.key, label: d.label })),
  options: [
    { key: 'split', label: 'Split', options: [{ value: 'homeaway', label: 'Home vs Away' }, { value: 'halves', label: '1st vs 2nd Half' }], default: 'homeaway' },
    { key: 'magnitude', label: 'Difference', options: [{ value: 'long', label: 'DA (25+)' }, { value: 'mid', label: 'Lean DA (16–24)' }, { value: ALL, label: 'Any difference' }], default: 'long' },
  ],
  evaluate: (b, sel) => {
    const stats = b.stats;
    if (!stats) return [];
    const split = sel.options.split ?? 'homeaway';
    const want = sel.options.magnitude ?? 'long';
    const idByName = new Map(roster(stats).map((t) => [norm(t.team), t.teamId]));
    const out: TeamEval[] = [];
    for (const [nameKey, teamId] of idByName) {
      const team = (stats.tables['ordinary_ft_overall'] ?? []).find((r) => norm(String(r.team_name)) === nameKey);
      const teamName = String(team?.team_name ?? nameKey);
      const rows = split === 'halves' ? buildHalfDominance(stats, teamName) : buildHomeAwayDominance(stats, teamName);
      const row = rows.find((r) => r.statKey === sel.methodId);
      if (!row || row.measure == null) continue;
      const magnitude = row.magnitude; // 'long' | 'mid' | 'short' | 'na'
      const ok = want === ALL ? magnitude === 'long' || magnitude === 'mid' : magnitude === want;
      if (!ok) continue;
      const sideLabel = row.side === 'a' ? (split === 'halves' ? '1st half' : 'Home') : row.side === 'b' ? (split === 'halves' ? '2nd half' : 'Away') : 'Even';
      const color: ResultColor = magnitude === 'long' ? 'green' : magnitude === 'mid' ? 'yellow' : 'red';
      out.push({
        teamId, team: teamName, competition: b.competition, qualifies: true,
        value: row.difference, valueText: row.pctBased ? pctText(Math.abs(row.difference ?? 0)) : (row.difference ?? 0).toFixed(row.decimals),
        grade: magnitude === 'long' ? 'DA' : magnitude === 'mid' ? 'Lean DA' : 'None DA', color,
        dimensionId: 'dominance', dimensionLabel: 'Dominance Checker',
        feature: row.statLabel, method: `${split === 'halves' ? '1st vs 2nd half' : 'Home vs Away'} · ${sideLabel} dominant`,
        period: 'overall',
        reason: `${row.statLabel}: ${sideLabel} side holds a ${magnitude === 'long' ? 'DA' : 'lean'} difference`,
        sample: null,
      });
    }
    return out;
  },
};

/* ----------------------------------------------------------------- 6 · Opposite Stats */

const OPP_METHODS: MethodOpt[] = [
  { value: ALL, label: 'Any opposite pair' },
  ...OPPOSITE_PAIRS.map((p, i) => ({ value: String(i), label: `${p.aLabel} vs ${p.bLabel}` })),
];

const opposite: Dimension = {
  id: 'opposite',
  label: 'Opposite Stats',
  source: 'export',
  periods: ['overall', 'home', 'away'],
  methods: () => OPP_METHODS,
  options: [
    { key: 'allocation', label: 'Allocation', options: [{ value: 'long', label: 'DA (25+)' }, { value: 'borderline', label: 'Lean DA (16–24)' }, { value: ALL, label: 'Any (triggered)' }], default: 'long' },
  ],
  evaluate: (b, sel) => {
    const stats = b.stats;
    if (!stats) return [];
    const scope: OppositeScope = splitPeriod(sel.period).scope;
    const want = sel.options.allocation ?? 'long';
    const pairIdx = sel.methodId === ALL ? null : Number(sel.methodId);
    const rows = buildOppositeStats(stats, b.competition, scope);
    const out: TeamEval[] = [];
    for (const r of rows) {
      if (!r.trigger) continue;
      const pairs = pairIdx == null ? r.pairs : [r.pairs[pairIdx]].filter(Boolean);
      const match = pairs.find((p) => (want === ALL ? p.allocation !== 'na' : p.allocation === want));
      if (!match) continue;
      const color: ResultColor = match.allocation === 'long' ? 'green' : match.allocation === 'borderline' ? 'yellow' : 'red';
      out.push({
        teamId: r.teamId, team: r.team, competition: b.competition, qualifies: true,
        value: match.difference, valueText: pctText(match.difference),
        grade: match.allocation === 'long' ? 'DA' : match.allocation === 'borderline' ? 'Lean DA' : 'None DA', color,
        dimensionId: 'opposite', dimensionLabel: 'Opposite Stats',
        feature: `${match.aLabel} vs ${match.bLabel}`, method: `${periodLabel(sel.period)} · ${match.allocation}`,
        period: sel.period,
        reason: `${match.aLabel} ${pctText(match.aValue)} vs ${match.bLabel} ${pctText(match.bValue)} → ${match.allocation} difference`,
        sample: null,
      });
    }
    return out;
  },
};

/* ----------------------------------------------------------------- 7 · Gap Analysis */

const gapGapPeriod = (p: StrategyPeriod): GapPeriod => { const h = splitPeriod(p).half; return h === 'ht' ? 'firsthalf' : h === '2h' ? 'secondhalf' : 'fulltime'; };

const gap: Dimension = {
  id: 'gap',
  label: 'Gap Analysis',
  source: 'fixtures',
  periods: ['overall', 'firsthalf', 'secondhalf'],
  methods: () => GAP_MARKETS.map((m) => ({ value: m.key, label: m.label })),
  options: [
    { key: 'band', label: 'Gap size', options: [{ value: 'da', label: 'DA gap (25+)' }, { value: 'lean', label: 'Lean (16–24)' }, { value: ALL, label: 'Any gap' }], default: 'da' },
  ],
  evaluate: (b, sel) => {
    const fixtures = b.fixtures;
    if (!fixtures || !fixtures.length) return [];
    const market = sel.methodId as GapMarket;
    const want = sel.options.band ?? 'da';
    const analysis = analyzeTeamGames(fixtures, gapGapPeriod(sel.period), market);
    const out: TeamEval[] = [];
    for (const t of analysis) {
      if (t.gap == null || t.home.percent == null || t.away.percent == null) continue;
      if (t.home.games < MIN_GAMES_PER_VENUE || t.away.games < MIN_GAMES_PER_VENUE) continue;
      const band = differenceDaBand(t.gap); // 'da' | 'lean' | 'none' | 'na'
      const ok = want === ALL ? band === 'da' || band === 'lean' : band === want;
      if (!ok) continue;
      const color: ResultColor = band === 'da' ? 'green' : band === 'lean' ? 'yellow' : 'red';
      const marketLabel = GAP_MARKETS.find((m) => m.key === market)?.label ?? market;
      out.push({
        teamId: t.teamId, team: t.team, competition: b.competition, qualifies: true,
        value: t.gap, valueText: pctText(t.gap),
        grade: band === 'da' ? 'DA gap' : band === 'lean' ? 'Lean gap' : 'None', color,
        dimensionId: 'gap', dimensionLabel: 'Gap Analysis',
        feature: marketLabel, method: `${periodLabel(sel.period)} · Home vs Away gap`,
        period: sel.period,
        reason: `${marketLabel}: Home ${pctText(t.home.percent)} vs Away ${pctText(t.away.percent)} → ${pctText(t.gap)} gap`,
        sample: Math.min(t.home.games, t.away.games),
      });
    }
    return out;
  },
};

/* ----------------------------------------------------------------- 8 · Stat filter (every family / all 81 tables) */

type StatKind = 'pct' | 'avg' | 'run';
type StatItem = { key: string; label: string; kind: StatKind };
type StatFamilyDef = { value: string; label: string; prefix: string; windowed: boolean; items: StatItem[] };

/** Ordinary season stats (the % + per-match averages). The five timing stats the
 *  feed can't derive (handicap / early / late goals) are left out — they are null. */
const ORD_FILTER: StatItem[] = [
  { key: 'sc_pct', label: 'Scored %', kind: 'pct' }, { key: 'conc_pct', label: 'Conceded %', kind: 'pct' },
  { key: 'sc_avg', label: 'Goals for / game', kind: 'avg' }, { key: 'conc_avg', label: 'Goals against / game', kind: 'avg' },
  { key: 'avg_goals', label: 'Total goals / game', kind: 'avg' },
  { key: 'btts_yes', label: 'BTTS Yes %', kind: 'pct' }, { key: 'btts_no', label: 'BTTS No %', kind: 'pct' },
  { key: 'cs_pct', label: 'Clean sheet %', kind: 'pct' }, { key: 'fts_pct', label: 'Failed to score %', kind: 'pct' },
  { key: 'w_pct', label: 'Win %', kind: 'pct' }, { key: 'd_pct', label: 'Draw %', kind: 'pct' }, { key: 'l_pct', label: 'Loss %', kind: 'pct' },
  { key: 'over05', label: 'Over 0.5 %', kind: 'pct' }, { key: 'over15', label: 'Over 1.5 %', kind: 'pct' },
  { key: 'over25', label: 'Over 2.5 %', kind: 'pct' }, { key: 'over35', label: 'Over 3.5 %', kind: 'pct' }, { key: 'over45', label: 'Over 4.5 %', kind: 'pct' },
  { key: 'under05', label: 'Under 0.5 %', kind: 'pct' }, { key: 'under15', label: 'Under 1.5 %', kind: 'pct' },
  { key: 'under25', label: 'Under 2.5 %', kind: 'pct' }, { key: 'under35', label: 'Under 3.5 %', kind: 'pct' }, { key: 'under45', label: 'Under 4.5 %', kind: 'pct' },
  { key: 'scoring_05', label: 'Scoring 0.5+ %', kind: 'pct' }, { key: 'scoring_15', label: 'Scoring 1.5+ %', kind: 'pct' }, { key: 'scoring_25', label: 'Scoring 2.5+ %', kind: 'pct' },
  { key: 'conceding_05', label: 'Conceding 0.5+ %', kind: 'pct' }, { key: 'conceding_15', label: 'Conceding 1.5+ %', kind: 'pct' }, { key: 'conceding_25', label: 'Conceding 2.5+ %', kind: 'pct' },
  { key: 'scored_first', label: 'Scored first %', kind: 'pct' }, { key: 'conceded_first', label: 'Conceded first %', kind: 'pct' },
];

/** The 29 series (current consecutive-run lengths), reusing the catalogue defs. */
const SERIES_FILTER: StatItem[] = SERIES_DEFS.map((d) => ({ key: d.key, label: d.label, kind: 'run' as const }));

/** Full-time-only outcome patterns. Percentages, plus two situational point averages. */
const FT_ONLY_FILTER: StatItem[] = [
  { key: 'btts_both_halves', label: 'BTTS both halves %', kind: 'pct' }, { key: 'scored_both_halves', label: 'Scored both halves %', kind: 'pct' },
  { key: 'btts_over25', label: 'BTTS & Over 2.5 %', kind: 'pct' }, { key: 'conceded_both_halves', label: 'Conceded both halves %', kind: 'pct' },
  { key: 'won_both_halves', label: 'Won both halves %', kind: 'pct' }, { key: 'win_to_nil', label: 'Win to nil %', kind: 'pct' }, { key: 'lost_to_nil', label: 'Lost to nil %', kind: 'pct' },
  { key: 'led_ht', label: 'Led at half-time %', kind: 'pct' },
  { key: 'rescued_points', label: 'Rescued points / game (trailing HT)', kind: 'avg' }, { key: 'blown_points', label: 'Blown points / game (leading HT)', kind: 'avg' },
  { key: 'htft_ww', label: 'HT/FT Win→Win %', kind: 'pct' }, { key: 'htft_wd', label: 'HT/FT Win→Draw %', kind: 'pct' }, { key: 'htft_wl', label: 'HT/FT Win→Lose %', kind: 'pct' },
  { key: 'htft_dw', label: 'HT/FT Draw→Win %', kind: 'pct' }, { key: 'htft_dd', label: 'HT/FT Draw→Draw %', kind: 'pct' }, { key: 'htft_dl', label: 'HT/FT Draw→Lose %', kind: 'pct' },
  { key: 'htft_lw', label: 'HT/FT Lose→Win %', kind: 'pct' }, { key: 'htft_ld', label: 'HT/FT Lose→Draw %', kind: 'pct' }, { key: 'htft_ll', label: 'HT/FT Lose→Lose %', kind: 'pct' },
];

/** Points-per-game family, including PPG against each table third. */
const PPG_FILTER: StatItem[] = [
  { key: 'ppg', label: 'Points per game', kind: 'avg' },
  { key: 'ppg_vs_green', label: 'PPG vs top (green) third', kind: 'avg' },
  { key: 'ppg_vs_yellow', label: 'PPG vs middle (yellow) third', kind: 'avg' },
  { key: 'ppg_vs_red', label: 'PPG vs bottom (red) third', kind: 'avg' },
];

const STAT_FAMILIES: StatFamilyDef[] = [
  { value: 'ordinary', label: 'Ordinary', prefix: 'ordinary', windowed: true, items: ORD_FILTER },
  { value: 'series', label: 'Series run', prefix: 'series', windowed: false, items: SERIES_FILTER },
  { value: 'ftonly', label: 'FT-only patterns', prefix: 'ft_only', windowed: true, items: FT_ONLY_FILTER },
  { value: 'ppg', label: 'Points per game', prefix: 'ppg', windowed: true, items: PPG_FILTER },
];
function statFamily(value: string | undefined): StatFamilyDef {
  return STAT_FAMILIES.find((f) => f.value === value) ?? STAT_FAMILIES[0];
}

/* ---- Single call: a plain numeric ranking (percentages / averages, no grade) ---- */

/** Stat families a Single call can rank — percentages / averages only (Series
 *  run counts are not "numbers" in this sense and are left out). */
export function singleStatFamilies(): { value: string; label: string; items: MethodOpt[] }[] {
  return STAT_FAMILIES
    .filter((f) => f.value === 'ordinary' || f.value === 'ppg' || f.value === 'ftonly')
    .map((f) => ({
      value: f.value,
      label: f.label,
      items: f.items.filter((i) => i.kind === 'pct' || i.kind === 'avg').map((i) => ({ value: i.key, label: i.label })),
    }));
}

/** The windows a Single call can rank over (whole season, or a last-N sample). */
export const SINGLE_STAT_WINDOWS: MethodOpt[] = [
  { value: 'season', label: 'All games (season)' },
  { value: 'last10', label: 'Last 10' }, { value: 'last8', label: 'Last 8' },
  { value: 'last6', label: 'Last 6' }, { value: 'last5', label: 'Last 5' },
];

export type SingleStatRow = { team: string; teamId: number | null; competition: string; value: number; valueText: string; kind: 'pct' | 'avg' };

/**
 * A Single call's body: every team's value for ONE numeric stat across the loaded
 * leagues, highest first. No grading and no threshold — just the number (a
 * percentage or an average), ranked top → bottom.
 */
export function rankSingleStat(
  bundles: LeagueBundle[],
  sel: { family: string; methodId: string; period: StrategyPeriod; window: string },
): SingleStatRow[] {
  const fam = statFamily(sel.family);
  const item = fam.items.find((i) => i.key === sel.methodId);
  if (!item || (item.kind !== 'pct' && item.kind !== 'avg')) return [];
  const kind: 'pct' | 'avg' = item.kind;
  const loc = exportLoc(sel.period);
  const usesWindow = fam.windowed && sel.window !== 'season';
  const prefix = usesWindow ? sel.window : fam.prefix;
  const out: SingleStatRow[] = [];
  for (const b of bundles) {
    if (!b.stats) continue;
    const rows = b.stats.tables[`${prefix}_${loc.periodKey}_${loc.scope}`] ?? [];
    for (const r of rows) {
      const raw = r[item.key];
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
      out.push({ team: String(r.team_name), teamId: numTeamId(r), competition: b.competition, value: raw, valueText: kind === 'pct' ? pctText(raw) : raw.toFixed(2), kind });
    }
  }
  out.sort((a, c) => c.value - a.value || a.team.localeCompare(c.team));
  return out;
}

const STAT_WINDOWS: MethodOpt[] = [
  { value: 'season', label: 'All games (season)' },
  { value: 'last10', label: 'Last 10' }, { value: 'last8', label: 'Last 8' },
  { value: 'last6', label: 'Last 6' }, { value: 'last5', label: 'Last 5' },
];
const STAT_LEVELS: MethodOpt[] = [
  { value: ALL, label: 'Any level' },
  { value: 'strong', label: 'Strong' }, { value: 'middle', label: 'Middle' }, { value: 'low', label: 'Low' },
];

/**
 * Stat filter — the unifying dimension. It reads ANY stat column from ANY of the
 * 81 live tables (Ordinary / Series / FT-only / PPG × FT·HT·2H × Overall·Home·Away,
 * plus the Last-10/8/6/5 windows) that statsBuilder already produced, so every
 * metric the app computes is selectable here without adding a single new
 * calculation. Series run on their own season tables; Last-N windows apply to the
 * other families. Percentage stats band green/yellow/red via the shared
 * directionOf; run lengths band by streak; raw averages carry their value.
 */
const statFilter: Dimension = {
  id: 'statfilter',
  label: 'Stat filter · all tables',
  source: 'export',
  periods: ['overall', 'home', 'away', 'firsthalf', 'secondhalf'],
  methods: () => STAT_FAMILIES[0].items.map((i) => ({ value: i.key, label: i.label })),
  methodsFor: (_p, opts) => statFamily(opts.family).items.map((i) => ({ value: i.key, label: i.label })),
  options: [
    { key: 'family', label: 'Family', options: STAT_FAMILIES.map((f) => ({ value: f.value, label: f.label })), default: 'ordinary' },
    { key: 'window', label: 'Window', options: STAT_WINDOWS, default: 'season' },
    { key: 'mode', label: 'Match by', options: [{ value: 'band', label: 'Level band' }, { value: 'limit', label: 'Limit (≥ / ≤)' }], default: 'band' },
    { key: 'level', label: 'Level', options: STAT_LEVELS, default: ALL, visible: (o) => (o.mode ?? 'band') !== 'limit' },
    { key: 'cmp', label: 'Test', options: [{ value: 'gte', label: '≥' }, { value: 'lte', label: '≤' }], default: 'gte', visible: (o) => o.mode === 'limit' },
    { key: 'value', label: 'Value', options: [], default: '50', kind: 'number', visible: (o) => o.mode === 'limit' },
  ],
  evaluate: (b, sel) => {
    const stats = b.stats;
    if (!stats) return [];
    const fam = statFamily(sel.options.family);
    const item = fam.items.find((i) => i.key === sel.methodId);
    if (!item) return [];
    const loc = exportLoc(sel.period);
    const window = sel.options.window ?? 'season';
    const usesWindow = fam.windowed && window !== 'season';
    const prefix = usesWindow ? window : fam.prefix;
    const rows = stats.tables[`${prefix}_${loc.periodKey}_${loc.scope}`] ?? [];
    const level = sel.options.level ?? ALL;
    const winLabel = STAT_WINDOWS.find((w) => w.value === window)?.label ?? '';
    const windowPart = usesWindow ? ` · ${winLabel}` : '';
    const levelLabel = STAT_LEVELS.find((l) => l.value === level)?.label ?? '';
    // Limit mode: qualify by a user ≥/≤ threshold instead of the level band.
    const mode = sel.options.mode ?? 'band';
    const cmp = sel.options.cmp ?? 'gte';
    const limit = Number(sel.options.value);
    const hasLimit = mode === 'limit' && Number.isFinite(limit);
    const limitPart = hasLimit ? ` · ${cmp === 'gte' ? '≥' : '≤'} ${item.kind === 'avg' ? limit.toFixed(2) : limit}${item.kind === 'pct' ? '%' : ''}` : '';
    const out: TeamEval[] = [];
    for (const row of rows) {
      const raw = row[item.key];
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
      let color: ResultColor;
      let valueText: string;
      let grade: string | null;
      let bandQualifies: boolean;
      if (item.kind === 'pct') {
        const dir = directionOf(raw);
        color = dir === 'up' ? 'green' : dir === 'mid' ? 'yellow' : 'red';
        grade = dir.toUpperCase();
        valueText = pctText(raw);
        bandQualifies = level === ALL ? true : level === 'strong' ? dir === 'up' : level === 'middle' ? dir === 'mid' : dir === 'down';
      } else if (item.kind === 'run') {
        if (!hasLimit && raw < 1) continue; // band mode wants an active run
        color = raw >= 4 ? 'green' : raw >= 2 ? 'yellow' : 'red';
        grade = `${raw}×`;
        valueText = `${raw} in a row`;
        bandQualifies = level === ALL ? true : level === 'strong' ? raw >= 4 : level === 'middle' ? raw >= 2 && raw < 4 : raw >= 1;
      } else {
        // Raw averages carry no band; the Level selector doesn't apply.
        color = 'none';
        grade = null;
        valueText = raw.toFixed(2);
        bandQualifies = true;
      }
      const qualifies = hasLimit ? (cmp === 'gte' ? raw >= limit : raw <= limit) : bandQualifies;
      if (!qualifies) continue;
      const sampleRaw = row['sample_size'];
      const sample = typeof sampleRaw === 'number' && Number.isFinite(sampleRaw) ? sampleRaw : null;
      out.push({
        teamId: numTeamId(row), team: String(row.team_name), competition: b.competition, qualifies: true,
        value: raw, valueText, grade, color,
        dimensionId: 'statfilter', dimensionLabel: 'Stat filter',
        feature: `${fam.label} · ${item.label}`,
        method: `${fam.label}${windowPart}${hasLimit ? limitPart : (level !== ALL && item.kind !== 'avg' ? ` · ${levelLabel}` : '')}`,
        period: sel.period,
        reason: `${item.label}${windowPart}: ${valueText} (${periodLabel(sel.period)})${hasLimit ? ` — ${cmp === 'gte' ? '≥' : '≤'} ${item.kind === 'avg' ? limit.toFixed(2) : limit}` : ''}`,
        sample,
      });
    }
    return out;
  },
};

/* ----------------------------------------------------------------- 9 · Omit Test (scoring-average sensitivity) */

/** The scenario whose % change is largest in magnitude — the team's dominant direction. */
function omitDominant(scenarios: { percentChange: number | null; direction: OmitDirection }[]): OmitDirection {
  let dir: OmitDirection = 'unchanged';
  let best = -1;
  for (const s of scenarios) { const a = Math.abs(s.percentChange ?? 0); if (a > best) { best = a; dir = s.direction; } }
  return dir;
}

const omit: Dimension = {
  id: 'omit',
  label: 'Omit Test',
  source: 'export',
  periods: ['overall'],
  methods: () => [{ value: 'scoring', label: 'Scoring-average sensitivity' }],
  options: [
    {
      key: 'direction', label: 'Classification',
      options: [
        { value: ALL, label: 'Sensitive (either way)' },
        { value: 'up', label: 'Sensitive ↑ (inflated by big wins)' },
        { value: 'down', label: 'Sensitive ↓ (propped by low scores)' },
        { value: 'stable', label: 'Stable' },
      ],
      default: ALL,
    },
  ],
  evaluate: (b, sel) => {
    const stats = b.stats;
    if (!stats) return [];
    const want = sel.options.direction ?? ALL;
    const out: TeamEval[] = [];
    for (const r of buildOmitTestFromExport(stats, b.competition)) {
      const sensitive = r.sensitivity === 'sensitive';
      const dir = omitDominant(r.scenarios);
      let qualifies: boolean;
      let grade: string;
      let color: ResultColor;
      if (want === 'stable') { qualifies = !sensitive; grade = 'STABLE'; color = 'yellow'; }
      else if (want === 'up') { qualifies = sensitive && dir === 'up'; grade = 'SENSITIVE ↑'; color = 'green'; }
      else if (want === 'down') { qualifies = sensitive && dir === 'down'; grade = 'SENSITIVE ↓'; color = 'red'; }
      else { qualifies = sensitive; grade = dir === 'up' ? 'SENSITIVE ↑' : dir === 'down' ? 'SENSITIVE ↓' : 'SENSITIVE'; color = dir === 'up' ? 'green' : dir === 'down' ? 'red' : 'yellow'; }
      if (!qualifies) continue;
      const pctTxt = r.maxPercentChange == null ? '—' : `${r.maxPercentChange >= 0 ? '+' : ''}${r.maxPercentChange.toFixed(1)}%`;
      out.push({
        teamId: r.teamId, team: r.team, competition: b.competition, qualifies: true,
        value: r.maxPercentChange, valueText: pctTxt, grade, color,
        dimensionId: 'omit', dimensionLabel: 'Omit Test',
        feature: 'Scoring-avg sensitivity', method: `omit ${r.omitPct}% · FT overall`,
        period: sel.period,
        reason: `Scoring average moves ${pctTxt} when the top/bottom ${r.omittedCount} scoring games are removed (${r.matchesPlayed}g)`,
        sample: r.matchesPlayed,
      });
    }
    return out;
  },
};

/* ----------------------------------------------------------------- registry */

export const DIMENSIONS: Dimension[] = [statFilter, statsCall, characters, grading1, grading2, dominance, opposite, gap, omit];
export function getDimension(id: string): Dimension | undefined {
  return DIMENSIONS.find((d) => d.id === id);
}
/** Which prepared data a set of conditions needs — drives conditional fetching. */
export function needsFixtures(conditions: { dimensionId: string }[]): boolean {
  return conditions.some((c) => getDimension(c.dimensionId)?.source === 'fixtures');
}
export function needsExport(conditions: { dimensionId: string }[]): boolean {
  return conditions.some((c) => getDimension(c.dimensionId)?.source === 'export');
}

/* ----------------------------------------------------------------- orchestration */

/** Which team of the upcoming fixture a condition targets (Fixtures mode). */
export type FixtureSide = 'either' | 'home' | 'away';
export const FIXTURE_SIDES: { value: FixtureSide; label: string }[] = [
  { value: 'either', label: 'Either team' },
  { value: 'home', label: 'Home team' },
  { value: 'away', label: 'Away team' },
];
export function fixtureSideLabel(s: FixtureSide | undefined): string {
  return s === 'home' ? 'Home team' : s === 'away' ? 'Away team' : 'Either';
}

export type Condition = {
  id: string;
  dimensionId: string;
  /** How the stat is read: FT/1H/2H × Overall/Home/Away (per condition). */
  period: StrategyPeriod;
  methodId: string;
  options: Record<string, string>;
  /** Which fixture team must satisfy this (Fixtures mode); default 'either'. */
  side?: FixtureSide;
  /** When true, a team matches this condition by NOT satisfying it (exclude). */
  not?: boolean;
};

/** How a strategy applies to a fixture's two sides (legacy coarse filter). */
export type MatchScope = 'either' | 'home' | 'away' | 'both';
export const MATCH_SCOPES: { value: MatchScope; label: string }[] = [
  { value: 'either', label: 'Either team' },
  { value: 'home', label: 'Home side' },
  { value: 'away', label: 'Away side' },
  { value: 'both', label: 'Both teams' },
];

export type StrategyResult = {
  team: string;
  teamId: number | null;
  competition: string;
  /** One eval per matched condition. */
  conditions: TeamEval[];
  color: ResultColor;
  /** Best (lowest) grading rank among its conditions — for strongest-first ordering. */
  rank?: number;
};

export type StrategyLogic = 'and' | 'or';

/** Readable one-line label for a condition in the app's existing terminology. */
export function conditionLabel(cond: Condition): string {
  const dim = getDimension(cond.dimensionId);
  if (!dim) return '—';
  const methodList = dim.methodsFor ? dim.methodsFor(cond.period, cond.options) : dim.methods(cond.period);
  const method = methodList.find((m) => m.value === cond.methodId)?.label ?? cond.methodId;
  const opts = (dim.options ?? [])
    .filter((o) => (o.visible ? o.visible(cond.options) : true))
    .map((o) => {
      const val = cond.options[o.key] ?? o.default;
      if (o.kind === 'number') return val ? `${o.label} ${val}` : null;
      return o.options.find((x) => x.value === val)?.label;
    })
    .filter(Boolean);
  // Per-condition: show the fixture side, then the stat read (period/venue), then the method.
  const sidePart = cond.side && cond.side !== 'either' ? `${fixtureSideLabel(cond.side)} · ` : '';
  return `${cond.not ? 'NOT · ' : ''}${sidePart}${periodLabel(cond.period)} → ${dim.label} → ${method}${opts.length ? ` · ${opts.join(' · ')}` : ''}`;
}

/* ----------------------------------------------------------------- saved strategies */

/**
 * The portable shape of a strategy — HOW teams/fixtures are pulled, never the
 * teams or fixtures themselves. Saving this and replaying it recomputes
 * everything live against the latest data.
 */
export type SavedStrategyConfig = {
  conditions: Condition[];
  logic: StrategyLogic;
  /** Global FT/1H/2H + venue the whole strategy is read at (default 'overall'). */
  /** Legacy global default period (new builds store period/side per condition). */
  period?: StrategyPeriod;
  resultMode: 'teams' | 'fixtures';
};

export type SavedStrategy = {
  id: string;
  name: string;
  /** Auto-written from the chosen methods/terminology — see describeStrategy. */
  description: string;
  /** The user's own description, entered when saving. Optional (older saves have none). */
  note?: string;
  createdAt: string;
  config: SavedStrategyConfig;
};

/**
 * A plain-language description built from exactly what the user clicked — each
 * condition in the app's own terminology, combined by the strategy's AND / OR
 * logic, plus how it is viewed (teams, or fixtures with which markets / scope).
 */
export function describeStrategy(cfg: SavedStrategyConfig): string {
  const conds = cfg.conditions.map((c) => conditionLabel(c));
  const joiner = cfg.logic === 'and' ? ' AND ' : ' OR ';
  const body = conds.length
    ? `${cfg.logic.toUpperCase()} of ${conds.length}: ${conds.join(joiner)}`
    : 'No conditions yet';
  if (cfg.resultMode === 'fixtures') {
    return `Fixtures · grade qualification · home/away targeting. ${body}`;
  }
  return `Qualifying teams. ${body}`;
}

/** The parts of the panel's live state that make up a saved strategy. */
export function buildStrategyConfig(s: SavedStrategyConfig): SavedStrategyConfig {
  return {
    conditions: s.conditions.map((c) => ({ ...c, options: { ...c.options } })),
    logic: s.logic,
    resultMode: s.resultMode,
  };
}

/** A synthesised eval for a NOT condition a team matches by exclusion. */
function notEval(cond: Condition, info: { team: string; teamId: number | null; competition: string }, period: StrategyPeriod): TeamEval {
  const dim = getDimension(cond.dimensionId);
  const methodList = dim ? (dim.methodsFor ? dim.methodsFor(period, cond.options) : dim.methods(period)) : [];
  const method = methodList.find((m) => m.value === cond.methodId)?.label ?? cond.methodId;
  return {
    teamId: info.teamId, team: info.team, competition: info.competition, qualifies: true,
    value: null, valueText: '—', grade: null, color: 'none',
    dimensionId: cond.dimensionId, dimensionLabel: dim?.label ?? cond.dimensionId,
    feature: `NOT ${method}`, method: 'excluded', period,
    reason: `Does not match ${dim?.label ?? cond.dimensionId} · ${method}`, sample: null,
    conditionId: cond.id,
  };
}

export function evaluateStrategy(bundles: LeagueBundle[], conditions: Condition[], logic: StrategyLogic): StrategyResult[] {
  if (!conditions.length) return [];
  // Per condition: a membership set of globalKeys and the eval that proves it.
  const condSet = new Map<string, Set<string>>();
  const condEval = new Map<string, Map<string, TeamEval>>();
  const universe = new Map<string, { team: string; teamId: number | null; competition: string }>();
  for (const cond of conditions) {
    const dim = getDimension(cond.dimensionId);
    const set = new Set<string>();
    const em = new Map<string, TeamEval>();
    if (dim) {
      for (const bundle of bundles) {
        const evals = dim.evaluate(bundle, { period: cond.period, methodId: cond.methodId, options: cond.options });
        for (const ev of evals) {
          if (!ev.qualifies) continue;
          const key = `${bundle.competition}::${teamKeyOf(ev)}`;
          set.add(key); em.set(key, { ...ev, conditionId: cond.id });
          if (!universe.has(key)) universe.set(key, { team: ev.team, teamId: ev.teamId, competition: ev.competition });
        }
      }
    }
    condSet.set(cond.id, set); condEval.set(cond.id, em);
  }
  // The team universe is every team any (positive) condition surfaced; a NOT
  // condition matches a team in that universe that its set does not contain.
  const results: StrategyResult[] = [];
  for (const [key, info] of universe) {
    const matched = conditions.filter((c) => {
      const inSet = condSet.get(c.id)!.has(key);
      return c.not ? !inSet : inSet;
    });
    const ok = logic === 'and' ? matched.length === conditions.length : matched.length >= 1;
    if (!ok) continue;
    const evals = matched.map((c) => (c.not ? notEval(c, info, c.period) : condEval.get(c.id)!.get(key)!));
    const ranks = evals.map((e) => e.rank).filter((r): r is number => r != null);
    const rank = ranks.length ? Math.min(...ranks) : undefined;
    results.push({ team: info.team, teamId: info.teamId, competition: info.competition, conditions: evals, color: strongestColor(evals.map((e) => e.color)), rank });
  }
  // Strongest first: by colour (green→red), then the combined-list rank (Strong I … Weak VII), then name.
  return results.sort((a, b) =>
    COLOR_RANK[b.color] - COLOR_RANK[a.color] ||
    (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
    a.team.localeCompare(b.team),
  );
}

/** Index results by `competition::teamKey` so a fixture's sides can be looked up. */
export function resultsByTeam(results: StrategyResult[]): Map<string, StrategyResult> {
  const m = new Map<string, StrategyResult>();
  for (const r of results) m.set(`${r.competition}::${teamKeyOf(r)}`, r);
  return m;
}

/* ----------------------------------------------------------------- half-by-half breakdown */

/** One team's reading of a condition's stat on one half (FT / 1st / 2nd). */
export type HalfReading = {
  half: StatHalf;
  label: string;
  value: number | null;
  valueText: string;
  /** UP/MID/DOWN band for a % (null for averages); the live grading direction. */
  band: string | null;
  color: ResultColor;
  sample: number | null;
  /** The half the condition itself filters for. */
  isCurrent: boolean;
};

/**
 * The single live table column a condition reads, when it maps to one — so the
 * same stat can be re-read on the other halves. Composite dimensions (dominance,
 * opposite, gap, characters, omit) combine several readings and return null.
 */
function conditionStat(cond: Condition): { prefix: string; key: string; kind: StatKind; decimals: number } | null {
  switch (cond.dimensionId) {
    case 'statfilter': {
      const fam = statFamily(cond.options.family);
      const item = fam.items.find((i) => i.key === cond.methodId);
      if (!item) return null;
      const window = cond.options.window ?? 'season';
      const prefix = fam.windowed && window !== 'season' ? window : fam.prefix;
      return { prefix, key: item.key, kind: item.kind, decimals: 2 };
    }
    case 'statscall': {
      const def = DOMINANCE_STATS.find((d) => d.key === cond.methodId);
      if (!def) return null;
      return { prefix: def.family, key: def.key, kind: def.pctBased ? 'pct' : 'avg', decimals: def.decimals };
    }
    case 'grading1':
    case 'grading2':
      // Goal-timing, market, additional-family & placeholder stats have no single
      // combined-list FT/1H/2H column — no half split.
      if (isTimingStat(cond.methodId) || isMarketStat(cond.methodId) || cond.methodId.startsWith('sf:') || cond.methodId.startsWith('mx:') || cond.methodId.startsWith('pd:')
        || cond.methodId.startsWith('ch:') || cond.methodId.startsWith('op:') || cond.methodId.startsWith('om:')) return null;
      // Every gradable stat is a percentage column in the ordinary family.
      return { prefix: 'ordinary', key: cond.methodId, kind: 'pct', decimals: 0 };
    default:
      return null;
  }
}

/**
 * How one team reads a condition's stat across Full time / 1st half / 2nd half,
 * at the condition's own venue scope. Reuses the live tables only — no new maths;
 * the % band reuses the shared `directionOf`. Returns null for composite
 * conditions that don't resolve to a single stat column, or when the league's
 * export isn't loaded. "—" where a half has no table for that stat.
 */
export function teamHalfBreakdown(
  bundles: LeagueBundle[],
  cond: Condition,
  team: { competition: string; team: string },
): HalfReading[] | null {
  const stat = conditionStat(cond);
  if (!stat) return null;
  const stats = bundles.find((b) => b.competition === team.competition)?.stats;
  if (!stats) return null;
  const { half: curHalf, scope } = splitPeriod(cond.period);
  const halves: { half: StatHalf; label: string }[] = [
    { half: 'ft', label: 'Full time' },
    { half: 'ht', label: '1st half' },
    { half: '2h', label: '2nd half' },
  ];
  return halves.map(({ half, label }) => {
    const v = tableVal(stats, stat.prefix, half, scope, team.team, stat.key);
    let valueText = '—';
    let band: string | null = null;
    let color: ResultColor = 'none';
    if (v != null) {
      if (stat.kind === 'pct') {
        const dir = directionOf(v);
        band = dir.toUpperCase();
        color = dir === 'up' ? 'green' : dir === 'mid' ? 'yellow' : 'red';
        valueText = pctText(v);
      } else if (stat.kind === 'run') {
        color = v >= 4 ? 'green' : v >= 2 ? 'yellow' : 'red';
        valueText = `${v}×`;
      } else {
        valueText = v.toFixed(stat.decimals ?? 2);
      }
    }
    const s = tableVal(stats, stat.prefix, half, scope, team.team, 'sample_size');
    return { half, label, value: v, valueText, band, color, sample: s == null ? null : Math.round(s), isCurrent: half === curHalf };
  });
}

/* ----------------------------------------------------------------- stat ranking (own league vs across leagues) */

/** The third of a ranked list a team falls in — top (green), middle (yellow),
 *  bottom (red). */
export type StatTier = 'top' | 'mid' | 'bottom';
/** Which venue the stat is stronger (higher) at — the sign of the Home–Away gap. */
export type DominantVenue = 'home' | 'away' | 'balanced';

/**
 * A team's standing on one stat, two ways:
 *  - Method 1 (stat %): rank by the stat percentage itself, higher = #1.
 *  - Method 2 (gap / DA): rank by the Home–Away gap (|home % − away %|, Gap
 *    Analytics' DA), then split the ranked list into equal thirds — top / mid /
 *    bottom — in its own league AND across all loaded leagues.
 */
export type StatRank = {
  // Method 1 — the stat % itself.
  value: number;
  leagueRank: number; leagueTotal: number;
  worldRank: number; worldTotal: number;
  // Method 2 — the Home–Away gap (DA).
  gap: number | null;
  gapLeagueRank: number | null; gapLeagueTotal: number;
  gapWorldRank: number | null; gapWorldTotal: number;
  leagueTier: StatTier | null; worldTier: StatTier | null;
  /** Where the stat is stronger — home or away (null when the gap can't be measured). */
  dominantVenue: DominantVenue | null;
};

/** Minimum counted games for a stat rank (mirrors Gap Analytics / grading source 1). */
const RANK_MIN_GAMES = 8;
/** Minimum games at each venue for the Home–Away gap (Gap Analytics' rule). */
const RANK_MIN_VENUE = 4;

/** Which third of a ranked list a 1-based position falls in. */
function tierOf(rank: number, total: number): StatTier {
  if (total <= 0) return 'mid';
  const third = total / 3;
  if (rank <= Math.ceil(third)) return 'top';
  if (rank <= Math.ceil(2 * third)) return 'mid';
  return 'bottom';
}

/**
 * For a grading condition's stat (an ordinary % column), rank every eligible team
 * within its own league AND across every loaded league, keyed by
 * `competition::teamKey`. Only percentage grading stats rank — the goal-timing and
 * market Rules resolve to no single column, so they return an empty map. Reads the
 * live tables only; no new maths.
 */
export function rankTeamsForStat(bundles: LeagueBundle[], cond: Condition): Map<string, StatRank> {
  const out = new Map<string, StatRank>();
  const stat = conditionStat(cond);
  if (!stat || stat.kind !== 'pct') return out;
  const { periodKey, scope } = exportLoc(cond.period);
  // Each row carries BOTH an id key and a name key, and its StatRank is stored
  // under both — a team is looked up by id OR by name, so a table that reports a
  // team_id while the result has none (or vice versa) never loses its rank.
  type Row = { idKey: string | null; nameKey: string; value: number; gap: number | null; dom: DominantVenue | null; rank?: StatRank };
  const all: Row[] = [];
  const byComp = new Map<string, Row[]>();
  for (const b of bundles) {
    if (!b.stats) continue;
    const rows = b.stats.tables[`${stat.prefix}_${periodKey}_${scope}`] ?? [];
    // Home / away readings for the Home–Away gap (Method 2), keyed by team name.
    const venue = (vScope: string) => {
      const m = new Map<string, { v: number; g: number }>();
      for (const r of b.stats!.tables[`${stat.prefix}_${periodKey}_${vScope}`] ?? []) {
        const v = r[stat.key]; const g = r['sample_size'];
        if (typeof v === 'number' && Number.isFinite(v)) m.set(norm(String(r.team_name)), { v, g: typeof g === 'number' && Number.isFinite(g) ? g : 0 });
      }
      return m;
    };
    const homeMap = venue('home'); const awayMap = venue('away');
    const list: Row[] = [];
    for (const r of rows) {
      const v = r[stat.key];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const s = r['sample_size'];
      if (typeof s === 'number' && Number.isFinite(s) && s < RANK_MIN_GAMES) continue;
      const id = numTeamId(r);
      const nk = norm(String(r.team_name));
      const h = homeMap.get(nk); const a = awayMap.get(nk);
      const measurable = !!h && !!a && h.g >= RANK_MIN_VENUE && a.g >= RANK_MIN_VENUE && h.g + a.g >= RANK_MIN_GAMES;
      const gap = measurable ? Math.abs(h!.v - a!.v) : null;
      const dom: DominantVenue | null = !measurable ? null : h!.v > a!.v ? 'home' : a!.v > h!.v ? 'away' : 'balanced';
      const row: Row = {
        idKey: id == null ? null : `${b.competition}::id:${id}`,
        nameKey: `${b.competition}::name:${nk}`,
        value: v, gap, dom,
      };
      list.push(row);
      all.push(row);
    }
    byComp.set(b.competition, list);
  }
  const place = (row: Row) => {
    const rank = row.rank!;
    if (row.idKey) out.set(row.idKey, rank);
    out.set(row.nameKey, rank);
  };
  // Method 1 — rank by the stat %, per league then across leagues.
  for (const list of byComp.values()) {
    const sorted = [...list].sort((a, b) => b.value - a.value || a.nameKey.localeCompare(b.nameKey));
    sorted.forEach((row, i) => {
      row.rank = {
        value: row.value, leagueRank: i + 1, leagueTotal: sorted.length, worldRank: 0, worldTotal: 0,
        gap: row.gap, gapLeagueRank: null, gapLeagueTotal: 0, gapWorldRank: null, gapWorldTotal: 0, leagueTier: null, worldTier: null,
        dominantVenue: row.dom,
      };
      place(row);
    });
  }
  const sortedAll = [...all].sort((a, b) => b.value - a.value || a.nameKey.localeCompare(b.nameKey));
  sortedAll.forEach((row, i) => { if (row.rank) { row.rank.worldRank = i + 1; row.rank.worldTotal = sortedAll.length; } });
  // Method 2 — rank by the Home–Away gap (DA), per league then across leagues, and
  // split each ranked list into top / mid / bottom thirds.
  for (const list of byComp.values()) {
    const gapped = list.filter((r) => r.gap != null).sort((a, b) => (b.gap! - a.gap!) || a.nameKey.localeCompare(b.nameKey));
    gapped.forEach((row, i) => { if (row.rank) { row.rank.gapLeagueRank = i + 1; row.rank.gapLeagueTotal = gapped.length; row.rank.leagueTier = tierOf(i + 1, gapped.length); } });
  }
  const gappedAll = all.filter((r) => r.gap != null).sort((a, b) => (b.gap! - a.gap!) || a.nameKey.localeCompare(b.nameKey));
  gappedAll.forEach((row, i) => { if (row.rank) { row.rank.gapWorldRank = i + 1; row.rank.gapWorldTotal = gappedAll.length; row.rank.worldTier = tierOf(i + 1, gappedAll.length); } });
  return out;
}

/* ----------------------------------------------------------------- per-side fixture evaluation */

export type CondMembership = { set: Set<string>; evalByKey: Map<string, TeamEval> };
/** Per condition, the teams that satisfy it (at the condition's own period) + the proving eval. */
export function conditionMembership(bundles: LeagueBundle[], conditions: Condition[]): Map<string, CondMembership> {
  const out = new Map<string, CondMembership>();
  for (const cond of conditions) {
    const dim = getDimension(cond.dimensionId);
    const set = new Set<string>();
    const evalByKey = new Map<string, TeamEval>();
    if (dim) {
      for (const bundle of bundles) {
        for (const ev of dim.evaluate(bundle, { period: cond.period, methodId: cond.methodId, options: cond.options })) {
          if (!ev.qualifies) continue;
          const key = `${bundle.competition}::${teamKeyOf(ev)}`;
          set.add(key); evalByKey.set(key, { ...ev, conditionId: cond.id });
        }
      }
    }
    out.set(cond.id, { set, evalByKey });
  }
  return out;
}

export type FixtureTeam = { id: number | null; name: string };
export type FixtureSideResult = { homeEvals: TeamEval[]; awayEvals: TeamEval[]; color: ResultColor; matched: number; rank?: number };

/**
 * Does a fixture (home H, away A) satisfy the strategy with per-condition side
 * targeting? Each condition is checked against the team its `side` names (either
 * = H or A); `not` inverts membership. AND needs all conditions, OR needs one.
 * Returns the matched evals grouped by which team satisfied them, or null.
 */
export function evaluateFixtureSides(
  membership: Map<string, CondMembership>,
  conditions: Condition[],
  logic: StrategyLogic,
  competition: string,
  home: FixtureTeam,
  away: FixtureTeam,
): FixtureSideResult | null {
  if (!conditions.length) return null;
  const hKey = `${competition}::${teamKeyOf({ teamId: home.id, team: home.name })}`;
  const aKey = `${competition}::${teamKeyOf({ teamId: away.id, team: away.name })}`;
  const hInfo = { team: home.name, teamId: home.id, competition };
  const aInfo = { team: away.name, teamId: away.id, competition };
  const homeEvals: TeamEval[] = [];
  const awayEvals: TeamEval[] = [];
  let matched = 0;
  for (const c of conditions) {
    const m = membership.get(c.id);
    if (!m) continue;
    const inH = c.not ? !m.set.has(hKey) : m.set.has(hKey);
    const inA = c.not ? !m.set.has(aKey) : m.set.has(aKey);
    const side = c.side ?? 'either';
    const takeHome = (side === 'home' || side === 'either') && inH;
    const takeAway = (side === 'away' || side === 'either') && inA;
    if (takeHome) homeEvals.push(c.not ? notEval(c, hInfo, c.period) : m.evalByKey.get(hKey)!);
    if (takeAway) awayEvals.push(c.not ? notEval(c, aInfo, c.period) : m.evalByKey.get(aKey)!);
    if (side === 'home' ? inH : side === 'away' ? inA : inH || inA) matched += 1;
  }
  const ok = logic === 'and' ? matched === conditions.length : matched >= 1;
  if (!ok) return null;
  const all = [...homeEvals, ...awayEvals];
  const color = strongestColor(all.map((e) => e.color));
  const ranks = all.map((e) => e.rank).filter((r): r is number => r != null);
  const rank = ranks.length ? Math.min(...ranks) : undefined;
  return { homeEvals, awayEvals, color, matched, rank };
}

export type StrategySummary = { teams: number; leagues: number; green: number; yellow: number; red: number };
export function summarize(results: StrategyResult[]): StrategySummary {
  const leagues = new Set(results.map((r) => r.competition));
  let green = 0, yellow = 0, red = 0;
  for (const r of results) { if (r.color === 'green') green += 1; else if (r.color === 'yellow') yellow += 1; else if (r.color === 'red') red += 1; }
  return { teams: results.length, leagues: leagues.size, green, yellow, red };
}

/* ----------------------------------------------------------------- quick strategy presets */

export type PresetCondition = { dimensionId: string; methodId: string; options: Record<string, string> };
export type StrategyPreset = { id: string; label: string; note: string; period: StrategyPeriod; logic: StrategyLogic; conditions: PresetCondition[] };

/** A Stat-filter Limit (≥/≤) condition — the shape most presets use. */
function sfLimit(methodId: string, value: number, o: { family?: string; window?: string; cmp?: 'gte' | 'lte' } = {}): PresetCondition {
  return {
    dimensionId: 'statfilter',
    methodId,
    options: { family: o.family ?? 'ordinary', window: o.window ?? 'season', mode: 'limit', level: ALL, cmp: o.cmp ?? 'gte', value: String(value) },
  };
}

/** A Rule (grading1) condition — a gradable stat, a 🎯 market, or a composite
 *  (op: / ch: / om:). `show`/engine options sharpen it into a filter. */
function gRule(methodId: string, options: Record<string, string> = {}): PresetCondition {
  return { dimensionId: 'grading1', methodId, options: { show: ALL, ...options } };
}

/**
 * Ready-made strategies, ported from the Method 3 "Leaky Leaky" family
 * (utils/strategyFilter.ts) plus a few more. Expressed as Stat-filter limits at a
 * single global period/venue (the builder's model), so one click fills the build.
 */
export const STRATEGY_PRESETS: StrategyPreset[] = [
  {
    id: 'leaky', label: 'Leaky Leaky · BTTS & goals', note: 'Both teams concede often and both score.',
    period: 'overall', logic: 'and',
    conditions: [sfLimit('conceding_05', 80, { window: 'last10' }), sfLimit('btts_yes', 55), sfLimit('over25', 50)],
  },
  {
    id: 'over25', label: 'Goals galore · Over 2.5', note: 'Free-scoring and leaky over the last 10.',
    period: 'overall', logic: 'and',
    conditions: [sfLimit('sc_avg', 1.5, { window: 'last10' }), sfLimit('conceding_05', 80, { window: 'last10' })],
  },
  {
    id: 'secondhalf', label: '2nd-half goals', note: 'Goals arrive after the break.',
    period: 'secondhalf', logic: 'and',
    conditions: [sfLimit('over15', 55), sfLimit('scoring_05', 70, { window: 'last5' })],
  },
  {
    id: 'tight', label: 'Tight & low-scoring', note: 'Unders and clean sheets.',
    period: 'overall', logic: 'and',
    conditions: [sfLimit('under25', 55), sfLimit('cs_pct', 40)],
  },
  {
    id: 'stronghome', label: 'Strong at home', note: 'Wins and scores at home.',
    period: 'home', logic: 'and',
    conditions: [sfLimit('w_pct', 55), sfLimit('sc_pct', 80)],
  },
  {
    id: 'bttsboth', label: 'BTTS both halves', note: 'Both teams score in each half.',
    period: 'overall', logic: 'and',
    conditions: [sfLimit('btts_both_halves', 40, { family: 'ftonly' })],
  },
  // Composite + market rules — the recently-added tests put to work as filters.
  {
    id: 'onesided', label: 'One-sided DA · scorers', note: 'A clear Opposite DA split, free-scoring, goals flow.',
    period: 'overall', logic: 'and',
    conditions: [gRule('op:all', { allocation: 'long' }), sfLimit('sc_pct', 70), sfLimit('over25', 50)],
  },
  {
    id: 'winmargin', label: 'Home win-margins', note: 'Wins by 2+ at home and keeps it clean.',
    period: 'home', logic: 'and',
    conditions: [gRule('mk_win2', { show: 'strong' }), sfLimit('cs_pct', 45)],
  },
  {
    id: 'firsthalfkings', label: '1st-half kings', note: 'Scores early and shuts out the 1st half.',
    period: 'overall', logic: 'and',
    conditions: [gRule('mk_scored_1h', { show: 'strong' }), gRule('mk_cs_1h', { show: 'strong' })],
  },
  {
    id: 'sensitivegoals', label: 'Sensitive scorers · watch', note: 'Big-win-inflated scoring average that still produces goals.',
    period: 'overall', logic: 'and',
    conditions: [gRule('om:scoring', { direction: 'up' }), sfLimit('over25', 50)],
  },
];

/* ----------------------------------------------------------------- match strength & grade share */

/** How much of the strategy a result satisfies — matched vs total conditions. */
export function matchStrength(result: StrategyResult, total: number): { matched: number; total: number; pct: number } {
  const matched = result.conditions.length;
  return { matched, total, pct: total > 0 ? Math.round((matched / total) * 100) : 0 };
}

export type LeagueGradeShare = { total: number; byColor: Record<ResultColor, number>; byGrade: Record<string, number> };
/** Per competition, the share of each colour / grade across that league's qualifiers. */
export function gradeShareByLeague(results: StrategyResult[]): Map<string, LeagueGradeShare> {
  const m = new Map<string, LeagueGradeShare>();
  for (const r of results) {
    let s = m.get(r.competition);
    if (!s) { s = { total: 0, byColor: { green: 0, yellow: 0, red: 0, none: 0 }, byGrade: {} }; m.set(r.competition, s); }
    s.total += 1;
    s.byColor[r.color] += 1;
    const g = r.conditions.find((c) => c.grade)?.grade;
    if (g) s.byGrade[g] = (s.byGrade[g] ?? 0) + 1;
  }
  return m;
}

/* ----------------------------------------------------------------- fixture recommendations */

/** League home/away goal baseline from the season's completed fixtures. */
export function leagueBaselineFromFixtures(fixtures: RawFixture[]): LeagueBaseline {
  let n = 0, home = 0, away = 0;
  for (const f of fixtures) {
    if (f.home_goals == null || f.away_goals == null) continue;
    n += 1; home += f.home_goals; away += f.away_goals;
  }
  return n > 0 ? { homeAvg: home / n, awayAvg: away / n, measured: true } : { homeAvg: 0, awayAvg: 0, measured: false };
}

/** A league prepared once for fixture predictions: per-team goals + baseline. */
export type LeaguePrep = { baseline: LeagueBaseline; byKey: Map<string, GoalTeamAnalysis> };
export function prepareLeague(fixtures: RawFixture[]): LeaguePrep {
  const goals = analyzeTeamGoals(fixtures, 'fulltime');
  const byKey = new Map(goals.map((g) => [teamKeyOf({ teamId: g.teamId, team: g.team }), g]));
  return { baseline: leagueBaselineFromFixtures(fixtures), byKey };
}

export type FixtureRec = { prediction: FixturePrediction; rec: FixtureRecommendation };

/**
 * Ranked betting recommendation for one fixture: the home side's home scoring/
 * conceding vs the away side's away scoring/conceding feed the existing goal
 * model, then the recommendation engine ranks the markets (best first). Null
 * when either side has no games in the season sample.
 */
export function recommendFixture(
  prep: LeaguePrep,
  home: { id: number | null; name: string },
  away: { id: number | null; name: string },
  modules?: MarketModule[],
): FixtureRec | null {
  const h = prep.byKey.get(teamKeyOf({ teamId: home.id, team: home.name }));
  const a = prep.byKey.get(teamKeyOf({ teamId: away.id, team: away.name }));
  if (!h || !a) return null;
  const homeVenue: VenueStats = { scAvg: h.home.avgFor ?? 0, concAvg: h.home.avgAgainst ?? 0, sample: h.home.games };
  const awayVenue: VenueStats = { scAvg: a.away.avgFor ?? 0, concAvg: a.away.avgAgainst ?? 0, sample: a.away.games };
  if (homeVenue.sample <= 0 || awayVenue.sample <= 0) return null;
  const prediction = predictFromStats(homeVenue, awayVenue, prep.baseline);
  const rec = buildRecommendation({ prediction, homeName: home.name, awayName: away.name, modules: modules && modules.length ? modules : undefined });
  return { prediction, rec };
}

/** The grading condition whose grade+column headlines a result (the first one). */
export function gradingHead(result: StrategyResult): TeamEval | null {
  return result.conditions.find((c) => c.dimensionId === 'grading1' && (c.qualifications?.length ?? 0) > 0) ?? null;
}

export type ResultFilters = {
  league: string; dimension: string; color: string; minGames: number; minMatch?: number; total?: number;
  /** Grading-only facets — match ANY of a team's qualifications (not just the headline). */
  group?: string; column?: string; letter?: string; source?: string;
};
export function filterResults(results: StrategyResult[], f: ResultFilters): StrategyResult[] {
  return results.filter((r) => {
    if (f.league !== ALL && r.competition !== f.league) return false;
    if (f.color !== ALL && r.color !== f.color) return false;
    if (f.dimension !== ALL && !r.conditions.some((c) => c.dimensionId === f.dimension)) return false;
    // Grading facets look across every qualification a team holds, so filtering by
    // e.g. the "Ordinary + RFS" column surfaces teams that have that signal even
    // when a stronger column headlines the row.
    const wantsGrading = (f.group && f.group !== ALL) || (f.column && f.column !== ALL) || (f.letter && f.letter !== ALL) || (f.source && f.source !== ALL);
    const quals = wantsGrading ? gradingHead(r)?.qualifications ?? null : null;
    if (f.group && f.group !== ALL) {
      if (!quals || !quals.some((q) => q.roman === f.group)) return false;
    }
    if (f.column && f.column !== ALL) {
      if (!quals || !quals.some((q) => q.column === f.column)) return false;
    }
    if (f.letter && f.letter !== ALL) {
      if (!quals || !quals.some((q) => q.letter === f.letter)) return false;
    }
    if (f.source && f.source !== ALL) {
      if (!quals || !quals.some((q) => String(q.source) === f.source)) return false;
    }
    if (f.minGames > 0) {
      const samples = r.conditions.map((c) => c.sample).filter((s): s is number => s != null);
      if (samples.length && Math.min(...samples) < f.minGames) return false;
    }
    if (f.minMatch && f.minMatch > 0 && f.total && f.total > 0) {
      if ((r.conditions.length / f.total) * 100 < f.minMatch) return false;
    }
    return true;
  });
}
