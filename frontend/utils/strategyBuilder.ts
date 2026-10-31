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
import type { RawFixture } from '@/services/oddAlerts';
import { differenceDaBand } from '@/utils/daBands';
import {
  DOMINANCE_STATS, HALF_STATS, buildHalfDominance, buildHomeAwayDominance, type StatDef,
} from '@/utils/dominance';
import {
  DA_GRADES, GRADABLE_STATS, SOURCE_LISTS, directionOf, gradableStatLabel, gradeAllTeamsForStat,
  isStrong, type Grade, type SourceListId,
} from '@/utils/statsGrading';
import { buildMethod2Grid } from '@/utils/statsGradingMethod2';
import { OPPOSITE_PAIRS, buildOppositeStats, type OppositeScope } from '@/utils/oppositeStats';
import {
  GAP_MARKETS, analyzeTeamGames, analyzeTeamGoals,
  type GapMarket, type GapPeriod, type GoalTeamAnalysis,
} from '@/utils/gapAnalytics';
import {
  STATS_CHARACTERS, characterFor, levelForAvgM1, levelForRankM2,
  levelGlyph, MIN_GAMES_OVERALL, MIN_GAMES_PER_VENUE, type CharColour, type CharLevel,
} from '@/utils/statsCharacters';
import { predictFromStats, type FixturePrediction, type LeagueBaseline, type VenueStats } from '@/services/predictionEngine';
import { buildRecommendation, type FixtureRecommendation, type MarketModule } from '@/utils/fixtureRecommendation';
import { theme } from '@/styles/theme';

/* ----------------------------------------------------------------- common types */

export type StrategyPeriod = 'overall' | 'home' | 'away' | 'firsthalf' | 'secondhalf';
export type ResultColor = 'green' | 'yellow' | 'red' | 'none';

export const PERIODS: { value: StrategyPeriod; label: string }[] = [
  { value: 'overall', label: 'Overall' },
  { value: 'home', label: 'Home' },
  { value: 'away', label: 'Away' },
  { value: 'firsthalf', label: 'First Half' },
  { value: 'secondhalf', label: 'Second Half' },
];
export function periodLabel(p: StrategyPeriod): string {
  return PERIODS.find((x) => x.value === p)?.label ?? p;
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
};

export type MethodOpt = { value: string; label: string };
export type OptionDef = { key: string; label: string; options: MethodOpt[]; default: string };

/** A league's prepared data: the built export and/or its season fixtures. */
export type LeagueBundle = { competition: string; stats?: TeamStatsExport; fixtures?: RawFixture[] };

export type Selection = { period: StrategyPeriod; methodId: string; options: Record<string, string> };

export type Dimension = {
  id: string;
  label: string;
  /** Which prepared data this dimension reads. */
  source: 'export' | 'fixtures';
  periods: StrategyPeriod[];
  /** Feature list for the chosen period (includes an "All" entry where it applies). */
  methods: (period: StrategyPeriod) => MethodOpt[];
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
  if (p === 'home') return { periodKey: 'ft', scope: 'home' };
  if (p === 'away') return { periodKey: 'ft', scope: 'away' };
  if (p === 'firsthalf') return { periodKey: 'ht', scope: 'overall' };
  if (p === 'secondhalf') return { periodKey: '2h', scope: 'overall' };
  return { periodKey: 'ft', scope: 'overall' };
}
function pctText(v: number | null): string { return v == null ? '—' : `${Math.round(v)}%`; }
function avgText(v: number | null): string { return v == null ? '—' : v.toFixed(2); }
function colourToResult(c: CharColour): ResultColor { return c === 'green' ? 'green' : c === 'red' ? 'red' : 'yellow'; }

