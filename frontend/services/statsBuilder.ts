/**
 * Real-time stats-table builder — the OddAlerts API is the database.
 *
 * Instead of precomputing 72 tables into SQLite, this derives the stat-table
 * *representation* on the fly from finished fixtures (`/fixtures/between`). Feed
 * it results, get back the same `TeamStatsExport` shape the app already consumes
 * (`data/teamStatsLoader.ts`) — a drop-in, computed live, no database.
 *
 * Tables produced: the full 72 — 5 base families (ordinary/ppg/series/ft_only/
 * league_avg) × period (FT/HT/2H) × scope (overall/home/away) = 45, plus
 * last-10/8/6 ordinary windows × period × scope = 27. Named exactly like the
 * SQLite schema (`ordinary_ft_overall`, `series_ht_away`, `last10_2h_home`, …).
 *
 * Pure + dependency-injected: no React Native imports, so it unit-tests under
 * plain Node/tsx and plugs into the live client via `buildLeagueStatsLive`.
 */

import type { TeamStatRow, TeamStatsExport } from '@/types/data';
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
};

type Period = (typeof PERIODS)[number];

const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN', 'FT_PEN', 'AWD', 'AWARDED', 'WO']);

/** The 34 ordinary stats (order matches backend/schema.py ORDINARY_STATS). */
const ORDINARY_STATS = [
  'sc_pct', 'conc_pct', 'sc_avg', 'conc_avg', 'btts_yes', 'btts_no', 'cs_pct',
  'avg_goals', 'fts_pct', 'w_pct', 'd_pct', 'l_pct', 'over05', 'over15',
  'over25', 'over35', 'over45', 'under05', 'under15', 'under25', 'under35',
  'under45', 'scoring_05', 'conceding_05', 'scoring_15', 'conceding_15',
  'scoring_25', 'conceding_25', 'scored_first', 'handicap', 'early_goals_1h',
  'early_goals_2h', 'early_goals_conceded', 'late_goals',
] as const;

/** Average-valued stats (not 0–100), so no traffic-light signal. */
const AVERAGE_STATS = new Set(['sc_avg', 'conc_avg', 'avg_goals']);

/**
 * Stats that need per-goal timing/order, which `/fixtures/between` does NOT
 * provide (see docs/ODDALERTS_API_GAPS.md). Emitted as null, honestly.
 */
const NOT_DERIVABLE = new Set([
  'scored_first', 'handicap', 'early_goals_1h', 'early_goals_2h',
  'early_goals_conceded', 'late_goals',
]);

// ---- Per-team match record --------------------------------------------------
type TeamMatch = {
  isHome: boolean;
  unix: number;
  gfFt: number; gaFt: number; // full-time goals for / against this team
  gfHt: number; gaHt: number; // first-half
};

/** Goals for/against this team in the requested period. */
function periodGoals(m: TeamMatch, period: Period): { gf: number; ga: number } {
  if (period === 'ft') return { gf: m.gfFt, ga: m.gaFt };
  if (period === 'ht') return { gf: m.gfHt, ga: m.gaHt };
  return { gf: m.gfFt - m.gfHt, ga: m.gaFt - m.gaHt }; // 2h = FT - HT
}

function parseHtScore(ht: string | null | undefined): [number, number] | null {
  if (!ht) return null;
  const parts = ht.split('-').map((s) => Number.parseInt(s.trim(), 10));
  if (parts.length !== 2 || parts.some(Number.isNaN)) return null;
  return [parts[0], parts[1]];
}

function isFinished(fx: RawFixture): boolean {
  return (
    FINISHED_STATUSES.has(fx.status) &&
    fx.home_goals != null &&
    fx.away_goals != null
  );
}

