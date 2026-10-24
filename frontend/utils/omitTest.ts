/**
 * Omit Test — does a small share of a team's matches distort its average
 * goals-scored-per-game? For each team we take the goals it SCORED in every
 * completed league match, then temporarily omit the k highest- and k lowest-
 * scoring matches (k ≈ a configurable % of games) and recompute the average.
 *
 * Pure: no network, no React. Nothing mutates the source matches.
 */
import type { TeamStatsExport } from '@/types/data';
import { liveRowsToDisplay } from '@/utils/statsTableAdapter';

export type OmitMatch = {
  /** Display label, e.g. "Team 2-1 Opponent". */
  label: string;
  /** Goals the team SCORED in this match (never conceded). */
  goals: number;
  unix: number;
};

export type OmitDirection = 'up' | 'down' | 'unchanged';

export type OmitScenario = {
  /** Which extreme was removed. */
  kind: 'highest' | 'lowest';
  omitted: OmitMatch[];
  omittedCount: number;
  omittedPct: number;
  remainingGoals: number;
  remainingMatches: number;
  newAverage: number;
  /** newAverage − originalAverage. */
  difference: number;
  /** % change vs the original average; null when the original average is 0. */
  percentChange: number | null;
  direction: OmitDirection;
};

export type OmitTeamResult = {
  team: string;
  teamId: number | null;
  competition: string;
  matchesPlayed: number;
  totalGoals: number;
  originalAverage: number;
  omitPct: number;
  /** Matches removed in each scenario (same k for highest and lowest). */
  omittedCount: number;
  scenarios: OmitScenario[];
  /** Largest absolute % change across scenarios; null when original avg is 0. */
  maxPercentChange: number | null;
  /** SENSITIVE when maxPercentChange ≥ the threshold, else STABLE. */
  sensitivity: 'sensitive' | 'stable';
};

export const DEFAULT_OMIT_PCT = 20;
export const DEFAULT_SENSITIVITY_PCT = 10;
/** Averages within this many goals are treated as unchanged. */
const EPSILON = 0.005;

function sum(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0);
}

/**
 * How many matches to omit for a given percentage: rounded to the nearest whole
 * match, at least 1 when the percentage is positive, and never all of them (so
 * an average can still be formed from the remainder).
 */
export function omitCount(matches: number, omitPct: number): number {
  if (matches < 2 || omitPct <= 0) return 0;
  const k = Math.max(1, Math.round((matches * omitPct) / 100));
  return Math.min(k, matches - 1);
}

function scenario(
  kind: 'highest' | 'lowest',
  all: OmitMatch[],
  omitted: OmitMatch[],
  originalAverage: number,
  matchesPlayed: number,
): OmitScenario {
  const omittedSet = new Set(omitted);
  const remaining = all.filter((m) => !omittedSet.has(m));
  const remainingGoals = sum(remaining.map((m) => m.goals));
  const remainingMatches = remaining.length;
  const newAverage = remainingMatches > 0 ? remainingGoals / remainingMatches : 0;
  const difference = newAverage - originalAverage;
  const percentChange = originalAverage === 0 ? null : (difference / originalAverage) * 100;
  const direction: OmitDirection = difference > EPSILON ? 'up' : difference < -EPSILON ? 'down' : 'unchanged';
  return {
    kind,
    omitted,
    omittedCount: omitted.length,
    omittedPct: matchesPlayed > 0 ? (omitted.length / matchesPlayed) * 100 : 0,
    remainingGoals,
    remainingMatches,
    newAverage,
    difference,
    percentChange,
    direction,
  };
}

/** Run the Omit Test for one team's scored-goals-per-match series. */
export function buildTeamOmitTest(
  team: string,
  teamId: number | null,
  competition: string,
  matches: OmitMatch[],
  opts: { omitPct?: number; sensitivityPct?: number } = {},
): OmitTeamResult {
  const omitPct = opts.omitPct ?? DEFAULT_OMIT_PCT;
  const sensitivityPct = opts.sensitivityPct ?? DEFAULT_SENSITIVITY_PCT;
  const matchesPlayed = matches.length;
  const totalGoals = sum(matches.map((m) => m.goals));
  const originalAverage = matchesPlayed > 0 ? totalGoals / matchesPlayed : 0;
  const k = omitCount(matchesPlayed, omitPct);

  const scenarios: OmitScenario[] = [];
  if (k > 0) {
    // Tie-break by kickoff so equal-score matches omit deterministically.
    const byGoalsDesc = [...matches].sort((a, b) => b.goals - a.goals || b.unix - a.unix);
    const byGoalsAsc = [...matches].sort((a, b) => a.goals - b.goals || a.unix - b.unix);
    scenarios.push(scenario('highest', matches, byGoalsDesc.slice(0, k), originalAverage, matchesPlayed));
    scenarios.push(scenario('lowest', matches, byGoalsAsc.slice(0, k), originalAverage, matchesPlayed));
  }

  const pctChanges = scenarios.map((s) => s.percentChange).filter((p): p is number => p != null);
  const maxPercentChange = pctChanges.length ? Math.max(...pctChanges.map(Math.abs)) : null;
  const sensitivity: 'sensitive' | 'stable' =
    maxPercentChange != null && maxPercentChange >= sensitivityPct ? 'sensitive' : 'stable';

  return {
    team,
    teamId,
    competition,
    matchesPlayed,
    totalGoals,
    originalAverage,
    omitPct,
    omittedCount: k,
    scenarios,
    maxPercentChange,
    sensitivity,
  };
}

/** Sort: most scoring-average distortion first (by max % change), then name. */
export function sortOmitResults(rows: OmitTeamResult[]): OmitTeamResult[] {
  return [...rows].sort((a, b) => (b.maxPercentChange ?? -1) - (a.maxPercentChange ?? -1) || a.team.localeCompare(b.team));
}

/**
 * Run the Omit Test for every team in one competition's live export, reading
 * each team's completed full-time matches and the goals it scored (ftFor) from
 * the all-games ordinary table — no new data source. Teams with too few games
 * to omit any are still returned (their scenarios list is empty).
 */
export function buildOmitTestFromExport(
  stats: TeamStatsExport,
  competition: string,
  opts: { omitPct?: number; sensitivityPct?: number } = {},
): OmitTeamResult[] {
  const rows = liveRowsToDisplay(stats.tables['ordinary_ft_overall'] ?? [], 'ordinary');
  const out: OmitTeamResult[] = [];
  for (const row of rows) {
    const matches: OmitMatch[] = (row.games ?? [])
      .filter((g) => typeof g.ftFor === 'number' && Number.isFinite(g.ftFor))
      .map((g) => ({ label: g.match, goals: g.ftFor as number, unix: g.unix }));
    if (matches.length === 0) continue;
    const teamId = typeof row.games?.[0]?.teamId === 'number' ? row.games[0].teamId : null;
    out.push(buildTeamOmitTest(row.team, teamId ?? null, competition, matches, opts));
  }
  return out;
}
