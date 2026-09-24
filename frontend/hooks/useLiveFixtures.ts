import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchAllFixturesBetween,
  fetchAllUpcomingFixtures,
  fetchLiveFixtures,
  fetchUpcomingForCompetitions,
  mapFixture,
  type Fixture,
  type FixtureKind,
} from '@/services/oddAlerts';
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

  const [state, setState] = useState<State>({
    fixtures: [],
    loading: true,
    refreshing: false,
    error: null,
    lastUpdated: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (mode: 'initial' | 'refresh' | 'poll') => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (mode !== 'poll') {
        setState((s) => ({
          ...s,
          loading: mode === 'initial',
          refreshing: mode === 'refresh',
          error: null,
        }));
      }

      try {
        const fixtures = await loadFixtures(
          view,
          {
            resultsDays,
            upcomingDays,
            upcomingScope,
            kind,
            favoriteCompetitionIds: favKey ? favKey.split(',').map(Number) : [],
          },
          controller.signal,
        );
        setState({
          fixtures,
          loading: false,
          refreshing: false,
          error: null,
          lastUpdated: Date.now(),
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setState((s) => ({
          ...s,
          loading: false,
          refreshing: false,
          error: err instanceof Error ? err.message : 'Failed to load fixtures',
        }));
      }
    },
    [view, resultsDays, upcomingDays, upcomingScope, kind, favKey],
  );

  useEffect(() => {
    run('initial');
    return () => abortRef.current?.abort();
  }, [run]);

  useEffect(() => {
    if (view !== 'live' && view !== 'all') return;
    const id = setInterval(() => run('poll'), LIVE_POLL_MS);
    return () => clearInterval(id);
  }, [run, view]);

  const refresh = useCallback(() => {
    run('refresh');
  }, [run]);

  return { ...state, refresh };
}