// ---- Signal (matches backend/schema.py stat_signal) -------------------------
function statSignal(value: number): 'green' | 'yellow' | 'red' {
  if (value >= 65) return 'green';
  if (value >= 45) return 'yellow';
  return 'red';
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ---- Core stat computation for one team/period/window -----------------------
function computeStats(matches: TeamMatch[], period: Period): {
  values: Record<string, number | null>;
  sampleSize: number;
} {
  const n = matches.length;
  const values: Record<string, number | null> = {};
  for (const key of ORDINARY_STATS) values[key] = null;
  if (n === 0) return { values, sampleSize: 0 };

  const goals = matches.map((m) => periodGoals(m, period));
  const pct = (pred: (g: { gf: number; ga: number }) => boolean) =>
    Math.round((100 * goals.filter(pred).length) / n);
  const mean = (sel: (g: { gf: number; ga: number }) => number) =>
    round1(goals.reduce((s, g) => s + sel(g), 0) / n);

  values.sc_pct = pct((g) => g.gf > 0);
  values.conc_pct = pct((g) => g.ga > 0);
  values.sc_avg = mean((g) => g.gf);
  values.conc_avg = mean((g) => g.ga);
  values.avg_goals = mean((g) => g.gf + g.ga);
  values.btts_yes = pct((g) => g.gf > 0 && g.ga > 0);
  values.btts_no = 100 - (values.btts_yes as number);
  values.cs_pct = pct((g) => g.ga === 0);
  values.fts_pct = pct((g) => g.gf === 0);
  values.w_pct = pct((g) => g.gf > g.ga);
  values.d_pct = pct((g) => g.gf === g.ga);
  values.l_pct = pct((g) => g.gf < g.ga);

  const over = (line: number) => pct((g) => g.gf + g.ga > line);
  values.over05 = over(0.5); values.under05 = 100 - (values.over05 as number);
  values.over15 = over(1.5); values.under15 = 100 - (values.over15 as number);
  values.over25 = over(2.5); values.under25 = 100 - (values.over25 as number);
  values.over35 = over(3.5); values.under35 = 100 - (values.over35 as number);
  values.over45 = over(4.5); values.under45 = 100 - (values.over45 as number);

  values.scoring_05 = pct((g) => g.gf >= 1);
  values.scoring_15 = pct((g) => g.gf >= 2);
  values.scoring_25 = pct((g) => g.gf >= 3);
  values.conceding_05 = pct((g) => g.ga >= 1);
  values.conceding_15 = pct((g) => g.ga >= 2);
  values.conceding_25 = pct((g) => g.ga >= 3);

  // NOT_DERIVABLE stats stay null (need per-goal timing not in results).
  return { values, sampleSize: n };
}

// ---- Additional stat families (ppg / series / ft_only / league_avg) --------
/** Streak keys (current consecutive run lengths — raw counts, no signal). */
export const SERIES_STATS = [
  'win_streak', 'unbeaten_streak', 'loss_streak', 'btts_streak',
  'over25_streak', 'cs_streak', 'fts_streak', 'scoring_streak',
] as const;

/** Full-time-only outcome patterns (percentages). */
export const FT_ONLY_STATS = [
  'won_both_halves', 'win_to_nil', 'scored_both_halves', 'conceded_both_halves', 'led_ht',
] as const;

/** Points-per-game family adds `ppg`/`avg_pts` on top of the ordinary stats. */
export const PPG_STATS = ['ppg', 'avg_pts'] as const;

const RAW_KEYS = new Set<string>([...SERIES_STATS, ...PPG_STATS, ...AVERAGE_STATS]);

/** Current consecutive run of matches (newest-first) satisfying `pred`. */
function streak(matches: TeamMatch[], period: Period, pred: (g: { gf: number; ga: number }) => boolean): number {
  let n = 0;
  for (const m of matches) {
    if (pred(periodGoals(m, period))) n += 1;
    else break;
  }
  return n;
}

function computeSeries(matches: TeamMatch[], period: Period): Record<string, number> {
  const s = (p: (g: { gf: number; ga: number }) => boolean) => streak(matches, period, p);
  return {
    win_streak: s((g) => g.gf > g.ga),
    unbeaten_streak: s((g) => g.gf >= g.ga),
    loss_streak: s((g) => g.gf < g.ga),
    btts_streak: s((g) => g.gf > 0 && g.ga > 0),
    over25_streak: s((g) => g.gf + g.ga > 2),
    cs_streak: s((g) => g.ga === 0),
    fts_streak: s((g) => g.gf === 0),
    scoring_streak: s((g) => g.gf > 0),
  };
}

function computePpg(matches: TeamMatch[], period: Period): number {
  if (matches.length === 0) return 0;
  let pts = 0;
  for (const m of matches) {
    const g = periodGoals(m, period);
    pts += g.gf > g.ga ? 3 : g.gf === g.ga ? 1 : 0;
  }
  return Math.round((pts / matches.length) * 100) / 100;
}

function computeFtOnly(matches: TeamMatch[]): Record<string, number | null> {
  const n = matches.length;
  if (n === 0) {
    return Object.fromEntries(FT_ONLY_STATS.map((k) => [k, null]));
  }
  const secondHalf = (m: TeamMatch) => ({ gf: m.gfFt - m.gfHt, ga: m.gaFt - m.gaHt });
  const pct = (p: (m: TeamMatch) => boolean) => Math.round((100 * matches.filter(p).length) / n);
  return {
    won_both_halves: pct((m) => m.gfHt > m.gaHt && secondHalf(m).gf > secondHalf(m).ga),
    win_to_nil: pct((m) => m.gfFt > m.gaFt && m.gaFt === 0),
    scored_both_halves: pct((m) => m.gfHt > 0 && secondHalf(m).gf > 0),
    conceded_both_halves: pct((m) => m.gaHt > 0 && secondHalf(m).ga > 0),
    led_ht: pct((m) => m.gfHt > m.gaHt),
  };
}

// ---- Build the representation ------------------------------------------------
type TeamKey = string; // `${leagueId}::${teamName}`

export type BuildOptions = {
  fixtures: RawFixture[];
  season?: string;
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

/**
 * Build the full 72-table `TeamStatsExport` live from finished fixtures:
 * 5 base families (ordinary/ppg/series/ft_only/league_avg) × period × scope (45)
 * + last-10/8/6 ordinary windows × period × scope (27).
 */
export function buildStatsTables(opts: BuildOptions): TeamStatsExport {
  const leagueKey = opts.leagueKey ?? ((fx) => String(fx.competition_id));
  const season = opts.season ?? '';

  // 1) Collect each team's finished matches.
  const teamMatches = new Map<TeamKey, { name: string; league: string; matches: TeamMatch[] }>();
  const add = (name: string, league: string, m: TeamMatch) => {
    const key = `${league}::${name}`;
    let entry = teamMatches.get(key);
    if (!entry) { entry = { name, league, matches: [] }; teamMatches.set(key, entry); }
    entry.matches.push(m);
  };

  for (const fx of opts.fixtures) {
    if (!isFinished(fx)) continue;
    const league = leagueKey(fx);
    const hg = fx.home_goals as number;
    const ag = fx.away_goals as number;
    const ht = parseHtScore(fx.ht_score);
    const [hHt, aHt] = ht ?? [0, 0]; // HT unknown → treat as 0-0 (2H then carries all goals)
    add(fx.home_name, league, { isHome: true, unix: fx.unix, gfFt: hg, gaFt: ag, gfHt: hHt, gaHt: aHt });
    add(fx.away_name, league, { isHome: false, unix: fx.unix, gfFt: ag, gaFt: hg, gfHt: aHt, gaHt: hHt });
  }

  const tables: Record<string, TeamStatRow[]> = {};
  const ensure = (t: string) => (tables[t] ??= []);

  const ordinaryValues = (windowed: TeamMatch[], period: Period): Record<string, number | null> => {
    const { values } = computeStats(windowed, period);
    return values;
  };

  // 2) Per team: base families (season window) + last-N ordinary windows.
  for (const { name, league, matches } of teamMatches.values()) {
    const sorted = [...matches].sort((a, b) => b.unix - a.unix); // newest first
    for (const scope of SCOPES) {
      const scoped = sorted.filter(
        (m) => scope === 'overall' || (scope === 'home' ? m.isHome : !m.isHome),
      );
      for (const period of PERIODS) {
        const ord = ordinaryValues(scoped, period);
        const sample = scoped.length;
        // ordinary
        ensure(`ordinary_${period}_${scope}`).push(makeRow(name, league, season, ord, sample));
        // ppg = ordinary + points-per-game
        const ppg = computePpg(scoped, period);
        ensure(`ppg_${period}_${scope}`).push(
          makeRow(name, league, season, { ppg, avg_pts: ppg, ...ord }, sample),
        );
        // series = streaks
        ensure(`series_${period}_${scope}`).push(
          makeRow(name, league, season, computeSeries(scoped, period), sample),
        );
        // ft_only = ordinary + full-time outcome patterns
        ensure(`ft_only_${period}_${scope}`).push(
          makeRow(name, league, season, { ...computeFtOnly(scoped), ...ord }, sample),
        );
        // last-N ordinary windows
        for (const [winPrefix, winSize] of Object.entries(WINDOWS)) {
          if (winPrefix === 'ordinary') continue; // season already emitted above
          const windowed = scoped.slice(0, winSize);
          ensure(`${winPrefix}_${period}_${scope}`).push(
            makeRow(name, league, season, ordinaryValues(windowed, period), windowed.length),
          );
        }
      }
    }
  }

  // 3) league_avg_* = one "League" row per period/scope, averaging team ordinary rows.
  for (const scope of SCOPES) {
    for (const period of PERIODS) {
      const rows = tables[`ordinary_${period}_${scope}`] ?? [];
      const avg: Record<string, number | null> = {};
      for (const key of ORDINARY_STATS) {
        if (NOT_DERIVABLE.has(key)) { avg[key] = null; continue; }
        const vals = rows
          .map((r) => r[key])
          .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
        avg[key] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
      }
      ensure(`league_avg_${period}_${scope}`).push(makeRow('League', String(scope), season, avg, rows.length));
    }
  }

  return {
    meta: {
      tables: Object.keys(tables).length,
      statsPerTable: ORDINARY_STATS.length,
      exported_at: new Date().toISOString(),
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
    maxPages?: number;
  },
): Promise<TeamStatsExport> {
  const fixtures = await fetcher({
    fromUnix: opts.fromUnix,
    toUnix: opts.toUnix,
    competitions: String(opts.competitionId),
    maxPages: opts.maxPages ?? 6,
  });
  return buildStatsTables({
    fixtures,
    season: opts.season,
    leagueKey: () => String(opts.competitionId),
  });
}

// Exposed for tests / reuse.
export const __internals = { computeStats, periodGoals, parseHtScore, statSignal, ORDINARY_STATS };
