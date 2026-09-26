/**
 * Recency Failure Signal — RFS (spec §4.8, Tables 3 & 4).
 *
 * Two streams, both keyed on the most recent finished game being the *opposite*
 * of what the team normally does:
 *
 * - Table 3 (ordinary + RFS) — the season rate for a stat is in the green band,
 *   but the last game did not deliver it. "Failed to do the usual."
 * - Table 4 (series + RFS) — a run of `MIN_SERIES`+ was alive going *into* the
 *   last game and the last game ended it. "Failed to continue the usual."
 *
 * Pure / dependency-free — unit-tested under plain `tsx`.
 */

import type { ComplianceLevel } from '@/types/analytics';
import {
  levelForRun,
  MIN_SERIES,
  runLength,
  SERIES_DEFS,
  type SeriesGroupId,
} from '@/utils/fixtureSeries';
import { filterScope, type ResultOutcome, type TeamResult } from '@/utils/teamResults';

/** Season rate that makes a behaviour "usual" — the green band of `statSignal`. */
export const USUAL_MIN_RATE = 65;

/** Fewer scoped games than this and a season rate is not worth calling usual. */
export const MIN_RFS_SAMPLE = 5;

/** Recent games kept as context on an ordinary RFS row. */
const RECENT_GAMES = 6;

export type RfsScope = 'overall' | 'home' | 'away';
export type RfsSide = 'home' | 'away';

/**
 * `hit` — the stat held in this game (drawn green).
 * `failed` — the last game, which went against the usual (drawn red).
 * `miss` — an earlier game that did not hold, shown muted.
 */
export type RfsGameState = 'hit' | 'failed' | 'miss';

export type RfsGame = {
  fixtureId: number;
  state: RfsGameState;
  /** Score from this team's point of view, e.g. "0-2". */
  score: string;
  outcome: ResultOutcome;
  isHome: boolean;
  opponentName: string;
};

type OrdinaryDef = {
  key: string;
  /** Stat name as the Stats tables show it. */
  label: string;
  /** Reads as "Usually {usual}". */
  usual: string;
  /** Reads as "{failed} in 0-2 at Newcastle". */
  failed: string;
  /** True when this match delivered the stat. */
  hit: (r: TeamResult) => boolean;
  /** Same predicate as another stat — reported on that row instead of its own. */
  aliasOf?: string;
};

const total = (r: TeamResult) => r.gf + r.ga;
const bttsYes = (r: TeamResult) => r.gf > 0 && r.ga > 0;
const over = (line: number) => (r: TeamResult) => total(r) > line;
const under = (line: number) => (r: TeamResult) => total(r) < line;
const scoring = (min: number) => (r: TeamResult) => r.gf >= min;
const conceding = (min: number) => (r: TeamResult) => r.ga >= min;

/**
 * The ordinary stats an RFS can be read from: §4.1's 34 minus the six that need
 * per-goal timing (`NOT_DERIVABLE` in services/statsBuilder) and the three
 * averages, which carry no traffic light to call a "usual" from.
 */
