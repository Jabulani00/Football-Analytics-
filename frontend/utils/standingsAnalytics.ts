/**
 * Standings analytics engine.
 *
 * Derives every analytics table in the analytics-integration spec from the
 * season's *real* finished results:
 *
 *   • PPG tables — Overall / Home / Away × Full-time / 1st Half / 2nd Half,
 *     plain or measured against the Green / Yellow / Red colour band.
 *   • Last-6 PPG — same split/period matrix, windowed to the last 6 games.
 *   • Recent-form tables — Last 10 / 8 / 6 games × split × period.
 *   • Probability tables — outcome metrics that re-sort the whole table.
 *
 * Everything is counted, never modelled. The match feed comes from
 * `utils/leagueTables`, which is built from the competition's finished
 * fixtures, so `played = won + drawn + lost`, `points = 3·won + drawn` and
 * `played` can never exceed the matches actually played against the opponents
 * being measured. A view that has no results to count reports `needsResults`
 * instead of producing numbers.
 *
 * Every builder returns a plain `StandingRow[]` so the main standings table
 * renders unchanged in structure; only its contents and order respond.
 */
import type { StandingRow } from '@/mock/matchData';
import {
  aggregate,
  bandRange,
  scopeMatches,
  type Band as ColourBand,
  type MatchFeed,
  type Period,
  type PeriodMatch,
  type Scope,
  type Split,
  type TeamMatch,
  type TeamRecord,
} from '@/utils/leagueTables';

export type { Period, Split } from '@/utils/leagueTables';

/** `plain` measures the whole league; the colours measure one band only. */
export type Band = 'plain' | ColourBand;
export type FormWindow = 6 | 8 | 10;

export type Selection =
  | { kind: 'standard' }
  | { kind: 'ppg'; split: Split; period: Period; band: Band }
  | { kind: 'last6ppg'; split: Split; period: Period }
  | { kind: 'form'; window: FormWindow; split: Split; period: Period }
  | { kind: 'prob'; metric: ProbMetricKey; period: Period };

/** The value column shown for a probability metric (the stat it's ranked by). */
export type MetricColumn = {
  /** Short header, e.g. "SC%" or "PPG". */
  header: string;
  /** Full metric label. */
  full: string;
  /** Per-team display: the headline value + a supporting stat line. */
  values: Map<string, { display: string; sub: string }>;
};

export type StandingsView = {
  rows: StandingRow[];
  /** Human-readable description of the active filter. */
  caption: string;
  /** How the numbers were counted — spells the arithmetic out on screen. */
  note?: string;
  /** Teams sitting inside the selected colour band (band tables only). */
  bandMembers?: Set<string>;
  /** Present for probability and band tables — the value shown + ranked per team. */
  metric?: MetricColumn;
  /**
   * Provenance for goal-timing tables: 'measured' when every row came from the
   * provider's recorded timings, 'partial' when only some did, 'unavailable'
   * when the metric cannot be counted from results at all.
   */
  timingSource?: 'measured' | 'partial' | 'unavailable';
  /**
   * The view needs this season's finished results and the caller supplied
   * none. Callers show a "needs results" state — never invented numbers.
   */
  needsResults?: boolean;
};

// ---------------------------------------------------------------------------
// Feed access
// ---------------------------------------------------------------------------

/** The rows the table renders are keyed by name; the feed is keyed by id. */
function matchesFor(feed: MatchFeed | undefined, team: string): TeamMatch[] {
  if (!feed) return [];
  const id = feed.idByName.get(team);
  if (id == null) return [];
  return feed.byTeam.get(id) ?? [];
}

function bandFor(feed: MatchFeed | undefined, team: string): ColourBand | undefined {
  if (!feed) return undefined;
  const id = feed.idByName.get(team);
  return id == null ? undefined : feed.bandByTeam.get(id);
}

// ---------------------------------------------------------------------------
// Rows + ranking
// ---------------------------------------------------------------------------

type RankedRow = StandingRow & { ppg: number };

function recordToRow(team: string, rec: TeamRecord): RankedRow {
  return {
    pos: 0,
    team,
    played: rec.played,
    won: rec.won,
    drawn: rec.drawn,
    lost: rec.lost,
    gf: rec.goalsFor,
    ga: rec.goalsAgainst,
    gd: rec.goalDiff,
    points: rec.points,
    form: rec.form,
    ppg: rec.ppg,
  };
}