export function resultColour(c: ResultColor): string {
  return c === 'green' ? theme.accentGreen : c === 'yellow' ? theme.yellow : c === 'red' ? theme.loss : theme.textMuted;
}
export function resultBackground(c: ResultColor): string {
  return c === 'green' ? 'rgba(5,150,105,0.10)' : c === 'yellow' ? 'rgba(202,138,4,0.12)' : c === 'red' ? 'rgba(220,38,38,0.08)' : 'rgba(148,163,184,0.10)';
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
  methods: (p) => (p === 'firsthalf' || p === 'secondhalf' ? HALF_STATS : DOMINANCE_STATS).map((d) => ({ value: d.key, label: d.label })),
  options: [{ key: 'band', label: 'Level', options: STATS_CALL_BANDS, default: 'up' }],
  evaluate: (b, sel) => {
    const stats = b.stats;
    if (!stats) return [];
    const defs: StatDef[] = sel.period === 'firsthalf' || sel.period === 'secondhalf' ? HALF_STATS : DOMINANCE_STATS;
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

const charGapPeriod = (p: StrategyPeriod): GapPeriod => (p === 'firsthalf' ? 'firsthalf' : p === 'secondhalf' ? 'secondhalf' : 'fulltime');
const charScope = (p: StrategyPeriod): 'home' | 'away' | 'overall' => (p === 'home' ? 'home' : p === 'away' ? 'away' : 'overall');

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

const GRADE_LETTERS: MethodOpt[] = ['A', 'B', 'C', 'D', 'E', 'F'].map((g) => ({ value: g, label: g }));
const gradeColor = (letter: Grade): ResultColor => (DA_GRADES.includes(letter) ? 'yellow' : isStrong(letter) ? 'green' : 'red');

const grading1: Dimension = {
  id: 'grading1',
  label: 'Stats Grading · Method 1',
  source: 'export',
  periods: ['overall'],
  methods: () => GRADABLE_STATS.map((s) => ({ value: s.key, label: s.label })),
  options: [
    { key: 'source', label: 'Source list', options: SOURCE_LISTS.map((s) => ({ value: String(s.id), label: s.label })), default: '1' },
    { key: 'direction', label: 'Direction', options: [{ value: ALL, label: 'Strong or weak' }, { value: 'strong', label: 'Strong (A–C)' }, { value: 'weak', label: 'Weak (D–F)' }], default: ALL },
    { key: 'letter', label: 'Grade', options: [{ value: ALL, label: 'Any grade' }, ...GRADE_LETTERS], default: ALL },
  ],
  evaluate: (b, sel) => {
    const stats = b.stats;
    if (!stats) return [];
    const source = (Number(sel.options.source ?? '1') as SourceListId);
    const direction = sel.options.direction ?? ALL;
    const letter = sel.options.letter ?? ALL;
    const graded = gradeAllTeamsForStat(stats, source, sel.methodId, b.competition);
    const out: TeamEval[] = [];
    for (const g of graded) {
      if (g.grade == null || g.direction == null) continue;
      if (direction !== ALL && g.direction !== direction) continue;
      if (letter !== ALL && g.grade !== letter) continue;
      out.push({
        teamId: g.teamId, team: g.team, competition: b.competition, qualifies: true,
        value: g.overallValue, valueText: pctText(g.overallValue),
        grade: `${g.grade}${g.roman ? ` · ${g.roman}` : ''}${g.da ? ' · DA' : ''}`, color: gradeColor(g.grade),
        dimensionId: 'grading1', dimensionLabel: 'Stats Grading · Method 1',
        feature: gradableStatLabel(sel.methodId),
        method: `${g.direction} · ${SOURCE_LISTS.find((s) => s.id === source)?.label ?? source} · ${g.grade}`,
        period: 'overall',
        reason: `Home ${pctText(g.homeValue)} / Overall ${pctText(g.overallValue)} → grade ${g.grade}`,
        sample: g.sample,
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
    const scope: OppositeScope = sel.period === 'home' ? 'home' : sel.period === 'away' ? 'away' : 'overall';
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

const gapGapPeriod = (p: StrategyPeriod): GapPeriod => (p === 'firsthalf' ? 'firsthalf' : p === 'secondhalf' ? 'secondhalf' : 'fulltime');

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

/* ----------------------------------------------------------------- registry */

export const DIMENSIONS: Dimension[] = [statsCall, characters, grading1, grading2, dominance, opposite, gap];
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

export type Condition = {
  id: string;
  dimensionId: string;
  period: StrategyPeriod;
  methodId: string;
  options: Record<string, string>;
  /** When true, a team matches this condition by NOT satisfying it (exclude). */
  not?: boolean;
};

/** How a strategy applies to a fixture's two sides. */
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
};

export type StrategyLogic = 'and' | 'or';

/** Readable one-line label for a condition in the app's existing terminology. */
export function conditionLabel(cond: Condition): string {
  const dim = getDimension(cond.dimensionId);
  if (!dim) return '—';
  const method = dim.methods(cond.period).find((m) => m.value === cond.methodId)?.label ?? cond.methodId;
  const opts = (dim.options ?? [])
    .map((o) => o.options.find((x) => x.value === (cond.options[o.key] ?? o.default))?.label)
    .filter(Boolean);
  const periodPart = dim.periods.length > 1 ? `${periodLabel(cond.period)} → ` : '';
  return `${cond.not ? 'NOT · ' : ''}${periodPart}${dim.label} → ${method}${opts.length ? ` · ${opts.join(' · ')}` : ''}`;
}

/** A synthesised eval for a NOT condition a team matches by exclusion. */
function notEval(cond: Condition, info: { team: string; teamId: number | null; competition: string }): TeamEval {
  const dim = getDimension(cond.dimensionId);
  const method = dim?.methods(cond.period).find((m) => m.value === cond.methodId)?.label ?? cond.methodId;
  return {
    teamId: info.teamId, team: info.team, competition: info.competition, qualifies: true,
    value: null, valueText: '—', grade: null, color: 'none',
    dimensionId: cond.dimensionId, dimensionLabel: dim?.label ?? cond.dimensionId,
    feature: `NOT ${method}`, method: 'excluded', period: cond.period,
    reason: `Does not match ${dim?.label ?? cond.dimensionId} · ${method}`, sample: null,
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
          set.add(key); em.set(key, ev);
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
    const evals = matched.map((c) => (c.not ? notEval(c, info) : condEval.get(c.id)!.get(key)!));
    results.push({ team: info.team, teamId: info.teamId, competition: info.competition, conditions: evals, color: strongestColor(evals.map((e) => e.color)) });
  }
  return results.sort((a, b) => COLOR_RANK[b.color] - COLOR_RANK[a.color] || a.team.localeCompare(b.team));
}

/** Index results by `competition::teamKey` so a fixture's sides can be looked up. */
export function resultsByTeam(results: StrategyResult[]): Map<string, StrategyResult> {
  const m = new Map<string, StrategyResult>();
  for (const r of results) m.set(`${r.competition}::${teamKeyOf(r)}`, r);
  return m;
}

export type StrategySummary = { teams: number; leagues: number; green: number; yellow: number; red: number };
export function summarize(results: StrategyResult[]): StrategySummary {
  const leagues = new Set(results.map((r) => r.competition));
  let green = 0, yellow = 0, red = 0;
  for (const r of results) { if (r.color === 'green') green += 1; else if (r.color === 'yellow') yellow += 1; else if (r.color === 'red') red += 1; }
  return { teams: results.length, leagues: leagues.size, green, yellow, red };
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

export type ResultFilters = { league: string; dimension: string; color: string; minGames: number };
export function filterResults(results: StrategyResult[], f: ResultFilters): StrategyResult[] {
  return results.filter((r) => {
    if (f.league !== ALL && r.competition !== f.league) return false;
    if (f.color !== ALL && r.color !== f.color) return false;
    if (f.dimension !== ALL && !r.conditions.some((c) => c.dimensionId === f.dimension)) return false;
    if (f.minGames > 0) {
      const samples = r.conditions.map((c) => c.sample).filter((s): s is number => s != null);
      if (samples.length && Math.min(...samples) < f.minGames) return false;
    }
    return true;
  });
}
