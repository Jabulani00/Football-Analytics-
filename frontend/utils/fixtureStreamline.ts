import type { Fixture, H2HMatch, StandingRow } from '@/services/oddAlerts';
import { streamlineForMatchup, type StreamName } from '@/utils/powerDynamicsEngine';
import type { StandingLike } from '@/utils/motivationEngine';

const FINISHED = new Set(['FT']);
const FINISHED_RAW = new Set(['FT', 'AET', 'PEN', 'FT_PEN']);

export function standingRowsToLike(rows: StandingRow[]): StandingLike[] {
  return rows.map((r) => ({
    rank: r.rank,
    teamId: r.teamId,
    name: r.name,
    points: r.points,
    played: r.played,
    zone: r.zone,
    won: r.won,
    drawn: r.drawn,
    lost: r.lost,
    goalDiff: r.goalDiff,
    goalsFor: r.goalsFor,
  }));
}

/** Finished list fixtures as H2H meetings (same-season head-to-heads). */
export function h2hFromFinishedFixtures(fixtures: Fixture[]): H2HMatch[] {
  const out: H2HMatch[] = [];
  for (const f of fixtures) {
    if (!FINISHED.has(f.status) && !FINISHED_RAW.has(f.rawStatus)) continue;
    const hg = f.home.goals;
    const ag = f.away.goals;
    if (hg == null || ag == null) continue;
    out.push({
      id: f.id,
      home_name: f.home.name,
      away_name: f.away.name,
      home_goals: hg,
      away_goals: ag,
      ht_score: null,
      total_goals: hg + ag,
      btts: hg > 0 && ag > 0,
      home_win: hg > ag,
      away_win: ag > hg,
      draw: hg === ag,
      date: '',
      league: f.competition.name,
    });
  }
  return out;
}

export function streamForFixture(
  fixture: Fixture,
  table: StandingLike[],
  h2hMatches: H2HMatch[] = [],
): StreamName | null {
  if (table.length === 0) return null;
  if (fixture.competition.isCup || fixture.competition.isFriendly) return null;
  return streamlineForMatchup({
    table,
    homeId: fixture.home.id,
    awayId: fixture.away.id,
    homeName: fixture.home.name,
    awayName: fixture.away.name,
    h2hMatches,
  });
}

export function streamsForFixtures(
  fixtures: Fixture[],
  tableBySeason: Map<number, StandingLike[]>,
  h2hMatches: H2HMatch[] = [],
): Map<number, StreamName | null> {
  const out = new Map<number, StreamName | null>();
  for (const f of fixtures) {
    const seasonId = f.seasonId;
    const table = seasonId != null ? (tableBySeason.get(seasonId) ?? []) : [];
    out.set(f.id, streamForFixture(f, table, h2hMatches));
  }
  return out;
}