/**
 * Rank by points per game, so a team that has played fewer of the matches in
 * scope is not punished for it, then by the raw tallies. A team with nothing in
 * scope yet has no rate to rank and collects at the bottom.
 */
function sortRank(rows: RankedRow[]): StandingRow[] {
  return [...rows]
    .sort((a, b) => {
      if ((a.played === 0) !== (b.played === 0)) return a.played === 0 ? 1 : -1;
      if (b.ppg !== a.ppg) return b.ppg - a.ppg;
      if (b.points !== a.points) return b.points - a.points;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.team.localeCompare(b.team);
    })
    .map((r, i) => ({ ...r, pos: i + 1 }));
}

/** PPG column: the rate a table is ranked by, with its sum underneath. */
function ppgColumn(rows: RankedRow[]): MetricColumn {
  const values = new Map<string, { display: string; sub: string }>();
  for (const r of rows) {
    values.set(
      r.team,
      r.played === 0
        ? { display: '—', sub: 'no games in scope' }
        : {
            display: r.ppg.toFixed(2),
            sub: `${r.points} pts / ${r.played} ${r.played === 1 ? 'game' : 'games'}`,
          },
    );
  }
  return { header: 'PPG', full: 'Points per game', values };
}

// ---------------------------------------------------------------------------
// PPG / windowed / band tables
// ---------------------------------------------------------------------------

function buildScopedRows(base: StandingRow[], feed: MatchFeed, scope: Scope): RankedRow[] {
  return base.map((r) => recordToRow(r.team, aggregate(matchesFor(feed, r.team), scope)));
}

/**
 * How many of the matches in scope could be counted for the chosen period.
 * The half tables need a recorded `ht_score`; a match without one is dropped,
 * so the table says how many it dropped instead of filling the gap.
 *
 * Measured over the whole scope, never the recency window — the question is
 * "how many of your matches carry a half-time score", not "of your last six".
 */
function periodCoverage(
  base: StandingRow[],
  feed: MatchFeed,
  scope: Scope,
): { counted: number; eligible: number } {
  const unwindowed: Scope = { ...scope, window: undefined };
  let counted = 0;
  let eligible = 0;
  for (const r of base) {
    const s = scopeMatches(matchesFor(feed, r.team), unwindowed);
    counted += s.matches.length;
    eligible += s.eligible;
  }
  return { counted, eligible };
}

/**
 * The league table is the provider's; the feed is its fixture list. When the
 * feed holds fewer results than the table claims were played, say so — a short
 * feed makes every derived table short, and hiding that would make the numbers
 * look like a miscalculation.
 */
function completenessNote(base: StandingRow[], feed: MatchFeed): string {
  const tablePlayed = base.reduce((s, r) => s + r.played, 0);
  let feedPlayed = 0;
  for (const r of base) feedPlayed += matchesFor(feed, r.team).length;
  if (tablePlayed === 0 || feedPlayed >= tablePlayed) return '';
  return ` ${feedPlayed} of the ${tablePlayed} team-matches in the league table have a loaded result so far.`;
}

// ---------------------------------------------------------------------------
// Probability metrics
// ---------------------------------------------------------------------------

export type ProbMetricKey =
  | 'sc'
  | 'conc'
  | 'scm'
  | 'concm'
  | 'bttsY'
  | 'bttsN'
  | 'cs'
  | 'avg'
  | 'fts'
  | 'w'
  | 'd'
  | 'l'
  | 'o15'
  | 'o25'
  | 'o35'
  | 'o45'
  | 'u15'
  | 'u25'
  | 'u35'
  | 'u45'
  | 'o05'
  | 'u05'
  | 'tsc05'
  | 'tconc05'
  | 'tsc15'
  | 'tconc15'
  | 'tsc25'
  | 'tconc25'
  | 'scoredFirst'
  | 'handicap'
  | 'early1h'
  | 'early2h'
  | 'earlyConc'
  | 'late';

export type ProbMetric = { key: ProbMetricKey; label: string; short: string };

