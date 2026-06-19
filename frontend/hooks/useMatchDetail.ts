import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchFixtureDetail,
  fetchSeasonStandings,
  fetchSquads,
  type RawFixtureDetail,
  type SquadPlayer,
  type StandingRow,
} from '@/services/oddAlerts';

type State = {
  detail: RawFixtureDetail | null;
  squads: SquadPlayer[];
  standings: StandingRow[];
  loading: boolean;
  error: string | null;
};

const LIVE_POLL_MS = 30_000;

export function useMatchDetail(id: string | number): State & { refresh: () => void } {
  const [state, setState] = useState<State>({
    detail: null,
    squads: [],
    standings: [],
    loading: true,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (initial: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (initial) setState((s) => ({ ...s, loading: true, error: null }));

      try {
        const detail = await fetchFixtureDetail(id, controller.signal);
        if (!detail) {
          setState((s) => ({ ...s, loading: false, error: 'Fixture not found.' }));
          return;
        }

        // Squads and standings are best-effort; failures shouldn't blank the page.
        const [squads, standings] = await Promise.all([
          fetchSquads(id, controller.signal).catch(() => [] as SquadPlayer[]),
          detail.season_id
            ? fetchSeasonStandings(detail.season_id, controller.signal).catch(
                () => [] as StandingRow[],
              )
            : Promise.resolve([] as StandingRow[]),
        ]);

        setState({ detail, squads, standings, loading: false, error: null });
      } catch (err) {
        if (controller.signal.aborted) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load match.',
        }));
      }
    },
    [id],
  );

  useEffect(() => {
    run(true);
    return () => abortRef.current?.abort();
  }, [run]);

  // Refresh live matches periodically.
  useEffect(() => {
    const live = state.detail?.status;
    const isLive = live === 'LIVE' || live === 'HT' || live === '1H' || live === '2H';
    if (!isLive) return;
    const timer = setInterval(() => run(false), LIVE_POLL_MS);
    return () => clearInterval(timer);
  }, [run, state.detail?.status]);

  return { ...state, refresh: () => run(true) };
}
