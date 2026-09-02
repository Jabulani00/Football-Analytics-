/**
 * Shared recent-result feed for Section 4 (separators) and Section 5 (last 5).
 * Pure — feed RawFixture rows + a standings snapshot.
 */

import type { RawFixture } from '@/services/oddAlerts';

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

/** Finished matches for one team, newest first. */
export function teamResultsFromFixtures(
  fixtures: RawFixture[],
  teamId: number,
  ranks?: RankLookup | null,
): TeamResult[] {
  const teamRank = ranks?.get(teamId)?.rank ?? null;
  const out: TeamResult[] = [];

  for (const f of fixtures) {
    if (!FINISHED.has(f.status)) continue;
    if (f.home_goals == null || f.away_goals == null) continue;
    if (f.home_id !== teamId && f.away_id !== teamId) continue;

    const isHome = f.home_id === teamId;
    const gf = isHome ? f.home_goals : f.away_goals;
    const ga = isHome ? f.away_goals : f.home_goals;
    const opponentId = isHome ? f.away_id : f.home_id;
    const opponentName = isHome ? f.away_name : f.home_name;
    const oppRank = opponentId != null ? ranks?.get(opponentId)?.rank ?? null : null;
    const opponentAbove =
      teamRank != null && oppRank != null ? oppRank < teamRank : null;

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

/** Points from a W/D/L sequence (3/1/0). */
export function pointsFromOutcomes(outcomes: ResultOutcome[]): number {
  let pts = 0;
  for (const o of outcomes) {
    if (o === 'W') pts += 3;
    else if (o === 'D') pts += 1;
  }
  return pts;
}
