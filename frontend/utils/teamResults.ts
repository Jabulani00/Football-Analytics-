/**
 * Shared recent-result feed for Section 4 (separators) and Section 5 (last 5).
 * Pure — feed RawFixture rows + a standings snapshot.
 */

import type { RawFixture } from '@/services/oddAlerts';
import { parseScorePair } from '@/utils/matchDetailDisplay';

const FINISHED = new Set(['FT', 'AET', 'PEN', 'FT_PEN', 'AWD', 'AWARDED', 'WO']);

export type ResultOutcome = 'W' | 'D' | 'L';

export type TeamResult = {
  fixtureId: number;
  unix: number;
  teamId: number;
  opponentId: number | null;
  opponentName: string;
  isHome: boolean;
  gf: number;
  ga: number;
  outcome: ResultOutcome;
  /** Opponent's current table rank, if known. */
  opponentRank: number | null;
  /** This team's current table rank, if known. */
  teamRank: number | null;
  /** Opponent was above this team on the live table. */
  opponentAbove: boolean | null;
  goalDiff: number;
  /** Goals at HT for this side, when `ht_score` is on the fixture. */
  htGf?: number | null;
  htGa?: number | null;
  competitionId?: number | null;
  seasonId?: number | null;
  isCup?: boolean;
  isFriendly?: boolean;
};

export type RankLookup = Map<number, { rank: number; name: string; points: number }>;

export function ranksFromStandings(
  standings: { teamId: number; rank: number; name: string; points: number }[],
): RankLookup {
  return new Map(standings.map((r) => [r.teamId, { rank: r.rank, name: r.name, points: r.points }]));
}

function outcomeFor(gf: number, ga: number): ResultOutcome {
  if (gf > ga) return 'W';
  if (gf < ga) return 'L';
  return 'D';
}

/**
 * Finished matches for one team, newest first. League-only when `competitionId`
 * is set — friendlies always drop, cups drop unless `includeCup` is on (so a cup
 * fixture can still report its own competition's history).
 */
export function teamResultsFromFixtures(
  fixtures: RawFixture[],
  teamId: number,
  ranks?: RankLookup | null,
  opts?: { competitionId?: number | null; seasonId?: number | null; includeCup?: boolean },
): TeamResult[] {
  const teamRank = ranks?.get(teamId)?.rank ?? null;
  const leagueId = opts?.competitionId ?? null;
  const seasonId = opts?.seasonId ?? null;
  const out: TeamResult[] = [];

  for (const f of fixtures) {
    if (!FINISHED.has(f.status)) continue;
    if (f.home_goals == null || f.away_goals == null) continue;
    if (f.home_id !== teamId && f.away_id !== teamId) continue;
    if (leagueId != null) {
      if (f.is_friendly) continue;
      if (f.is_cup && !opts?.includeCup) continue;
      if (f.competition_id !== leagueId) continue;
    }
    if (seasonId != null && f.season_id != null && f.season_id !== seasonId) continue;

    const isHome = f.home_id === teamId;
    const gf = isHome ? f.home_goals : f.away_goals;
    const ga = isHome ? f.away_goals : f.home_goals;
    const opponentId = isHome ? f.away_id : f.home_id;
    const opponentName = isHome ? f.away_name : f.home_name;
    const oppRank = opponentId != null ? ranks?.get(opponentId)?.rank ?? null : null;
    const opponentAbove =
      teamRank != null && oppRank != null ? oppRank < teamRank : null;
    const ht = parseScorePair(f.ht_score);
    const htGf = ht ? (isHome ? ht.home : ht.away) : null;
    const htGa = ht ? (isHome ? ht.away : ht.home) : null;

    out.push({
      fixtureId: f.id,
      unix: f.unix,
      teamId,
      opponentId,
      opponentName,
      isHome,
      gf,
      ga,
      outcome: outcomeFor(gf, ga),
      opponentRank: oppRank,
      teamRank,
      opponentAbove,
      goalDiff: gf - ga,
      htGf,
      htGa,
      competitionId: f.competition_id,
      seasonId: f.season_id ?? null,
      isCup: f.is_cup,
      isFriendly: f.is_friendly,
    });
  }

  return out.sort((a, b) => b.unix - a.unix);
}

export function filterScope(
  results: TeamResult[],
  scope: 'overall' | 'home' | 'away',
): TeamResult[] {
  if (scope === 'home') return results.filter((r) => r.isHome);
  if (scope === 'away') return results.filter((r) => !r.isHome);
  return results;
}

export function lastN(results: TeamResult[], n: number): TeamResult[] {
  return results.slice(0, n);
}

/**
 * Drop one fixture from a result feed. A finished match sits inside its own
 * season window, so form "going into" it must exclude its own result.
 */
export function excludeFixture(
  results: TeamResult[],
  fixtureId: number | null | undefined,
): TeamResult[] {
  if (fixtureId == null) return results;
  return results.filter((r) => r.fixtureId !== fixtureId);
}

/** Points from a W/D/L sequence (3/1/0). */
export function pointsFromOutcomes(outcomes: ResultOutcome[]): number {
  let pts = 0;
  for (const o of outcomes) {
    if (o === 'W') pts += 3;
    else if (o === 'D') pts += 1;
  }
  return pts;
}
