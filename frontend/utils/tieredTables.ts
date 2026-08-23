/**
 * Pure tier-table computation — no network, no React Native imports, so it can
 * be unit-tested directly (see scripts/tieredTables.test.ts).
 *
 * Three colour tables are built from a team's *current* zone (top/mid/bottom
 * thirds of the live table). Every team also gets its record broken down by the
 * opponent's zone, so a table can be ranked "vs Green", "vs Yellow", "vs Red"
 * or "Overall":
 *   • 🟢 Green (top)    — by default a head-to-head mini-league among themselves.
 *   • 🟡 Yellow (mid)   — by default ranked by results against the Green table.
 *   • 🔴 Red (bottom)   — by default ranked by results against the Green table.
 *
 * Zones come from the live standings, so a past result is judged by the
 * opponent's tier *today*, not the tier it held when the match was played.
 * Only fixtures from the SAME competition and season are ever counted.
 */

export type TierZone = 'top' | 'mid' | 'bottom';
/** What a table's record/ranking is measured against. */
export type TargetZone = TierZone | 'all';

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

/** A W/D/L record over some set of games. */
export type TierRecord = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
};

export type TierTeamRow = {
  teamId: number;
  name: string;
  /** The team's position in the full league table (for reference). */
  overallRank: number;
  /** The team's own colour tier. */
  zone: TierZone;
  /** Record split by the opponent's tier, plus `all` = every comp/season game. */
  byZone: Record<TargetZone, TierRecord>;
  // Flat convenience fields = the record vs the Green (top) table — the default
  // measure. Kept so existing consumers keep working.
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

function toRecord(a: TierAccum): TierRecord {
  return {
    played: a.played,
    won: a.won,
    drawn: a.drawn,
    lost: a.lost,
    goalsFor: a.gf,
    goalsAgainst: a.ga,
    goalDiff: a.gf - a.ga,
    points: a.points,
  };
}

function sumAccum(...accs: TierAccum[]): TierAccum {
  const out = emptyAccum();
  for (const a of accs) {
    out.played += a.played;
    out.won += a.won;
    out.drawn += a.drawn;
    out.lost += a.lost;
    out.gf += a.gf;
    out.ga += a.ga;
    out.points += a.points;
  }
  return out;
}

/**
 * Rank a colour table by a chosen target zone (points, then goal difference,
 * goals for, then name). Used to re-rank when the "measured vs" filter changes.
 */
export function rankTierRows(rows: TierTeamRow[], target: TargetZone): TierTeamRow[] {
  return [...rows].sort((a, b) => {
    const ra = a.byZone[target];
    const rb = b.byZone[target];
    if (rb.points !== ra.points) return rb.points - ra.points;
    if (rb.goalDiff !== ra.goalDiff) return rb.goalDiff - ra.goalDiff;
    if (rb.goalsFor !== ra.goalsFor) return rb.goalsFor - ra.goalsFor;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Build the three colour tables from standings + finished fixtures, each team
 * carrying its record vs every tier. Only fixtures from `competitionId` (and,
 * when the fixture carries one, the matching `seasonId`) are counted.
 */
export function buildTieredTables(opts: {
  competitionId: number;
  seasonId: number | null;
  standings: TierStanding[];
  fixtures: TierFixture[];
}): TieredTables {
  const zoneByTeam = new Map<number, TierZone>();
  const infoByTeam = new Map<number, { name: string; overallRank: number; zone: TierZone }>();
  for (const r of opts.standings) {
    zoneByTeam.set(r.teamId, r.zone);
    infoByTeam.set(r.teamId, { name: r.name, overallRank: r.rank, zone: r.zone });
  }

  // Per team: record vs each opponent zone.
  const byZoneAcc = new Map<number, Record<TierZone, TierAccum>>();
  // Pairwise head-to-head points among green teams (green table tiebreak).
  const h2hPoints = new Map<string, number>();

  const zoneRec = (id: number, zone: TierZone): TierAccum => {
    let rec = byZoneAcc.get(id);
    if (!rec) {
      rec = { top: emptyAccum(), mid: emptyAccum(), bottom: emptyAccum() };
      byZoneAcc.set(id, rec);
    }
    return rec[zone];
  };

  for (const f of opts.fixtures) {
    // Only matches from THIS competition + season count — never cup ties or
    // other competitions/seasons the same teams also play in.
    if (f.competitionId !== opts.competitionId) continue;
    if (opts.seasonId != null && f.seasonId != null && f.seasonId !== opts.seasonId) continue;

    const { homeId: hId, awayId: aId, homeGoals: hg, awayGoals: ag } = f;
    const hZone = zoneByTeam.get(hId);
    const aZone = zoneByTeam.get(aId);
    if (!hZone || !aZone) continue; // both teams must be in the current table

    // Each team's result recorded against the opponent's CURRENT tier.
    recordResult(zoneRec(hId, aZone), hg, ag);
    recordResult(zoneRec(aId, hZone), ag, hg);

    // Green head-to-head: pairwise points among two top-zone teams.
    if (hZone === 'top' && aZone === 'top') {
      const hPts = hg > ag ? 3 : hg === ag ? 1 : 0;
      const aPts = ag > hg ? 3 : hg === ag ? 1 : 0;
      h2hPoints.set(`${hId}:${aId}`, (h2hPoints.get(`${hId}:${aId}`) ?? 0) + hPts);
      h2hPoints.set(`${aId}:${hId}`, (h2hPoints.get(`${aId}:${hId}`) ?? 0) + aPts);
    }
  }

  const toRow = (teamId: number): TierTeamRow => {
    const info = infoByTeam.get(teamId)!;
    const rec = byZoneAcc.get(teamId) ?? {
      top: emptyAccum(),
      mid: emptyAccum(),
      bottom: emptyAccum(),
    };
    const byZone: Record<TargetZone, TierRecord> = {
      top: toRecord(rec.top),
      mid: toRecord(rec.mid),
      bottom: toRecord(rec.bottom),
      all: toRecord(sumAccum(rec.top, rec.mid, rec.bottom)),
    };
    // Flat fields mirror the vs-Green (top) record — the default measure.
    return {
      teamId,
      name: info.name,
      overallRank: info.overallRank,
      zone: info.zone,
      byZone,
      played: byZone.top.played,
      won: byZone.top.won,
      drawn: byZone.top.drawn,
      lost: byZone.top.lost,
      goalsFor: byZone.top.goalsFor,
      goalsAgainst: byZone.top.goalsAgainst,
      goalDiff: byZone.top.goalDiff,
      points: byZone.top.points,
    };
  };

  // Every team keeps its tier slot even before it has a qualifying result.
  const rowsFor = (zone: TierZone): TierTeamRow[] =>
    opts.standings.filter((r) => r.zone === zone).map((r) => toRow(r.teamId));

  // Green defaults to the head-to-head mini-league (vs top), with the pairwise
  // tiebreak; yellow/red default to their record vs Green (top).
  const green = rowsFor('top').sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const ab = h2hPoints.get(`${a.teamId}:${b.teamId}`) ?? 0;
    const ba = h2hPoints.get(`${b.teamId}:${a.teamId}`) ?? 0;
    if (ab !== ba) return ba - ab;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.name.localeCompare(b.name);
  });

  return {
    green,
    yellow: rankTierRows(rowsFor('mid'), 'top'),
    red: rankTierRows(rowsFor('bottom'), 'top'),
  };
}