export const RFS_ORDINARY_DEFS: OrdinaryDef[] = [
  { key: 'sc_pct', label: 'SC%', usual: 'scores', failed: 'drew a blank', hit: scoring(1) },
  { key: 'conc_pct', label: 'Conc%', usual: 'concedes', failed: 'kept a clean sheet', hit: conceding(1) },

  { key: 'btts_yes', label: 'BTTS — Yes', usual: 'plays in a BTTS game', failed: 'only one side scored', hit: bttsYes },
  { key: 'btts_no', label: 'BTTS — No', usual: 'keeps BTTS off', failed: 'both teams scored', hit: (r) => !bttsYes(r) },
  { key: 'cs_pct', label: 'CS (clean sheet)', usual: 'keeps a clean sheet', failed: 'conceded', hit: (r) => r.ga === 0 },
  { key: 'fts_pct', label: 'FTS (failed to score)', usual: 'fails to score', failed: 'scored', hit: (r) => r.gf === 0 },

  { key: 'w_pct', label: 'W', usual: 'wins', failed: 'did not win', hit: (r) => r.gf > r.ga },
  { key: 'd_pct', label: 'D', usual: 'draws', failed: 'did not draw', hit: (r) => r.gf === r.ga },
  { key: 'l_pct', label: 'L', usual: 'loses', failed: 'avoided defeat', hit: (r) => r.gf < r.ga },

  { key: 'over05', label: 'Over 0.5', usual: 'sees a goal', failed: 'ended goalless', hit: over(0.5) },
  { key: 'over15', label: 'Over 1.5', usual: 'goes over 1.5', failed: 'stayed under 1.5', hit: over(1.5) },
  { key: 'over25', label: 'Over 2.5', usual: 'goes over 2.5', failed: 'stayed under 2.5', hit: over(2.5) },
  { key: 'over35', label: 'Over 3.5', usual: 'goes over 3.5', failed: 'stayed under 3.5', hit: over(3.5) },
  { key: 'over45', label: 'Over 4.5', usual: 'goes over 4.5', failed: 'stayed under 4.5', hit: over(4.5) },
  { key: 'under05', label: 'Under 0.5', usual: 'stays goalless', failed: 'saw a goal', hit: under(0.5) },
  { key: 'under15', label: 'Under 1.5', usual: 'stays under 1.5', failed: 'went over 1.5', hit: under(1.5) },
  { key: 'under25', label: 'Under 2.5', usual: 'stays under 2.5', failed: 'went over 2.5', hit: under(2.5) },
  { key: 'under35', label: 'Under 3.5', usual: 'stays under 3.5', failed: 'went over 3.5', hit: under(3.5) },
  { key: 'under45', label: 'Under 4.5', usual: 'stays under 4.5', failed: 'went over 4.5', hit: under(4.5) },

  { key: 'scoring_05', label: 'Scoring 0.5 or more', usual: 'scores at least once', failed: 'failed to score', hit: scoring(1), aliasOf: 'sc_pct' },
  { key: 'conceding_05', label: 'Conceding 0.5 or more', usual: 'concedes at least once', failed: 'conceded none', hit: conceding(1), aliasOf: 'conc_pct' },
  { key: 'scoring_15', label: 'Scoring 1.5 or more', usual: 'scores 2 or more', failed: 'scored fewer than 2', hit: scoring(2) },
  { key: 'conceding_15', label: 'Conceding 1.5 or more', usual: 'concedes 2 or more', failed: 'conceded fewer than 2', hit: conceding(2) },
  { key: 'scoring_25', label: 'Scoring 2.5 or more', usual: 'scores 3 or more', failed: 'scored fewer than 3', hit: scoring(3) },
  { key: 'conceding_25', label: 'Conceding 2.5 or more', usual: 'concedes 3 or more', failed: 'conceded fewer than 3', hit: conceding(3) },
];

/** Mirrors `statSignal` in services/statsBuilder — the app's traffic lights. */
export function levelForRate(rate: number): ComplianceLevel {
  if (rate >= 65) return 'green';
  if (rate >= 45) return 'yellow';
  return 'red';
}

type RfsRowBase = {
  key: string;
  label: string;
  side: RfsSide;
  /** The game that went against the usual. */
  last: RfsGame;
  /** Chronological (oldest → newest), so the failure sits on the right. */
  games: RfsGame[];
  /** Games available after scoping. */
  sample: number;
};

export type RfsOrdinaryRow = RfsRowBase & {
  /** Stats sharing this row's predicate, e.g. "Scoring 0.5 or more" on SC%. */
  alsoLabels: string[];
  usual: string;
  failed: string;
  /** Season rate for the stat, over the scoped sample. */
  rate: number;
  /** How strong the usual is (green = rock solid). */
  level: ComplianceLevel;
  hits: number;
};

export type RfsSeriesRow = RfsRowBase & {
  group: SeriesGroupId;
  /** The run counted games *without* the stat. */
  without: boolean;
  /** Length of the run that was alive going into the last game. */
  run: number;
  level: ComplianceLevel;
  /** The broken run covered every earlier game on record. */
  runFromStart: boolean;
};

const ORDINARY_ORDER = new Map(RFS_ORDINARY_DEFS.map((d, i) => [d.key, i]));
const SERIES_ORDER = new Map(SERIES_DEFS.map((d, i) => [d.key, i]));

function game(r: TeamResult, state: RfsGameState): RfsGame {
  return {
    fixtureId: r.fixtureId,
    state,
    score: `${r.gf}-${r.ga}`,
    outcome: r.outcome,
    isHome: r.isHome,
    opponentName: r.opponentName,
  };
}

