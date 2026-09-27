/**
 * Real league-table maths — one per-team match feed, built from the season's
 * finished results, that every derived table is then aggregated from.
 *
 * Pure: no network, no React Native imports, so it unit-tests directly under
 * plain `tsx` (see scripts/leagueTables.test.ts).
 *
 * Nothing here estimates or simulates. A number that cannot be counted from a
 * finished fixture is not produced at all — a match with no half-time score is
 * excluded from the half tables and reported in `coverage`, rather than being
 * guessed at. Every record therefore satisfies:
 *
 *   played = won + drawn + lost
 *   points = 3·won + drawn
 *   goalDiff = goalsFor − goalsAgainst
 *
 * and `played` never exceeds the matches actually played against the opponents
 * being measured.
 */

export type Split = 'overall' | 'home' | 'away';
export type Period = 'ft' | '1h' | '2h';

/** Colour band a team currently sits in — the thirds of the live table. */
export type Band = 'green' | 'yellow' | 'red';

export const BANDS: Band[] = ['green', 'yellow', 'red'];

/**
 * The single band rule for the whole app: the table splits into thirds by
 * position, the top third green and the bottom third red. `assignZones` in
 * services/oddAlerts and the standings table's row colouring both defer to it,
 * so a team cannot be green in one view and yellow in another.
 *
 * With a table that does not divide evenly the middle band is the short one —
 * 20 teams give 7 green, 6 yellow, 7 red.
 */
export function bandOf(pos: number, total: number): Band {
  const third = Math.max(1, Math.ceil(total / 3));
  if (pos <= third) return 'green';
  if (pos > total - third) return 'red';
  return 'yellow';
}

/** The positions a band covers, for captions like "pos 1–7". */
export function bandRange(band: Band, total: number): { from: number; to: number } {
  const third = Math.max(1, Math.ceil(total / 3));
  if (band === 'green') return { from: 1, to: Math.min(third, total) };
  if (band === 'red') return { from: Math.max(1, total - third + 1), to: total };
  return { from: Math.min(third + 1, total), to: Math.max(1, total - third) };
}

/** One finished match, reduced to what the tables need. */
export type SeasonResult = {
  competitionId: number;
  seasonId: number | null;
  homeId: number;
  awayId: number;
  homeGoals: number;
  awayGoals: number;
  /** Half-time goals, or null when the provider carried no `ht_score`. */
  homeGoalsHt: number | null;
  awayGoalsHt: number | null;
  /** Kick-off, for recency ordering. */
  unix: number;
};

/** One standings row, reduced to what the feed needs. */
export type FeedStanding = { teamId: number; name: string; rank: number };

/** One match from a single team's point of view. */
export type TeamMatch = {
  isHome: boolean;
  gf: number;
  ga: number;
  gfHt: number | null;
  gaHt: number | null;
  opponentId: number;
  /** The opponent's band *today*, not the one it held on the day. */
  opponentBand: Band;
  unix: number;
};

export type MatchFeed = {
  /** Team id → its matches, newest first. Every standings team has an entry. */
  byTeam: Map<number, TeamMatch[]>;
  bandByTeam: Map<number, Band>;
  idByName: Map<string, number>;
  total: number;
  /** How many matches carried a half-time score, out of how many counted. */
  halfTimeCoverage: { withHt: number; total: number };
};

/**
 * Build the per-team feed from a standings snapshot and the season's finished
 * results.
 *
 * Only matches from `competitionId` (and, where the fixture carries one, the
 * matching `seasonId`) are counted — never cup ties or another competition the
 * same teams also play in. A match whose opponent is absent from the current
 * table is dropped, because it has no band to be measured against.
 */
