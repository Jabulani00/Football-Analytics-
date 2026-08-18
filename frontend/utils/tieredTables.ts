/**
 * Pure tier-table computation — no network, no React Native imports, so it can
 * be unit-tested directly (see scripts/tieredTables.test.ts).
 *
 * The spec: three colour tables built from a team's *current* zone.
 *   • 🟢 Green (top zone)    — ranked by a head-to-head mini-league among the
 *                              green teams (green-vs-green results only), NOT by
 *                              overall league points.
 *   • 🟡 Yellow (mid zone)   — ranked by results against the Green table.
 *   • 🔴 Red (bottom zone)   — ranked by results against the Green table.
 *
 * Zones come from the live standings, so a past result is judged by the
 * opponent's tier *today*, not the tier it held when the match was played.
 */

export type TierZone = 'top' | 'mid' | 'bottom';

/** One standings row, reduced to what the tier tables need. */
export type TierStanding = {
  teamId: number;
  name: string;
  rank: number;
  zone: TierZone;
};

/** A finished match, reduced to what the tier tables need. */
export type TierFixture = {
  competitionId: number;
  seasonId: number | null;
  homeId: number;
  awayId: number;
  homeGoals: number;
  awayGoals: number;
};

export type TierTeamRow = {
  teamId: number;
  name: string;
  /** The team's position in the full league table (for reference). */
  overallRank: number;
  /** Games / record counted for THIS tier's ranking (not the whole season). */
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
};

export type TieredTables = {
  green: TierTeamRow[];
  yellow: TierTeamRow[];
  red: TierTeamRow[];
};

type TierAccum = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
};

const emptyAccum = (): TierAccum => ({
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  gf: 0,
  ga: 0,
  points: 0,
});

function recordResult(acc: TierAccum, gf: number, ga: number): void {
  acc.played += 1;
  acc.gf += gf;
  acc.ga += ga;
  if (gf > ga) {
    acc.won += 1;
    acc.points += 3;
  } else if (gf === ga) {
    acc.drawn += 1;
    acc.points += 1;
  } else {
    acc.lost += 1;
  }
}

/**
 * Build the three ranked colour tables from standings + finished fixtures.
 * Only fixtures from `competitionId` (and, when the fixture carries one, the
 * matching `seasonId`) are counted.
 */
export function buildTieredTables(opts: {
  competitionId: number;
  seasonId: number | null;
  standings: TierStanding[];
  fixtures: TierFixture[];
}): TieredTables {
  const zoneByTeam = new Map<number, TierZone>();
  const infoByTeam = new Map<number, { name: string; overallRank: number }>();
  for (const r of opts.standings) {
    zoneByTeam.set(r.teamId, r.zone);
    infoByTeam.set(r.teamId, { name: r.name, overallRank: r.rank });
  }

  const greenAcc = new Map<number, TierAccum>(); // green-vs-green mini-league
  const yellowAcc = new Map<number, TierAccum>(); // mid team's record vs green
  const redAcc = new Map<number, TierAccum>(); // bottom team's record vs green
  // Pairwise head-to-head points among green teams, keyed `${teamId}:${oppId}`,
  // used to break ties in the green table (the "that match decides it" rule).
  const h2hPoints = new Map<string, number>();

  const bump = (m: Map<number, TierAccum>, id: number): TierAccum => {
    let a = m.get(id);
    if (!a) {
      a = emptyAccum();
      m.set(id, a);
    }
    return a;
  };

  for (const f of opts.fixtures) {
    // Only matches from THIS competition count — never cup ties or other
    // competitions the same teams also play in.
    if (f.competitionId !== opts.competitionId) continue;
    if (opts.seasonId != null && f.seasonId != null && f.seasonId !== opts.seasonId) continue;

    const hId = f.homeId;
    const aId = f.awayId;
    const hg = f.homeGoals;
    const ag = f.awayGoals;
    const hZone = zoneByTeam.get(hId);
    const aZone = zoneByTeam.get(aId);
    if (!hZone || !aZone) continue;

    // 🟢 Green: only matches between two current top-zone teams.
    if (hZone === 'top' && aZone === 'top') {
      recordResult(bump(greenAcc, hId), hg, ag);
      recordResult(bump(greenAcc, aId), ag, hg);
      const hPts = hg > ag ? 3 : hg === ag ? 1 : 0;
      const aPts = ag > hg ? 3 : hg === ag ? 1 : 0;
      h2hPoints.set(`${hId}:${aId}`, (h2hPoints.get(`${hId}:${aId}`) ?? 0) + hPts);
      h2hPoints.set(`${aId}:${hId}`, (h2hPoints.get(`${aId}:${hId}`) ?? 0) + aPts);
    }

    // 🟡 Yellow / 🔴 Red: a mid/bottom team's result against a green opponent.
    if (aZone === 'top' && hZone === 'mid') recordResult(bump(yellowAcc, hId), hg, ag);
    if (aZone === 'top' && hZone === 'bottom') recordResult(bump(redAcc, hId), hg, ag);
    if (hZone === 'top' && aZone === 'mid') recordResult(bump(yellowAcc, aId), ag, hg);
    if (hZone === 'top' && aZone === 'bottom') recordResult(bump(redAcc, aId), ag, hg);
  }

  const toRow = (teamId: number, acc: TierAccum): TierTeamRow => {
    const info = infoByTeam.get(teamId)!;
    return {
      teamId,
      name: info.name,
      overallRank: info.overallRank,
      played: acc.played,
      won: acc.won,
      drawn: acc.drawn,
      lost: acc.lost,
      goalsFor: acc.gf,
      goalsAgainst: acc.ga,
      goalDiff: acc.gf - acc.ga,
      points: acc.points,
    };
  };

  // Every team keeps its tier slot even before it has a qualifying result.
  const buildRows = (zone: TierZone, acc: Map<number, TierAccum>): TierTeamRow[] =>
    opts.standings
      .filter((r) => r.zone === zone)
      .map((r) => toRow(r.teamId, acc.get(r.teamId) ?? emptyAccum()));

  const green = buildRows('top', greenAcc).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    // Tied on mini-league points → the head-to-head between them decides it.
    const ab = h2hPoints.get(`${a.teamId}:${b.teamId}`) ?? 0;
    const ba = h2hPoints.get(`${b.teamId}:${a.teamId}`) ?? 0;
    if (ab !== ba) return ba - ab;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.name.localeCompare(b.name);
  });

  const vsGreenSort = (a: TierTeamRow, b: TierTeamRow): number => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.name.localeCompare(b.name);
  };

  return {
    green,
    yellow: buildRows('mid', yellowAcc).sort(vsGreenSort),
    red: buildRows('bottom', redAcc).sort(vsGreenSort),
  };
}
