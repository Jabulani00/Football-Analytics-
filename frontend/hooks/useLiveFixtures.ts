import { useCallback, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
  fetchAllFixturesBetween,
  fetchAllUpcomingFixtures,
  fetchLiveFixtures,
  fetchUpcomingForCompetitions,
  mapFixture,
  type Fixture,
  type FixtureKind,
} from '@/services/oddAlerts';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { oddAlertsKeys } from '@/services/oddAlertsKeys';
import type { UpcomingScope } from '@/components/layout/ScoresFilterContext';

export type ScoresView = 'all' | 'live' | 'ft' | 'ns';

type Options = {
  resultsDays?: number;
  upcomingDays?: number;
  upcomingScope?: UpcomingScope;
  favoriteCompetitionIds?: number[];
  kind?: FixtureKind;
};

type State = {
  fixtures: Fixture[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastUpdated: number | null;
};

const LIVE_POLL_MS = 25_000;

async function loadFixtures(
  view: ScoresView,
  opts: {
    resultsDays: number;
    upcomingDays: number;
    upcomingScope: UpcomingScope;
    favoriteCompetitionIds: number[];
    kind: FixtureKind;
  },
  signal: AbortSignal,
): Promise<Fixture[]> {
  if (view === 'ns') {
    const days = opts.upcomingDays;
    if (
      opts.upcomingScope === 'popular' &&
      opts.kind === 'club' &&
      opts.favoriteCompetitionIds.length > 0
    ) {
      const raw = await fetchUpcomingForCompetitions(opts.favoriteCompetitionIds, { days }, signal);
      return raw.map(mapFixture);
    }
    const raw = await fetchAllUpcomingFixtures({ days, maxPages: 12 }, signal);
    return raw.map(mapFixture);
  }

  if (view === 'ft') {
    const now = Math.floor(Date.now() / 1000);
    const from = now - opts.resultsDays * 86_400;
    const raw = await fetchAllFixturesBetween({ fromUnix: from, toUnix: now }, signal);
    return raw.map(mapFixture).filter((f) => f.status === 'FT');
  }

  if (view === 'live') {
    const live = await fetchLiveFixtures(signal);
    return live.data.map(mapFixture).filter((f) => f.status === 'LIVE' || f.status === 'HT');
  }

  const [live, upcoming] = await Promise.all([
    fetchLiveFixtures(signal),
    fetchAllUpcomingFixtures({ days: Math.max(2, opts.upcomingDays), maxPages: 8 }, signal),
  ]);
  return [...live.data.map(mapFixture), ...upcoming.map(mapFixture)];
}

export function useLiveFixtures(
  view: ScoresView,
  options: Options = {},
): State & { refresh: () => void } {
  const resultsDays = options.resultsDays ?? 1;
  const upcomingDays = options.upcomingDays ?? 7;
  const upcomingScope = options.upcomingScope ?? 'popular';
  const kind = options.kind ?? 'club';
  const favoriteCompetitionIds = options.favoriteCompetitionIds ?? [];
  const favKey = favoriteCompetitionIds.slice().sort((a, b) => a - b).join(',');
  const [refreshing, setRefreshing] = useState(false);

  const stalePath =
    view === 'ft' ? 'fixtures/between' : view === 'ns' ? 'fixtures/upcoming' : 'fixtures/live';

  const query = useQuery({
    queryKey: oddAlertsKeys.scoresFeed({
      view,
      resultsDays,
      upcomingDays,
      upcomingScope,
      kind,
      favorites: favKey,
    }),
    queryFn: ({ signal }) =>
      loadFixtures(
        view,
        {
          resultsDays,
          upcomingDays,
          upcomingScope,
          kind,
          favoriteCompetitionIds: favKey ? favKey.split(',').map(Number) : [],
        },
        signal,
      ),
    staleTime: clientStaleTime(stalePath),
    refetchInterval: view === 'live' || view === 'all' ? LIVE_POLL_MS : false,
    placeholderData: keepPreviousData,
  });

  const refresh = useCallback(() => {
    setRefreshing(true);
    void query.refetch().finally(() => setRefreshing(false));
  }, [query]);

  return {
    fixtures: query.data ?? [],
    loading: query.isPending || query.isPlaceholderData,
    refreshing: refreshing && query.isFetching,
    error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load fixtures' : null,
    lastUpdated: query.dataUpdatedAt || null,
    refresh,
  };
}
