/**
 * Cross-competition team form → strengths for the prediction engine.
 *
 * For cup / international fixtures, a team has no results *in that competition*,
 * so competition-scoped stat tables are empty and predictions degenerate to the
 * league mean. This derives each team's attack/defence from its own recent
 * matches ACROSS ALL competitions (domestic league, cups, …), which is what
 * actually reflects team quality.
 *
 * Pure (no network) → unit-testable. Fetch the raw matches via
 * `fetchAllFixturesBetween({ teams })` and pass them in.
 */
import type { RawFixture } from '@/services/oddAlerts';
import type { LeagueBaseline, VenueStats } from '@/services/predictionEngine';

const FINISHED = new Set(['FT', 'AET', 'PEN', 'FT_PEN']);

export type TeamStrengths = {
  home: VenueStats; // as the home side
  away: VenueStats; // as the away side
  overall: VenueStats; // both venues (fallback when a venue has no games)
  sample: number;
};

function isFinished(f: RawFixture): boolean {
  return FINISHED.has(f.status) && f.home_goals != null && f.away_goals != null;
}

function venueStats(
  matches: RawFixture[],
  teamId: number,
): VenueStats {
  if (matches.length === 0) return { scAvg: 0, concAvg: 0, sample: 0 };
  let sc = 0;
  let cc = 0;
  for (const f of matches) {
    const asHome = f.home_id === teamId;
    sc += (asHome ? f.home_goals : f.away_goals) as number;
    cc += (asHome ? f.away_goals : f.home_goals) as number;
  }
  return { scAvg: sc / matches.length, concAvg: cc / matches.length, sample: matches.length };
}

/**
 * Compute a team's venue-split strengths from its recent finished matches
 * (newest `lastN`), regardless of competition.
 */
export function computeTeamStrengths(
  results: RawFixture[],
  teamId: number,
  lastN = 15,
): TeamStrengths {
  const mine = results
    .filter((f) => isFinished(f) && (f.home_id === teamId || f.away_id === teamId))
    .sort((a, b) => b.unix - a.unix)
    .slice(0, lastN);

  return {
    home: venueStats(mine.filter((f) => f.home_id === teamId), teamId),
    away: venueStats(mine.filter((f) => f.away_id === teamId), teamId),
    overall: venueStats(mine, teamId),
    sample: mine.length,
  };
}

/** Home-side stats for a team, falling back to its overall form if it hasn't played at home. */
export function homeVenue(s: TeamStrengths): VenueStats {
  return s.home.sample > 0 ? s.home : s.overall;
}

/** Away-side stats, falling back to overall form. */
export function awayVenue(s: TeamStrengths): VenueStats {
  return s.away.sample > 0 ? s.away : s.overall;
}

/** League baseline (avg home/away goals) measured from a pool of finished results. */
export function baselineFromResults(results: RawFixture[]): LeagueBaseline {
  let home = 0;
  let away = 0;
  let n = 0;
  for (const f of results) {
    if (!isFinished(f)) continue;
    home += f.home_goals as number;
    away += f.away_goals as number;
    n += 1;
  }
  if (n >= 20) return { homeAvg: home / n, awayAvg: away / n, measured: true };
  return { homeAvg: 1.45, awayAvg: 1.15, measured: false };
}

/** Split an array into chunks of `size` (for batching team ids into one request). */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
