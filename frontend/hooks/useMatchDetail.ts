import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchMatchGoals, type MatchGoalEvent } from '@/services/apiFootball';
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
  goals: MatchGoalEvent[];
  goalsConfigured: boolean;
  goalsMatched: boolean;
  goalsLoading: boolean;
  loading: boolean;
  error: string | null;
};

const LIVE_POLL_MS = 30_000;

export function useMatchDetail(id: string | number): State & { refresh: () => void } {
  const [state, setState] = useState<State>({
    detail: null,
    squads: [],
    standings: [],
    goals: [],
    goalsConfigured: false,
    goalsMatched: false,
    goalsLoading: false,
    loading: true,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (initial: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (initial) {
        setState((s) => ({ ...s, loading: true, goalsLoading: true, error: null }));
      } else {
        setState((s) => ({ ...s, goalsLoading: true }));
      }

      try {
        const detail = await fetchFixtureDetail(id, controller.signal);
        if (!detail) {
          setState((s) => ({ ...s, loading: false, error: 'Fixture not found.' }));
          return;
        }

        // Squads and standings are best-effort; failures shouldn't blank the page.
        const [squads, standings, events] = await Promise.all([
          fetchSquads(id, controller.signal).catch(() => [] as SquadPlayer[]),
          detail.season_id
            ? fetchSeasonStandings(detail.season_id, controller.signal).catch(
                () => [] as StandingRow[],
              )
            : Promise.resolve([] as StandingRow[]),
          fetchMatchGoals(detail, controller.signal).catch(() => ({
            goals: [] as MatchGoalEvent[],
            configured: false,
            matched: false,
          })),
        ]);

        setState({
          detail,
          squads,
          standings,
          goals: events.goals,
          goalsConfigured: events.configured,
          goalsMatched: events.matched,
          goalsLoading: false,
          loading: false,
          error: null,
        });
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