export const PROB_METRICS: ProbMetric[] = [
  { key: 'sc', label: 'Scoring %', short: 'SC%' },
  { key: 'conc', label: 'Conceding %', short: 'Conc%' },
  { key: 'scm', label: 'Goals scored / match (avg)', short: 'SC/m' },
  { key: 'concm', label: 'Goals conceded / match (avg)', short: 'Conc/m' },
  { key: 'bttsY', label: 'Both Teams to Score — Yes', short: 'BTTS-Y' },
  { key: 'bttsN', label: 'Both Teams to Score — No', short: 'BTTS-N' },
  { key: 'cs', label: 'Clean sheets', short: 'CS' },
  { key: 'avg', label: 'Average goals / match', short: 'AVG' },
  { key: 'fts', label: 'Failed to score', short: 'FTS' },
  { key: 'w', label: 'Wins', short: 'W%' },
  { key: 'd', label: 'Draws', short: 'D%' },
  { key: 'l', label: 'Losses', short: 'L%' },
  { key: 'o15', label: 'Over 1.5 goals', short: 'O1.5' },
  { key: 'o25', label: 'Over 2.5 goals', short: 'O2.5' },
  { key: 'o35', label: 'Over 3.5 goals', short: 'O3.5' },
  { key: 'o45', label: 'Over 4.5 goals', short: 'O4.5' },
  { key: 'u15', label: 'Under 1.5 goals', short: 'U1.5' },
  { key: 'u25', label: 'Under 2.5 goals', short: 'U2.5' },
  { key: 'u35', label: 'Under 3.5 goals', short: 'U3.5' },
  { key: 'u45', label: 'Under 4.5 goals', short: 'U4.5' },
  { key: 'o05', label: 'Over 0.5 goals', short: 'O0.5' },
  { key: 'u05', label: 'Under 0.5 goals', short: 'U0.5' },
  { key: 'tsc05', label: 'Scoring 0.5+ goals', short: 'SC0.5+' },
  { key: 'tconc05', label: 'Conceding 0.5+ goals', short: 'CN0.5+' },
  { key: 'tsc15', label: 'Scoring 1.5+ goals', short: 'SC1.5+' },
  { key: 'tconc15', label: 'Conceding 1.5+ goals', short: 'CN1.5+' },
  { key: 'tsc25', label: 'Scoring 2.5+ goals', short: 'SC2.5+' },
  { key: 'tconc25', label: 'Conceding 2.5+ goals', short: 'CN2.5+' },
  { key: 'scoredFirst', label: 'Scored first', short: 'ScrdF' },
  { key: 'handicap', label: 'Handicap (avg margin)', short: 'HCP' },
  { key: 'early1h', label: 'First goal — average minute', short: 'FG' },
  { key: 'earlyConc', label: 'First goal conceded — average minute', short: 'FGA' },
  { key: 'late', label: 'Late goals — from 70 min', short: 'L70' },
  { key: 'early2h', label: 'Late goals conceded — from 70 min', short: 'LC70' },
];

function pct(games: PeriodMatch[], cond: (g: PeriodMatch) => boolean): number {
  if (!games.length) return 0;
  return (games.filter(cond).length / games.length) * 100;
}

function probValue(games: PeriodMatch[], metric: ProbMetricKey): number {
  const total = (g: PeriodMatch) => g.gf + g.ga;
  const n = games.length || 1;
  switch (metric) {
    case 'sc':
    case 'tsc05':
      return pct(games, (g) => g.gf >= 1);
    case 'conc':
    case 'tconc05':
      return pct(games, (g) => g.ga >= 1);
    case 'scm':
      return games.reduce((s, g) => s + g.gf, 0) / n;
    case 'concm':
      return games.reduce((s, g) => s + g.ga, 0) / n;
    case 'bttsY':
      return pct(games, (g) => g.gf >= 1 && g.ga >= 1);
    case 'bttsN':
      return pct(games, (g) => !(g.gf >= 1 && g.ga >= 1));
    case 'cs':
      return pct(games, (g) => g.ga === 0);
    case 'avg':
      return games.reduce((s, g) => s + total(g), 0) / n;
    case 'fts':
      return pct(games, (g) => g.gf === 0);
    case 'w':
      return pct(games, (g) => g.gf > g.ga);
    case 'd':
      return pct(games, (g) => g.gf === g.ga);
    case 'l':
      return pct(games, (g) => g.gf < g.ga);
    case 'o05':
      return pct(games, (g) => total(g) >= 1);
    case 'o15':
      return pct(games, (g) => total(g) >= 2);
    case 'o25':
      return pct(games, (g) => total(g) >= 3);
    case 'o35':
      return pct(games, (g) => total(g) >= 4);
    case 'o45':
      return pct(games, (g) => total(g) >= 5);
    case 'u05':
      return pct(games, (g) => total(g) === 0);
    case 'u15':
      return pct(games, (g) => total(g) <= 1);
    case 'u25':
      return pct(games, (g) => total(g) <= 2);
    case 'u35':
      return pct(games, (g) => total(g) <= 3);
    case 'u45':
      return pct(games, (g) => total(g) <= 4);
    case 'tsc15':
      return pct(games, (g) => g.gf >= 2);
    case 'tconc15':
      return pct(games, (g) => g.ga >= 2);
    case 'tsc25':
      return pct(games, (g) => g.gf >= 3);
    case 'tconc25':
      return pct(games, (g) => g.ga >= 3);
    case 'handicap':
      return games.reduce((s, g) => s + (g.gf - g.ga), 0) / n;
    default:
      // Goal-order and goal-minute metrics are not in a final score.
      return 0;
  }
}

