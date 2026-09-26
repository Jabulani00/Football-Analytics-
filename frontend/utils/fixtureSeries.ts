/**
 * Series Stats (spec §4.6) — T1 vs T2 consecutive-run comparison.
 *
 * A *series* is the current run of matches (newest-first, same competition,
 * same season) where a pattern holds unbroken. It only counts as a series from
 * `MIN_SERIES` games up. The "without" sub-series (#23–29) count the inverse:
 * consecutive games where the team *failed* to reach the stat, so a main series
 * and its "without" counterpart can never both be active.
 *
 * Pure / dependency-free — unit-tested under plain `tsx`.
 */

import type { ComplianceLevel } from '@/types/analytics';
import { filterScope, type ResultOutcome, type TeamResult } from '@/utils/teamResults';

/** Shortest run that counts as a series. */
export const MIN_SERIES = 3;

export type SeriesScope = 'overall' | 'home' | 'away';

export type SeriesGroupId = 'outcome' | 'btts' | 'totals' | 'teamGoals' | 'without';

type SeriesDef = {
  key: string;
  label: string;
  group: SeriesGroupId;
  /** True when this match satisfies the pattern. */
  hit: (r: TeamResult) => boolean;
  /** Count the run where `hit` is false instead (the "without" sub-series). */
  invert?: boolean;
};

const total = (r: TeamResult) => r.gf + r.ga;
const bttsYes = (r: TeamResult) => r.gf > 0 && r.ga > 0;
const over = (line: number) => (r: TeamResult) => total(r) > line;
const under = (line: number) => (r: TeamResult) => total(r) < line;
const scoring = (min: number) => (r: TeamResult) => r.gf >= min;
const conceding = (min: number) => (r: TeamResult) => r.ga >= min;
const won = (r: TeamResult) => r.gf > r.ga;
const drew = (r: TeamResult) => r.gf === r.ga;
const lost = (r: TeamResult) => r.gf < r.ga;

/** The 29 spec series, in display order. */
export const SERIES_DEFS: SeriesDef[] = [
  // 5–7 — outcomes
  { key: 'w', label: 'W', group: 'outcome', hit: won },
  { key: 'd', label: 'D', group: 'outcome', hit: drew },
  { key: 'l', label: 'L', group: 'outcome', hit: lost },

  // 1–4 — both teams / clean sheets
  { key: 'btts_yes', label: 'BTTS — Yes', group: 'btts', hit: bttsYes },
  { key: 'btts_no', label: 'BTTS — No', group: 'btts', hit: (r) => !bttsYes(r) },
  { key: 'cs', label: 'CS (clean sheet)', group: 'btts', hit: (r) => r.ga === 0 },
  { key: 'fts', label: 'FTS (failed to score)', group: 'btts', hit: (r) => r.gf === 0 },

  // 8–16 — match totals
  { key: 'over05', label: 'Over 0.5', group: 'totals', hit: over(0.5) },
  { key: 'over15', label: 'Over 1.5', group: 'totals', hit: over(1.5) },
  { key: 'over25', label: 'Over 2.5', group: 'totals', hit: over(2.5) },
  { key: 'over35', label: 'Over 3.5', group: 'totals', hit: over(3.5) },
  { key: 'over45', label: 'Over 4.5', group: 'totals', hit: over(4.5) },
  { key: 'under05', label: 'Under 0.5', group: 'totals', hit: under(0.5) },
  { key: 'under15', label: 'Under 1.5', group: 'totals', hit: under(1.5) },
  { key: 'under35', label: 'Under 3.5', group: 'totals', hit: under(3.5) },
  { key: 'under45', label: 'Under 4.5', group: 'totals', hit: under(4.5) },

  // 17–22 — this team's goals
  { key: 'scoring_05', label: 'Scoring 0.5 or more', group: 'teamGoals', hit: scoring(1) },
  { key: 'conceding_05', label: 'Conceding 0.5 or more', group: 'teamGoals', hit: conceding(1) },
  { key: 'scoring_15', label: 'Scoring 1.5 or more', group: 'teamGoals', hit: scoring(2) },
  { key: 'conceding_15', label: 'Conceding 1.5 or more', group: 'teamGoals', hit: conceding(2) },
  { key: 'scoring_25', label: 'Scoring 2.5 or more', group: 'teamGoals', hit: scoring(3) },
  { key: 'conceding_25', label: 'Conceding 2.5 or more', group: 'teamGoals', hit: conceding(3) },

  // 23–29 — series without (games without reaching the stat)
  { key: 'without_scoring_15', label: 'Scored 1.5 or more', group: 'without', hit: scoring(2), invert: true },
  { key: 'without_conceding_15', label: 'Conceded 1.5 or more', group: 'without', hit: conceding(2), invert: true },
  { key: 'without_scoring_25', label: 'Scored 2.5 or more', group: 'without', hit: scoring(3), invert: true },
  { key: 'without_conceding_25', label: 'Conceded 2.5 or more', group: 'without', hit: conceding(3), invert: true },
  { key: 'without_w', label: 'W', group: 'without', hit: won, invert: true },
  { key: 'without_d', label: 'D', group: 'without', hit: drew, invert: true },
  { key: 'without_l', label: 'L', group: 'without', hit: lost, invert: true },
];

