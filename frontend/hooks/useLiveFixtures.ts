import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchAllFixturesBetween,
  fetchLiveFixtures,
  fetchUpcomingFixtures,
  mapFixture,
  type Fixture,
} from '@/services/oddAlerts';

export type ScoresView = 'all' | 'live' | 'ft' | 'ns';

type Options = {
  /** Look-back window (days) for the results/finished view. */
  resultsDays?: number;
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
  opts: Required<Options>,
  signal: AbortSignal,
): Promise<Fixture[]> {
  if (view === 'ns') {
    const upcoming = await fetchUpcomingFixtures({ days: 2 }, signal);
    return upcoming.data.map(mapFixture);
  }

  if (view === 'ft') {
    // Results: finished games across all leagues in the look-back window.
    const now = Math.floor(Date.now() / 1000);
    const from = now - opts.resultsDays * 86_400;
    const raw = await fetchAllFixturesBetween({ fromUnix: from, toUnix: now }, signal);
    return raw.map(mapFixture).filter((f) => f.status === 'FT');
  }

  if (view === 'live') {
    const live = await fetchLiveFixtures(signal);
    return live.data.map(mapFixture).filter((f) => f.status === 'LIVE' || f.status === 'HT');
  }

  // 'all' — live/finished now, followed by the soonest upcoming games.
  const [live, upcoming] = await Promise.all([
    fetchLiveFixtures(signal),
    fetchUpcomingFixtures({ days: 1 }, signal),
  ]);
  return [...live.data.map(mapFixture), ...upcoming.data.map(mapFixture)];
}

/**
 * Fetches fixtures for the given view and auto-refreshes while live games are
 * relevant (the `all`/`live`/`ft` views poll every ~25s).
 */
export function useLiveFixtures(
  view: ScoresView,
  options: Options = {},
): State & { refresh: () => void } {
  const resultsDays = options.resultsDays ?? 1;
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
        const fixtures = await loadFixtures(view, { resultsDays }, controller.signal);
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
    [view, resultsDays],
  );

  useEffect(() => {
    run('initial');
    return () => abortRef.current?.abort();
  }, [run]);

  useEffect(() => {
    // Only the live-bearing views need auto-refresh.
    if (view !== 'live' && view !== 'all') return;
    const id = setInterval(() => run('poll'), LIVE_POLL_MS);
    return () => clearInterval(id);
  }, [run, view]);

  const refresh = useCallback(() => {
    run('refresh');
  }, [run]);

  return { ...state, refresh };
}