/** Metrics that read as an average number rather than a percentage. */
const AVG_METRICS = new Set<ProbMetricKey>(['scm', 'concm', 'avg', 'handicap']);

/**
 * Metrics that are about *when* a goal arrives rather than how often. A final
 * score does not carry minutes, so these are answered by the provider's
 * recorded timings or not at all.
 */
type TimingSpec = {
  /** Goals the team scores, or the ones it ships. */
  side: 'for' | 'against';
  /** Which goal of the game we time — the opening one or the closing one. */
  edge: 'first' | 'last';
};

const TIMING_SPECS: Partial<Record<ProbMetricKey, TimingSpec>> = {
  early1h: { side: 'for', edge: 'first' },
  early2h: { side: 'against', edge: 'last' },
  earlyConc: { side: 'against', edge: 'first' },
  late: { side: 'for', edge: 'last' },
};

/**
 * Which goal came first is not in a final score either, and the season-stats
 * endpoint does not measure it (see docs/ODDALERTS_API_GAPS.md). It is reported
 * as unavailable rather than inferred from half-time leads.
 */
const NOT_IN_A_SCORE = new Set<ProbMetricKey>(['scoredFirst']);

/**
 * Measured goal timing for one team, as supplied by the caller.
 *
 * Mirrors `TeamGoalTiming` in services/oddAlerts, kept as a local shape so this
 * module stays free of any API import and remains testable with plain objects.
 */
export type TeamTiming = {
  firstGoalFor: number | null;
  firstGoalAgainst: number | null;
  scoredIn15: { count: number; pct: number };
  concededIn15: { count: number; pct: number };
  scoredAfter70: { count: number; pct: number };
  concededAfter70: { count: number; pct: number };
  coveragePct: number;
};

type Cell = {
  value: number;
  asc: boolean;
  display: string;
  sub: string;
  /** No value for this team — always sorts last, never ranked. */
  missing?: boolean;
};

/**
 * Below this many matches an "average first goal minute" is really just one
 * match, and a percentage is only ever 0 or 100. Values still show, but the
 * stat line reports the sample instead of a meaningless rate.
 */
const MIN_TIMING_MATCHES = 3;

/**
 * The real cell for a goal-timing metric, or null when this team has no
 * measured timing (a competition the provider does not cover, or a side that
 * has not scored yet).
 *
 * `first`-edge metrics headline the average minute and rank earliest-first;
 * `last`-edge metrics headline the share of matches with a late goal, because
 * the API measures that as a rate rather than a minute.
 */
function realTimingCell(metric: ProbMetricKey, t: TeamTiming, played: number): Cell | null {
  if (metric === 'early1h' || metric === 'earlyConc') {
    const forSide = metric === 'early1h';
    const minute = forSide ? t.firstGoalFor : t.firstGoalAgainst;
    if (minute == null) return null;
    const window = forSide ? t.scoredIn15 : t.concededIn15;
    const verb = forSide ? 'scored' : 'conceded';
    const thin = played < MIN_TIMING_MATCHES;
    return {
      value: minute,
      asc: true,
      display: `${minute.toFixed(1)}'`,
      sub: thin
        ? `from ${played} ${played === 1 ? 'match' : 'matches'}`
        : `${Math.round(window.pct)}% ${verb} by 15'`,
    };
  }
  if (metric === 'late' || metric === 'early2h') {
    const window = metric === 'late' ? t.scoredAfter70 : t.concededAfter70;
    if (!played) return null;
    return {
      value: window.pct,
      asc: false,
      display: `${Math.round(window.pct)}%`,
      sub: `${window.count} of ${played}`,
    };
  }
  return null;
}

