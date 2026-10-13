/**
 * Section 6 — Death traps.
 * Last-5 win/loss margins, goals scored, and goals conceded.
 * A call needs 3 or more games that keep rising or keep falling.
 * Two games in a row may repeat the same number; three or more equal in a row is Constant.
 */

import { excludeFixture, filterScope, type ResultOutcome, type TeamResult } from '@/utils/teamResults';

export type DeathTrapVenue = 'overall' | 'home' | 'away';
export type DeathTrapPeriod = 'ft' | '1h' | '2h';
export type DeathTrapTrend = 'decline' | 'incline' | 'up_down' | 'constant' | 'none';

export type DeathTrapCall = {
  trend: DeathTrapTrend;
  label: string;
  /** What the direction means for this read, when there is one. */
  reading: string | null;
  /** Chronological values the pattern was read from. */
  sequence: number[];
};

export type DeathTrapSide = {
  teamId: number;
  label: string;
  games: number;
  losses: DeathTrapCall;
  wins: DeathTrapCall;
  scoring: DeathTrapCall;
  conceding: DeathTrapCall;
};

const MIN_PATTERN = 3;

export function deathTrapTrend(values: number[]): DeathTrapTrend {
  if (values.length < MIN_PATTERN) return 'none';
  let up = false;
  let down = false;
  let equalRun = 1;
  let longestEqualRun = 1;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) {
      up = true;
      equalRun = 1;
    } else if (values[i] < values[i - 1]) {
      down = true;
      equalRun = 1;
    } else {
      equalRun += 1;
      longestEqualRun = Math.max(longestEqualRun, equalRun);
    }
  }
  if (longestEqualRun >= MIN_PATTERN) return 'constant';
  if (up && down) return 'up_down';
  if (down) return 'decline';
  if (up) return 'incline';
  return 'none';
}

function periodScore(
  game: TeamResult,
  period: DeathTrapPeriod,
): { gf: number; ga: number } | null {
  if (period === 'ft') return { gf: game.gf, ga: game.ga };
  if (game.htGf == null || game.htGa == null) return null;
  if (period === '1h') return { gf: game.htGf, ga: game.htGa };
  const gf = game.gf - game.htGf;
  const ga = game.ga - game.htGa;
  if (gf < 0 || ga < 0) return null;
  return { gf, ga };
}

function outcomeOf(gf: number, ga: number): ResultOutcome {
  if (gf > ga) return 'W';
  if (gf < ga) return 'L';
  return 'D';
}

type ScoredGame = { gf: number; ga: number; outcome: ResultOutcome };

function chronologicalSample(
  results: TeamResult[],
  venue: DeathTrapVenue,
  period: DeathTrapPeriod,
  excludeFixtureId?: number | null,
): ScoredGame[] {
  const cleaned = excludeFixture(results, excludeFixtureId);
  const scoped = venue === 'overall' ? cleaned : filterScope(cleaned, venue);
  const scored: { unix: number; game: ScoredGame }[] = [];
  for (const game of scoped) {
    const goals = periodScore(game, period);
    if (!goals) continue;
    scored.push({
      unix: game.unix,
      game: { ...goals, outcome: outcomeOf(goals.gf, goals.ga) },
    });
  }
  scored.sort((a, b) => b.unix - a.unix);
  return scored
    .slice(0, 5)
    .map((row) => row.game)
    .reverse();
}

function callFor(
  trend: DeathTrapTrend,
  sequence: number[],
  labels: Record<DeathTrapTrend, string>,
  reading: string | null,
): DeathTrapCall {
  return { trend, label: labels[trend], reading: trend === 'decline' || trend === 'incline' ? reading : null, sequence };
}

const GD_LABEL: Record<DeathTrapTrend, string> = {
  decline: 'Decline goal difference',
  incline: 'Incline goal difference',
  up_down: 'Up down',
  constant: 'Constant',
  none: 'No pattern',
};

const SCORING_LABEL: Record<DeathTrapTrend, string> = {
  decline: 'Decline goal scoring',
  incline: 'Incline goal scoring',
  up_down: 'Up down',
  constant: 'Constant',
  none: 'No pattern',
};

const CONCEDING_LABEL: Record<DeathTrapTrend, string> = {
  decline: 'Decline goal conceding',
  incline: 'Incline goal conceding',
  up_down: 'Up down',
  constant: 'Constant',
  none: 'No pattern',
};

function marginCall(
  games: ScoredGame[],
  side: 'loss' | 'win',
): DeathTrapCall {
  const values = games
    .filter((game) => game.outcome === (side === 'loss' ? 'L' : 'W') || game.outcome === 'D')
    .map((game) => (game.outcome === 'D' ? 0 : Math.abs(game.gf - game.ga)));
  const trend = deathTrapTrend(values);
  const reading =
    side === 'loss'
      ? trend === 'decline'
        ? 'Getting stronger'
        : trend === 'incline'
          ? 'Getting weaker'
          : null
      : trend === 'decline'
        ? 'Getting weaker'
        : trend === 'incline'
          ? 'Getting stronger'
          : null;
  return callFor(trend, values, GD_LABEL, reading);
}

export function deathTrapSide(opts: {
  teamId: number;
  label: string;
  results: TeamResult[];
  venue: DeathTrapVenue;
  period: DeathTrapPeriod;
  excludeFixtureId?: number | null;
}): DeathTrapSide {
  const games = chronologicalSample(opts.results, opts.venue, opts.period, opts.excludeFixtureId);
  const scoring = deathTrapTrend(games.map((game) => game.gf));
  const conceding = deathTrapTrend(games.map((game) => game.ga));
  return {
    teamId: opts.teamId,
    label: opts.label,
    games: games.length,
    losses: marginCall(games, 'loss'),
    wins: marginCall(games, 'win'),
    scoring: callFor(scoring, games.map((game) => game.gf), SCORING_LABEL, null),
    conceding: callFor(conceding, games.map((game) => game.ga), CONCEDING_LABEL, null),
  };
}

export function deathTrapSides(opts: {
  t1Id: number | null;
  t2Id: number | null;
  t1Label: string;
  t2Label: string;
  t1Results: TeamResult[];
  t2Results: TeamResult[];
  venue: DeathTrapVenue;
  period: DeathTrapPeriod;
  excludeFixtureId?: number | null;
}): { left: DeathTrapSide | null; right: DeathTrapSide | null } {
  if (opts.t1Id == null || opts.t2Id == null) return { left: null, right: null };
  return {
    left: deathTrapSide({
      teamId: opts.t1Id,
      label: opts.t1Label,
      results: opts.t1Results,
      venue: opts.venue,
      period: opts.period,
      excludeFixtureId: opts.excludeFixtureId,
    }),
    right: deathTrapSide({
      teamId: opts.t2Id,
      label: opts.t2Label,
      results: opts.t2Results,
      venue: opts.venue,
      period: opts.period,
      excludeFixtureId: opts.excludeFixtureId,
    }),
  };
}