export function buildMatchFeed(opts: {
  competitionId: number;
  seasonId: number | null;
  standings: FeedStanding[];
  results: SeasonResult[];
}): MatchFeed {
  const total = opts.standings.length;
  const bandByTeam = new Map<number, Band>();
  const idByName = new Map<string, number>();
  const byTeam = new Map<number, TeamMatch[]>();

  for (const row of opts.standings) {
    bandByTeam.set(row.teamId, bandOf(row.rank, total));
    idByName.set(row.name, row.teamId);
    byTeam.set(row.teamId, []);
  }

  let counted = 0;
  let withHt = 0;

  for (const r of opts.results) {
    if (r.competitionId !== opts.competitionId) continue;
    if (opts.seasonId != null && r.seasonId != null && r.seasonId !== opts.seasonId) continue;

    const homeBand = bandByTeam.get(r.homeId);
    const awayBand = bandByTeam.get(r.awayId);
    if (!homeBand || !awayBand) continue;

    const hasHt = r.homeGoalsHt != null && r.awayGoalsHt != null;
    counted += 1;
    if (hasHt) withHt += 1;

    byTeam.get(r.homeId)!.push({
      isHome: true,
      gf: r.homeGoals,
      ga: r.awayGoals,
      gfHt: hasHt ? r.homeGoalsHt : null,
      gaHt: hasHt ? r.awayGoalsHt : null,
      opponentId: r.awayId,
      opponentBand: awayBand,
      unix: r.unix,
    });
    byTeam.get(r.awayId)!.push({
      isHome: false,
      gf: r.awayGoals,
      ga: r.homeGoals,
      gfHt: hasHt ? r.awayGoalsHt : null,
      gaHt: hasHt ? r.homeGoalsHt : null,
      opponentId: r.homeId,
      opponentBand: homeBand,
      unix: r.unix,
    });
  }

  for (const matches of byTeam.values()) matches.sort((a, b) => b.unix - a.unix);

  return { byTeam, bandByTeam, idByName, total, halfTimeCoverage: { withHt, total: counted } };
}

/**
 * Goals in the requested period, or null when the match cannot answer for it.
 * The second half is full-time minus half-time, so both halves need the same
 * recorded `ht_score` and a match without one contributes to neither.
 */
export function periodGoals(m: TeamMatch, period: Period): { gf: number; ga: number } | null {
  if (period === 'ft') return { gf: m.gf, ga: m.ga };
  if (m.gfHt == null || m.gaHt == null) return null;
  if (period === '1h') return { gf: m.gfHt, ga: m.gaHt };
  return { gf: Math.max(0, m.gf - m.gfHt), ga: Math.max(0, m.ga - m.gaHt) };
}

export type Outcome = 'W' | 'D' | 'L';

export function outcomeOf(gf: number, ga: number): Outcome {
  return gf > ga ? 'W' : gf < ga ? 'L' : 'D';
}

/** A match reduced to the goals of one period — what the metrics read. */
export type PeriodMatch = { isHome: boolean; gf: number; ga: number; opponentBand: Band };

export type Scope = {
  split?: Split;
  period?: Period;
  /** Count only matches against this band. Omit for the whole league. */
  vsBand?: Band;
  /** Keep only the most recent N of the matches that survive the filters. */
  window?: number;
};

/**
 * The matches a scope selects, newest first, already reduced to the period's
 * goals. `eligible` is how many matches passed the split and band filters, so
 * a caller can say "12 of 14 carry a half-time score".
 */
export function scopeMatches(
  matches: TeamMatch[],
  scope: Scope = {},
): { matches: PeriodMatch[]; eligible: number } {
  const { split = 'overall', period = 'ft', vsBand, window } = scope;

  let eligible = 0;
  const out: PeriodMatch[] = [];

  for (const m of matches) {
    if (split === 'home' && !m.isHome) continue;
    if (split === 'away' && m.isHome) continue;
    if (vsBand && m.opponentBand !== vsBand) continue;
    eligible += 1;
    const g = periodGoals(m, period);
    if (!g) continue; // no half-time score — excluded, never estimated
    out.push({ isHome: m.isHome, gf: g.gf, ga: g.ga, opponentBand: m.opponentBand });
  }

  return { matches: window ? out.slice(0, window) : out, eligible };
}

/** A W/D/L record over some set of matches. */
export type TeamRecord = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  ppg: number;
  /** Up to five most recent outcomes, newest first. */
  form: Outcome[];
  /** Matches that passed the split/band filters, before the period filter. */
  eligible: number;
};

export const emptyRecord = (): TeamRecord => ({
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  goalDiff: 0,
  points: 0,
  ppg: 0,
  form: [],
  eligible: 0,
});

/** Count a team's record over a scope. Every field is a real tally. */
export function aggregate(matches: TeamMatch[], scope: Scope = {}): TeamRecord {
  const { matches: scoped, eligible } = scopeMatches(matches, scope);

  const rec = emptyRecord();
  rec.eligible = eligible;

  for (const m of scoped) {
    rec.played += 1;
    rec.goalsFor += m.gf;
    rec.goalsAgainst += m.ga;
    const o = outcomeOf(m.gf, m.ga);
    if (o === 'W') {
      rec.won += 1;
      rec.points += 3;
    } else if (o === 'D') {
      rec.drawn += 1;
      rec.points += 1;
    } else {
      rec.lost += 1;
    }
    if (rec.form.length < 5) rec.form.push(o);
  }

  rec.goalDiff = rec.goalsFor - rec.goalsAgainst;
  rec.ppg = rec.played ? rec.points / rec.played : 0;
  return rec;
}
