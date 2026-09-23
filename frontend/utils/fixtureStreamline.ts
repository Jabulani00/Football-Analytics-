import type {
  Fixture,
  H2HMatch,
  OddsByMarket,
  Probability,
  StandingRow,
} from '@/services/oddAlerts';
import {
  evaluatePowerDynamics,
  listedStreams,
  type StreamName,
} from '@/utils/powerDynamicsEngine';
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
      date: f.kickoffUnix > 0 ? new Date(f.kickoffUnix * 1000).toISOString().slice(0, 10) : '',
      league: f.competition.name,
    });
  }
  return out;
}

export type FixtureStreamInputs = {
  h2hMatches?: H2HMatch[];
  odds?: OddsByMarket;
  probability?: Probability;
  book1x2?: { home: number; away: number } | null;
};

/**
 * Same Streamline membership as Power Dynamics on the match screen.
 * Needs the same table + H2H + 1X2 inputs — do not invent a stream without them.
 */
export function streamForFixture(
  fixture: Fixture,
  table: StandingLike[],
  inputs: FixtureStreamInputs = {},
): StreamName[] {
  if (table.length === 0) return [];
  const pd = evaluatePowerDynamics({
    table,
    homeId: fixture.home.id,
    awayId: fixture.away.id,
    homeName: fixture.home.name,
    awayName: fixture.away.name,
    homeResults: [],
    awayResults: [],
    h2hMatches: inputs.h2hMatches ?? [],
    odds: inputs.odds,
    probability: inputs.probability,
    book1x2: inputs.book1x2 ?? null,
  });
  return listedStreams(pd.streamline.inStreams);
}

export function streamsForFixtures(
  fixtures: Fixture[],
  tableBySeason: Map<number, StandingLike[]>,
  inputsById: Map<number, FixtureStreamInputs> = new Map(),
): Map<number, StreamName[]> {
  const out = new Map<number, StreamName[]>();
  for (const f of fixtures) {
    const seasonId = f.seasonId;
    const table = seasonId != null ? (tableBySeason.get(seasonId) ?? []) : [];
    out.set(f.id, streamForFixture(f, table, inputsById.get(f.id)));
  }
  return out;
}
