import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { detectKind, fetchAllCompetitions, fetchAllUpcomingFixtures, type RawFixture } from '@/services/oddAlerts';

/** Friendly competitions (e.g. "Club Friendlies") are not gradeable domestic leagues. */
const FRIENDLY_RE = /friendl/i;

/**
 * How many pages of the upcoming feed to enumerate for the active-league list.
 * The whole ~3-day window is ~40 pages (≈9.9k fixtures / ≈835 leagues); this
 * covers it with headroom so the list is the full active set, not just page 1.
 */
const ACTIVE_FEED_MAX_PAGES = 45;

/**
 * Upper bound on how many active leagues a screen builds stats for at once (the
 * "scan"). The feed lists every active league, but building season stats for all
 * ~835 at once would hammer the API — panels take the top N by activity instead.
 */
export const ACTIVE_SCAN_CAP = 150;

export type LiveCompetition = {
  id: number;
  name: string;
  season: string;
  seasonId: number | null;
  /** API-reported games played in the selected current season, when available. */
  seasonPlayed?: number | null;
  country: string;
  /** Number of upcoming fixtures — a proxy for how active the competition is. */
  upcoming: number;
  /** Default-ordering tier: 0 = domestic league, 1 = cup, 2 = friendly/youth. */
  rank: number;
};

/**
 * Default-ordering tier. Domestic leagues predict best (self-contained results),
 * cups less so (teams' form lives in their domestic league), friendlies/youth
 * worst. Used only to pick a sensible default — search reaches everything.
 */
function competitionRank(fx: RawFixture): number {
  if (
    fx.is_friendly === true ||
    /friendl|reserve|\bu1\d\b|\bu2\d\b|youth/i.test(fx.competition_name ?? '')
  ) {
    return 2;
  }
  if (fx.is_cup === true) return 1;
  return 0;
}

function competitionsFrom(rows: RawFixture[] | undefined): LiveCompetition[] {
  const seen = new Map<number, LiveCompetition>();
  for (const fx of rows ?? []) {
    if (!fx.competition_id || !fx.competition_name) continue;
    const existing = seen.get(fx.competition_id);
    if (existing) {
      existing.upcoming += 1;
      if (existing.seasonId == null && fx.season_id != null) existing.seasonId = fx.season_id;
    } else {
      seen.set(fx.competition_id, {
        id: fx.competition_id,
        name: fx.competition_name,
        season: fx.season,
        seasonId: fx.season_id ?? null,
        country: fx.competition_country,
        upcoming: 1,
        rank: competitionRank(fx),
      });
    }
  }
  return Array.from(seen.values()).sort(
    (a, b) => a.rank - b.rank || b.upcoming - a.upcoming || a.name.localeCompare(b.name),
  );
}

/**
 * Distinct competitions that have upcoming fixtures — i.e. leagues currently
 * active, sourced live from the API. Sorted by activity (most upcoming fixtures
 * first) so the default selection is a competition likely to have results.
 */
export function useLiveCompetitionFeed(days = 3): {
  competitions: LiveCompetition[];
  loading: boolean;
  error: string | null;
} {
  // The active-LEAGUE set changes slowly (a league stays "active" for its whole
  // season), so enumerate every page of the upcoming window under a dedicated key
  // with a long stale time — kept separate from the 20s live-fixtures feed so we
  // don't re-page ~40 requests every few seconds.
  const query = useQuery({
    queryKey: ['active-league-feed', days],
    queryFn: ({ signal }) => fetchAllUpcomingFixtures({ days, maxPages: ACTIVE_FEED_MAX_PAGES }, signal),
    staleTime: 10 * 60_000,
  });

  const competitions = useMemo(() => competitionsFrom(query.data), [query.data]);
  const error =
    query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null;

  return { competitions, loading: query.isPending, error };
}

export function useLiveCompetitions(days = 3): LiveCompetition[] {
  return useLiveCompetitionFeed(days).competitions;
}

/**
 * Every gradeable domestic league from the API's full competition list (1000+),
 * not just the ~90 with fixtures in the next few days. Keeps club leagues (no
 * cups, no national-team competitions) whose current season has games played,
 * so each one has results to grade. Sorted by country then name.
 */
export function useAllGradingLeagues(): { leagues: LiveCompetition[]; loading: boolean; error: string | null } {
  const query = useQuery({
    queryKey: ['all-competitions', 'grading-leagues'],
    queryFn: ({ signal }) => fetchAllCompetitions(signal),
    staleTime: clientStaleTime('competitions'),
  });

  const leagues = useMemo<LiveCompetition[]>(() => {
    const out: LiveCompetition[] = [];
    for (const c of query.data ?? []) {
      // "Club Friendlies" matches /club/i so detectKind keeps it; drop friendlies
      // explicitly — they are not gradeable domestic leagues.
      if (c.isCup || detectKind(c.name) !== 'club' || FRIENDLY_RE.test(`${c.type} ${c.name}`)) continue;
      // Use the current season (or newest) for the stat window. The API's `played`
      // count is unreliable (often null even for major leagues), so it isn't gated
      // on here — a league with no finished results simply grades empty when picked.
      const current = c.seasons.find((s) => s.isCurrent) ?? c.seasons[0];
      if (!current) continue;
      out.push({
        id: c.id,
        name: c.name,
        season: current.seasonName,
        seasonId: current.seasonId,
        seasonPlayed: current.played,
        country: c.country,
        upcoming: 0,
        rank: 0,
      });
    }
    return out.sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
  }, [query.data]);

  const error = query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null;
  return { leagues, loading: query.isPending, error };
}