export const SERIES_GROUPS: { id: SeriesGroupId; label: string }[] = [
  { id: 'outcome', label: 'Outcome' },
  { id: 'btts', label: 'Both teams & clean sheets' },
  { id: 'totals', label: 'Match totals' },
  { id: 'teamGoals', label: 'Team goals' },
  { id: 'without', label: 'Series without' },
];

/** Consecutive run from the newest result until `pred` breaks. */
export function runLength(results: TeamResult[], pred: (r: TeamResult) => boolean): number {
  let n = 0;
  for (const r of results) {
    if (!pred(r)) break;
    n += 1;
  }
  return n;
}

/** 5+ games is a strong series, 3–4 moderate. Shorter is not a series at all. */
export function levelForRun(n: number): ComplianceLevel {
  if (n >= 5) return 'green';
  if (n >= MIN_SERIES) return 'yellow';
  return 'red';
}

/**
 * `run` — part of the current unbroken series (drawn green).
 * `broke` — the game that ended the previous series (drawn red).
 * `before` — older context, shown muted.
 */
export type SeriesGameState = 'run' | 'broke' | 'before';

export type SeriesGame = {
  fixtureId: number;
  state: SeriesGameState;
  /** Score from this team's point of view, e.g. "2-1". */
  score: string;
  outcome: ResultOutcome;
  isHome: boolean;
  opponentName: string;
};

export type TeamSeries = {
  /** Length of the current unbroken run. */
  run: number;
  /** Chronological (oldest → newest), so the break sits left of the run. */
  games: SeriesGame[];
  /** The run reaches the threshold, so it counts as a series. */
  active: boolean;
  /** No earlier miss on record — the run covers every game played. */
  runFromStart: boolean;
  /** Games available after scoping. */
  sample: number;
};

export type SeriesRow = {
  key: string;
  label: string;
  group: SeriesGroupId;
  home: TeamSeries;
  away: TeamSeries;
};

export type SeriesGroup = {
  id: SeriesGroupId;
  label: string;
  rows: SeriesRow[];
};

/** How many games before the break to keep as context. */
const CONTEXT_GAMES = 2;

function buildTeamSeries(
  def: SeriesDef,
  results: TeamResult[],
  minLength: number,
): TeamSeries {
  const pred = def.invert ? (r: TeamResult) => !def.hit(r) : def.hit;
  const run = runLength(results, pred);
  const runFromStart = run === results.length;
  // Newest-first slice: the run, the game that broke it, then a little context.
  const end = Math.min(results.length, run + 1 + (runFromStart ? 0 : CONTEXT_GAMES));

  const games: SeriesGame[] = [];
  for (let i = end - 1; i >= 0; i -= 1) {
    const r = results[i];
    games.push({
      fixtureId: r.fixtureId,
      state: i < run ? 'run' : i === run ? 'broke' : 'before',
      score: `${r.gf}-${r.ga}`,
      outcome: r.outcome,
      isHome: r.isHome,
      opponentName: r.opponentName,
    });
  }

  return { run, games, active: run >= minLength, runFromStart, sample: results.length };
}

/**
 * Build the grouped T1 vs T2 series comparison. A stat is dropped unless at
 * least one side has a run of `minLength`; the other side still reports its
 * (shorter) run so the comparison stays readable.
 */
export function buildFixtureSeries(opts: {
  homeResults: TeamResult[];
  awayResults: TeamResult[];
  scope?: SeriesScope;
  minLength?: number;
}): { groups: SeriesGroup[]; homeSample: number; awaySample: number } {
  const scope = opts.scope ?? 'overall';
  const minLength = opts.minLength ?? MIN_SERIES;
  const homeR = filterScope(opts.homeResults, scope);
  const awayR = filterScope(opts.awayResults, scope);

  const byGroup = new Map<SeriesGroupId, SeriesRow[]>();

  for (const def of SERIES_DEFS) {
    const home = buildTeamSeries(def, homeR, minLength);
    const away = buildTeamSeries(def, awayR, minLength);
    if (!home.active && !away.active) continue;

    const rows = byGroup.get(def.group) ?? [];
    rows.push({ key: def.key, label: def.label, group: def.group, home, away });
    byGroup.set(def.group, rows);
  }

  const groups = SERIES_GROUPS.filter((g) => (byGroup.get(g.id)?.length ?? 0) > 0).map((g) => ({
    id: g.id,
    label: g.label,
    rows: byGroup.get(g.id) as SeriesRow[],
  }));

  return { groups, homeSample: homeR.length, awaySample: awayR.length };
}
