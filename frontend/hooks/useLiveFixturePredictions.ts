import { useMemo, useRef } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';

import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { oddAlertsKeys } from '@/services/oddAlertsKeys';
import { fetchAllFixturesBetween, fetchUpcomingFixtures, type RawFixture } from '@/services/oddAlerts';
import { predictFromStats, type FixturePrediction } from '@/services/predictionEngine';
import {
  awayVenue,
  baselineFromResults,
  chunk,
  computeTeamStrengths,
  homeVenue,
} from '@/services/teamForm';

export type PredictedFixture = { fixture: RawFixture; prediction: FixturePrediction | null };

const FINISHED = new Set(['FT', 'AET', 'PEN', 'FT_PEN']);
const DEFAULT_POLL_MS = 5 * 60_000; // keep predictions running on live data
const FORM_LOOKBACK_DAYS = 250; // recent cross-competition form window
const MAX_FIXTURES = 30; // cap fixtures predicted per competition
const TEAMS_PER_REQUEST = 25; // batch team ids into one /fixtures/between call

/**
 * Predicts a competition's upcoming fixtures using each team's CROSS-COMPETITION
 * form (recent matches across all competitions), so cup / international fixtures
 * predict as well as league games. Refreshes on an interval so it keeps
 * generating fresh predictions from live data.
 */
export function useLiveFixturePredictions(opts: {
  competitionId?: number | null;
  seasonName?: string;
  days?: number;
  pollMs?: number;
}): { items: PredictedFixture[]; loading: boolean; error: string | null } {
  const { competitionId, days = 10, pollMs = DEFAULT_POLL_MS } = opts;
  const enabled = competitionId != null;

  const upcomingQuery = useQuery({
    queryKey: oddAlertsKeys.upcoming({ days }),
    queryFn: ({ signal }) => fetchUpcomingFixtures({ days }, signal),
    enabled,
    staleTime: clientStaleTime('fixtures/upcoming'),
    refetchInterval: enabled && pollMs > 0 ? pollMs : false,
  });

  const upcoming = useMemo(() => {
    if (competitionId == null) return [];
    return (upcomingQuery.data?.data ?? [])
      .filter((f) => f.competition_id === competitionId && f.home_id && f.away_id)
      .sort((a, b) => a.unix - b.unix)
      .slice(0, MAX_FIXTURES);
  }, [competitionId, upcomingQuery.data]);

  const chunks = useMemo(() => {
    const teamIds = Array.from(
      new Set(upcoming.flatMap((f) => [f.home_id as number, f.away_id as number])),
    );
    return chunk(teamIds, TEAMS_PER_REQUEST);
  }, [upcoming]);

  const teamQueries = useQueries({
    queries: chunks.map((ids) => {
      const teams = ids.join(',');
      return {
        queryKey: oddAlertsKeys.between({
          teams,
          lookbackDays: FORM_LOOKBACK_DAYS,
          maxPages: 5,
        }),
        queryFn: ({ signal }: { signal: AbortSignal }) => {
          const now = Math.floor(Date.now() / 1000);
          const fromUnix = now - FORM_LOOKBACK_DAYS * 86_400;
          return fetchAllFixturesBetween(
            { fromUnix, toUnix: now, teams, maxPages: 5 },
            signal,
          );
        },
        enabled: enabled && upcoming.length > 0,
        staleTime: clientStaleTime('fixtures/between'),
        refetchInterval: pollMs > 0 ? pollMs : false,
      };
    }),
  });

  const teamStamp = teamQueries.map((query) => `${query.dataUpdatedAt}:${query.status}`).join('|');

  const held = useRef<PredictedFixture[]>([]);

  const computed = useMemo(() => {
    if (!enabled || !upcomingQuery.isSuccess) return null;
    if (upcoming.length === 0) return [] as PredictedFixture[];
    if (teamQueries.length === 0 || teamQueries.some((query) => query.data == null)) return null;

    const byId = new Map<number, RawFixture>();
    for (const query of teamQueries) {
      for (const fixture of query.data ?? []) byId.set(fixture.id, fixture);
    }
    const results = Array.from(byId.values());

    const teamMatches = new Map<number, RawFixture[]>();
    for (const fixture of results) {
      if (!FINISHED.has(fixture.status) || fixture.home_goals == null || fixture.away_goals == null) continue;
      for (const id of [fixture.home_id, fixture.away_id]) {
        if (id == null) continue;
        const list = teamMatches.get(id) ?? [];
        list.push(fixture);
        teamMatches.set(id, list);
      }
    }

    const baseline = baselineFromResults(results);
    const strengthOf = (id: number) => computeTeamStrengths(teamMatches.get(id) ?? [], id);

    return upcoming.map((fx) => {
      const home = strengthOf(fx.home_id as number);
      const away = strengthOf(fx.away_id as number);
      const prediction =
        home.sample > 0 && away.sample > 0
          ? predictFromStats(homeVenue(home), awayVenue(away), baseline)
          : null;
      return { fixture: fx, prediction };
    });
  }, [enabled, upcoming, upcomingQuery.isSuccess, upcomingQuery.dataUpdatedAt, teamStamp]);

  if (computed) held.current = computed;

  const failed = upcomingQuery.error ?? teamQueries.find((query) => query.error)?.error ?? null;
  const loading =
    enabled &&
    (upcomingQuery.isFetching || teamQueries.some((query) => query.isFetching || query.isPending));

  return {
    items: enabled ? (computed ?? held.current) : [],
    loading,
    error: failed instanceof Error ? failed.message : failed ? String(failed) : null,
  };
}
