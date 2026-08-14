/**
 * Adapts live OddAlerts standings rows into the shape the standings-analytics
 * engine consumes, so the same filterable table can be used everywhere
 * (league browse, match detail, etc.).
 */
import type { StandingRow as BaseStandingRow } from '@/mock/matchData';
import type { StandingRow as ApiStandingRow } from '@/services/oddAlerts';

export function apiStandingsToBase(rows: ApiStandingRow[]): BaseStandingRow[] {
  return rows.map((r) => ({
    pos: r.rank,
    team: r.name,
    played: r.played,
    won: r.won,
    drawn: r.drawn,
    lost: r.lost,
    gf: r.goalsFor,
    ga: r.goalsAgainst,
    gd: r.goalDiff,
    points: r.points,
    form: [],
  }));
}

/** Map team name → team id, for wiring row taps back to a team route. */
export function teamIdByName(rows: ApiStandingRow[]): Map<string, number> {
  return new Map(rows.map((r) => [r.name, r.teamId]));
}