function ordinaryRows(
  results: TeamResult[],
  side: RfsSide,
  minRate: number,
  minSample: number,
): RfsOrdinaryRow[] {
  if (results.length < minSample) return [];
  const newest = results[0];
  const window = results.slice(0, RECENT_GAMES);
  const byKey = new Map<string, RfsOrdinaryRow>();
  const rows: RfsOrdinaryRow[] = [];

  for (const def of RFS_ORDINARY_DEFS) {
    if (def.hit(newest)) continue; // last game did the usual — no signal
    const hits = results.filter(def.hit).length;
    const rate = Math.round((100 * hits) / results.length);
    if (rate < minRate) continue;

    const alias = def.aliasOf ? byKey.get(def.aliasOf) : undefined;
    if (alias) {
      alias.alsoLabels.push(def.label);
      continue;
    }

    const games: RfsGame[] = [];
    for (let i = window.length - 1; i >= 0; i -= 1) {
      games.push(game(window[i], i === 0 ? 'failed' : def.hit(window[i]) ? 'hit' : 'miss'));
    }

    const row: RfsOrdinaryRow = {
      key: def.key,
      label: def.label,
      alsoLabels: [],
      side,
      usual: def.usual,
      failed: def.failed,
      rate,
      level: levelForRate(rate),
      hits,
      last: game(newest, 'failed'),
      games,
      sample: results.length,
    };
    byKey.set(def.key, row);
    rows.push(row);
  }

  return rows;
}

function seriesRows(results: TeamResult[], side: RfsSide, minLength: number): RfsSeriesRow[] {
  // The run has to fit before the last game, so a break needs minLength + 1.
  if (results.length < minLength + 1) return [];
  const newest = results[0];
  const prior = results.slice(1);
  const rows: RfsSeriesRow[] = [];

  for (const def of SERIES_DEFS) {
    const pred = def.invert ? (r: TeamResult) => !def.hit(r) : def.hit;
    if (pred(newest)) continue; // run is still alive, nothing was broken
    const run = runLength(prior, pred);
    if (run < minLength) continue;

    const games: RfsGame[] = [];
    for (let i = run - 1; i >= 0; i -= 1) games.push(game(prior[i], 'hit'));
    games.push(game(newest, 'failed'));

    rows.push({
      key: def.key,
      label: def.label,
      side,
      group: def.group,
      without: def.invert === true,
      run,
      level: levelForRun(run),
      runFromStart: run === prior.length,
      last: game(newest, 'failed'),
      games,
      sample: results.length,
    });
  }

  return rows;
}

function bySide(a: RfsSide, b: RfsSide): number {
  return a === b ? 0 : a === 'home' ? -1 : 1;
}

/**
 * Both RFS streams for a fixture, strongest signal first. Rows are flat rather
 * than grouped: an RFS is a shortlist of alerts, not a catalogue.
 */
export function buildFixtureRfs(opts: {
  homeResults: TeamResult[];
  awayResults: TeamResult[];
  scope?: RfsScope;
  /** Season rate that counts as usual (default `USUAL_MIN_RATE`). */
  minRate?: number;
  minSample?: number;
  /** Shortest broken run that counts (default `MIN_SERIES`). */
  minLength?: number;
}): {
  ordinary: RfsOrdinaryRow[];
  series: RfsSeriesRow[];
  homeSample: number;
  awaySample: number;
} {
  const scope = opts.scope ?? 'overall';
  const minRate = opts.minRate ?? USUAL_MIN_RATE;
  const minSample = opts.minSample ?? MIN_RFS_SAMPLE;
  const minLength = opts.minLength ?? MIN_SERIES;
  const homeR = filterScope(opts.homeResults, scope);
  const awayR = filterScope(opts.awayResults, scope);

  const ordinary = [
    ...ordinaryRows(homeR, 'home', minRate, minSample),
    ...ordinaryRows(awayR, 'away', minRate, minSample),
  ].sort(
    (a, b) =>
      b.rate - a.rate ||
      (ORDINARY_ORDER.get(a.key) ?? 0) - (ORDINARY_ORDER.get(b.key) ?? 0) ||
      bySide(a.side, b.side),
  );

  const series = [
    ...seriesRows(homeR, 'home', minLength),
    ...seriesRows(awayR, 'away', minLength),
  ].sort(
    (a, b) =>
      b.run - a.run ||
      (SERIES_ORDER.get(a.key) ?? 0) - (SERIES_ORDER.get(b.key) ?? 0) ||
      bySide(a.side, b.side),
  );

  return { ordinary, series, homeSample: homeR.length, awaySample: awayR.length };
}