/** Placeholder for a team the provider has no measured value for. */
function missingCell(asc: boolean, sub = 'not yet'): Cell {
  return { value: asc ? Infinity : -Infinity, asc, display: '—', sub, missing: true };
}

/**
 * The value + supporting stat shown for one team on a probability metric, plus
 * how to rank it (asc = smaller-is-better, e.g. earliest goal first).
 */
function metricCell(
  row: StandingRow,
  games: PeriodMatch[],
  metric: ProbMetricKey,
  measured?: TeamTiming,
): Cell {
  const n = games.length;

  const spec = TIMING_SPECS[metric];
  if (spec) {
    const real = measured ? realTimingCell(metric, measured, row.played) : null;
    return real ?? missingCell(spec.edge === 'first', 'no recorded timing');
  }
  if (NOT_IN_A_SCORE.has(metric)) return missingCell(false, 'needs goal order');

  const v = probValue(games, metric);

  if (AVG_METRICS.has(metric)) {
    const display = metric === 'handicap' ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}` : v.toFixed(2);
    const sub = metric === 'handicap' ? 'avg goal margin' : 'goals / match';
    return { value: v, asc: false, display, sub };
  }

  if (n === 0) return missingCell(false, 'no games in scope');

  // Percentage metrics: show the % and how many of the games hit it.
  const hits = Math.round((v / 100) * n);
  return { value: v, asc: false, display: `${Math.round(v)}%`, sub: `${hits} of ${n}` };
}

function buildProbTable(
  base: StandingRow[],
  gamesFor: (team: string) => PeriodMatch[],
  metric: ProbMetricKey,
  period: Period,
  timing?: Map<string, TeamTiming>,
): { rows: StandingRow[]; metric: MetricColumn; measuredCount: number; thinCount: number } {
  // Measured timing covers the whole match, so it answers the Full-time view
  // only; the half views have nothing to read.
  const useTiming = !!TIMING_SPECS[metric] && period === 'ft' ? timing : undefined;
  const measuredCount = useTiming
    ? base.filter((r) => {
        const t = useTiming.get(r.team);
        return !!t && realTimingCell(metric, t, r.played) !== null;
      }).length
    : 0;

  const cells = base.map((r) => ({
    row: r,
    cell: metricCell(r, gamesFor(r.team), metric, useTiming?.get(r.team)),
  }));

  const asc = cells[0]?.cell.asc ?? false;
  cells.sort((a, b) => {
    // Teams with no value are not ranked — they collect at the bottom.
    if (a.cell.missing !== b.cell.missing) return a.cell.missing ? 1 : -1;
    if (a.cell.value !== b.cell.value) return asc ? a.cell.value - b.cell.value : b.cell.value - a.cell.value;
    return a.row.team.localeCompare(b.row.team);
  });

  const values = new Map<string, { display: string; sub: string }>();
  for (const { row, cell } of cells) values.set(row.team, { display: cell.display, sub: cell.sub });

  const meta = PROB_METRICS.find((m) => m.key === metric) ?? PROB_METRICS[0];
  const thinCount = measuredCount
    ? cells.filter((c) => !c.cell.missing && c.row.played < MIN_TIMING_MATCHES).length
    : 0;
  return {
    rows: cells.map(({ row }, i) => ({ ...row, pos: i + 1 })),
    metric: { header: meta.short, full: meta.label, values },
    measuredCount,
    thinCount,
  };
}

// ---------------------------------------------------------------------------
// Insights — a betting "scout": which teams hit a market often, by scope.
// e.g. "teams that hit Home BTTS 60%+ in this league".
// ---------------------------------------------------------------------------

export type InsightMarket = 'btts' | 'o15' | 'o25' | 'o35' | 'sc' | 'cs' | 'win' | 'fts';

export const INSIGHT_MARKETS: { key: InsightMarket; label: string; short: string }[] = [
  { key: 'btts', label: 'Both Teams To Score', short: 'BTTS' },
  { key: 'o15', label: 'Over 1.5 Goals', short: 'Over 1.5' },
  { key: 'o25', label: 'Over 2.5 Goals', short: 'Over 2.5' },
  { key: 'o35', label: 'Over 3.5 Goals', short: 'Over 3.5' },
  { key: 'sc', label: 'Team Scores', short: 'Scores' },
  { key: 'cs', label: 'Clean Sheet', short: 'Clean Sheet' },
  { key: 'win', label: 'Wins', short: 'Wins' },
  { key: 'fts', label: 'Fails To Score', short: 'Fails to Score' },
];

/** Each insight market is one of the probability metrics, under a friendlier name. */
const INSIGHT_METRIC: Record<InsightMarket, ProbMetricKey> = {
  btts: 'bttsY',
  o15: 'o15',
  o25: 'o25',
  o35: 'o35',
  sc: 'sc',
  cs: 'cs',
  win: 'w',
  fts: 'fts',
};

export type InsightRow = { team: string; value: number; played: number };

/** Every team's hit-rate for a market within a scope, ranked high → low. */
export function buildInsights(
  base: StandingRow[],
  opts: { market: InsightMarket; scope: Split },
  feed?: MatchFeed,
): InsightRow[] {
  if (!feed) return [];
  return base
    .map((r) => {
      const { matches } = scopeMatches(matchesFor(feed, r.team), { split: opts.scope });
      return {
        team: r.team,
        value: probValue(matches, INSIGHT_METRIC[opts.market]),
        played: matches.length,
      };
    })
    .sort((a, b) => b.value - a.value || a.team.localeCompare(b.team));
}

// ---------------------------------------------------------------------------
// Captions
// ---------------------------------------------------------------------------

const SPLIT_LABEL: Record<Split, string> = { overall: 'Overall', home: 'Home', away: 'Away' };
const PERIOD_LABEL: Record<Period, string> = { ft: 'Full-time', '1h': '1st Half', '2h': '2nd Half' };
const BAND_LABEL: Record<ColourBand, string> = {
  green: '🟢 Green',
  yellow: '🟡 Yellow',
  red: '🔴 Red',
};

const SPLIT_RULE: Record<Split, string> = {
  overall: 'every match',
  home: 'home matches only',
  away: 'away matches only',
};
const PERIOD_RULE: Record<Period, string> = {
  ft: 'the final score',
  '1h': 'the half-time score',
  '2h': 'the second half (full-time minus half-time)',
};

/** "12 of 14 matches carry a half-time score" — only ever said when it matters. */
function halfTimeNote(period: Period, counted: number, eligible: number): string {
  if (period === 'ft' || eligible === counted) return '';
  return ` ${counted} of ${eligible} matches carry a half-time score; the rest are excluded.`;
}

const NEEDS_RESULTS_NOTE =
  'These tables are counted from the season’s finished results, which are not loaded here.';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildStandingsView(
  base: StandingRow[],
  sel: Selection,
  opts?: { timing?: Map<string, TeamTiming>; feed?: MatchFeed },
): StandingsView {
  if (sel.kind === 'standard') {
    return { rows: base, caption: 'League standings' };
  }

  const feed = opts?.feed;

  if (sel.kind === 'ppg' || sel.kind === 'last6ppg' || sel.kind === 'form') {
    const split = sel.split;
    const period = sel.period;
    const window = sel.kind === 'last6ppg' ? 6 : sel.kind === 'form' ? sel.window : undefined;
    const band = sel.kind === 'ppg' && sel.band !== 'plain' ? sel.band : undefined;
    const windowLabel =
      sel.kind === 'last6ppg' ? 'Last 6' : sel.kind === 'form' ? `Last ${sel.window}` : null;

    const head = band
      ? `${SPLIT_LABEL[split]} · ${PERIOD_LABEL[period]} · vs ${BAND_LABEL[band]}`
      : windowLabel
        ? `${windowLabel} · ${SPLIT_LABEL[split]} · ${PERIOD_LABEL[period]}`
        : `${SPLIT_LABEL[split]} · ${PERIOD_LABEL[period]} · PPG`;

    if (!feed) {
      return { rows: [], caption: head, note: NEEDS_RESULTS_NOTE, needsResults: true };
    }

    const scope: Scope = { split, period, window, vsBand: band };
    const rows = buildScopedRows(base, feed, scope);
    const ranked = sortRank(rows);
    const { counted, eligible } = periodCoverage(base, feed, scope);

    const measure =
      `Counted from ${SPLIT_RULE[split]} using ${PERIOD_RULE[period]}` +
      (window ? `, newest ${window} first` : '') +
      '.' +
      halfTimeNote(period, counted, eligible) +
      completenessNote(base, feed);

    if (band) {
      const { from, to } = bandRange(band, feed.total);
      const members = new Set(
        base.filter((r) => bandFor(feed, r.team) === band).map((r) => r.team),
      );
      return {
        rows: ranked,
        caption: `${head} (${members.size} ${members.size === 1 ? 'team' : 'teams'}, pos ${from}–${to})`,
        note:
          `Every row is that team's own record against the ${BAND_LABEL[band]} teams — ` +
          `band members are measured head-to-head among themselves. ` +
          `Ranked by PPG = points ÷ games played against the band. ${measure}`,
        bandMembers: members,
        metric: ppgColumn(rows),
      };
    }

    return {
      rows: ranked,
      caption: head,
      note: `Ranked by PPG = points ÷ games. ${measure}`,
      metric: ppgColumn(rows),
    };
  }

  // prob
  const meta = PROB_METRICS.find((m) => m.key === sel.metric) ?? PROB_METRICS[0];
  const spec = TIMING_SPECS[sel.metric];

  // The timing metrics read the provider's season stats, not the results, so
  // they still answer without a match feed.
  if (!feed && !spec && !NOT_IN_A_SCORE.has(sel.metric)) {
    return {
      rows: [],
      caption: `${PERIOD_LABEL[sel.period]} · ${meta.label} (${meta.short})`,
      note: NEEDS_RESULTS_NOTE,
      needsResults: true,
    };
  }

  const scope: Scope = { period: sel.period };
  const gamesFor = (team: string) => scopeMatches(matchesFor(feed, team), scope).matches;

  const { rows, metric, measuredCount, thinCount } = buildProbTable(
    base,
    gamesFor,
    sel.metric,
    sel.period,
    opts?.timing,
  );

  // Timing metrics rank by the clock, so spell out which end of it leads.
  // 'first'-edge metrics headline a minute; the late-goal pair headline a rate.
  const order = spec ? (spec.edge === 'first' ? ' — earliest first' : ' — highest first') : '';

  let timingSource: StandingsView['timingSource'];
  let provenance = '';
  let note: string | undefined;

  if (spec || NOT_IN_A_SCORE.has(sel.metric)) {
    // 'partial' still means a measured column — the gap is teams with no value
    // yet, shown as "—" and left unranked.
    timingSource =
      measuredCount === 0
        ? 'unavailable'
        : measuredCount === base.length
          ? 'measured'
          : 'partial';
    const noValue = base.length - measuredCount;
    if (timingSource === 'unavailable') {
      provenance = ' · no recorded timings';
      note = NOT_IN_A_SCORE.has(sel.metric)
        ? 'Which team scored first is not in a final score and the provider does not measure it, so no value is shown.'
        : 'Goal minutes are not in a final score. This metric needs the provider’s recorded timings, and none cover this table.';
    } else {
      provenance =
        ' · recorded timings' +
        (noValue > 0 ? ` · ${noValue} without a value yet` : '') +
        (thinCount > 0 ? ` · ${thinCount} from under ${MIN_TIMING_MATCHES} matches` : '');
      note = "Recorded goal timings from the provider's season stats — nothing estimated.";
    }
  } else if (feed) {
    const { counted, eligible } = periodCoverage(base, feed, scope);
    note =
      `Counted from every finished match using ${PERIOD_RULE[sel.period]}.` +
      halfTimeNote(sel.period, counted, eligible) +
      completenessNote(base, feed);
  }

  return {
    rows,
    metric,
    timingSource,
    note,
    caption: `${PERIOD_LABEL[sel.period]} · ranked by ${meta.label} (${meta.short})${order}${provenance}`,
  };
}
