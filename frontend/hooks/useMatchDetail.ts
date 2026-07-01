import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchMatchEvents, type MatchGoalEvent, type MatchTimelineEvent } from '@/services/apiFootball';
import {
  appendPressureSnapshot,
  loadStoredPressureHistory,
  readPressureReading,
  saveStoredPressureHistory,
  type PressureSnapshot,
} from '@/utils/pressureMonitor';
import {
  fetchFixtureDetail,
  fetchFixtureGoalTiming,
  fetchSeasonStandings,
  fetchSquads,
  type FixtureGoalTiming,
  type RawFixtureDetail,
  type SquadPlayer,
  type StandingRow,
} from '@/services/oddAlerts';

type State = {
  detail: RawFixtureDetail | null;
  squads: SquadPlayer[];
  standings: StandingRow[];
  goals: MatchGoalEvent[];
  timeline: MatchTimelineEvent[];
  goalsConfigured: boolean;
  goalsMatched: boolean;
  goalsLoading: boolean;
  goalTiming: FixtureGoalTiming;
  timingLoading: boolean;
  pressureHistory: PressureSnapshot[];
  pressureReading: ReturnType<typeof readPressureReading>;
  loading: boolean;
  error: string | null;
};

const LIVE_POLL_MS = 60_000;

export function useMatchDetail(id: string | number): State & { refresh: () => void } {
  const pressureHistoryRef = useRef<PressureSnapshot[]>([]);
  const [state, setState] = useState<State>({
    detail: null,
    squads: [],
    standings: [],
    goals: [],
    timeline: [],
    goalsConfigured: false,
    goalsMatched: false,
    goalsLoading: false,
    goalTiming: { buckets: [], periodGoals: [], avgFirstGoalMinute: null, available: false, chartMarkers: [] },
    timingLoading: false,
    pressureHistory: [],
    pressureReading: null,
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
        setState((s) => ({ ...s, loading: true, goalsLoading: true, timingLoading: true, error: null }));
      } else {
        setState((s) => ({ ...s, goalsLoading: true, timingLoading: true }));
      }

      try {
        const detail = await fetchFixtureDetail(id, controller.signal);
        if (!detail) {
          setState((s) => ({ ...s, loading: false, error: 'Fixture not found.' }));
          return;
        }

        // Squads and standings are best-effort; failures shouldn't blank the page.
        const [squads, standings, events, goalTiming] = await Promise.all([
          fetchSquads(id, controller.signal).catch(() => [] as SquadPlayer[]),
          detail.season_id
            ? fetchSeasonStandings(detail.season_id, controller.signal).catch(
                () => [] as StandingRow[],
              )
            : Promise.resolve([] as StandingRow[]),
          fetchMatchEvents(detail, controller.signal).catch(() => ({
            goals: [] as MatchGoalEvent[],
            timeline: [] as MatchTimelineEvent[],
            configured: false,
            matched: false,
          })),
          fetchFixtureGoalTiming(detail, controller.signal),
        ]);

        const pressureReading = readPressureReading(detail);
        if (pressureReading) {
          pressureHistoryRef.current = appendPressureSnapshot(
            pressureHistoryRef.current,
            pressureReading.current,
          );
          saveStoredPressureHistory(detail.id, pressureHistoryRef.current);
        }

        setState({
          detail,
          squads,
          standings,
          goals: events.goals,
          timeline: events.timeline,
          goalsConfigured: events.configured,
          goalsMatched: events.matched,
          goalsLoading: false,
          goalTiming,
          timingLoading: false,
          pressureHistory: [...pressureHistoryRef.current],
          pressureReading,
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
    const fixtureId = Number(id);
    pressureHistoryRef.current = Number.isFinite(fixtureId)
      ? loadStoredPressureHistory(fixtureId)
      : [];
  }, [id]);

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
