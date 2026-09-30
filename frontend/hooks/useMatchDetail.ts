import { useCallback, useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

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
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { oddAlertsKeys } from '@/services/oddAlertsKeys';

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
const EMPTY_TIMING: FixtureGoalTiming = {
  buckets: [],
  periodGoals: [],
  avgFirstGoalMinute: null,
  available: false,
  chartMarkers: [],
};

type MatchBundle = {
  detail: RawFixtureDetail;
  squads: SquadPlayer[];
  standings: StandingRow[];
  events: {
    goals: MatchGoalEvent[];
    timeline: MatchTimelineEvent[];
    configured: boolean;
    matched: boolean;
  };
  goalTiming: FixtureGoalTiming;
};

function isLiveStatus(status: string | undefined): boolean {
  return status === 'LIVE' || status === 'HT' || status === '1H' || status === '2H';
}

export function useMatchDetail(id: string | number): State & { refresh: () => void } {
  const pressureHistoryRef = useRef<PressureSnapshot[]>([]);
  const [pressureHistory, setPressureHistory] = useState<PressureSnapshot[]>([]);
  const [pressureReading, setPressureReading] = useState<State['pressureReading']>(null);
  const [forcing, setForcing] = useState(false);

  const query = useQuery({
    queryKey: oddAlertsKeys.match(id),
    queryFn: async ({ signal }): Promise<MatchBundle | null> => {
      const detail = await fetchFixtureDetail(id, signal);
      if (!detail) return null;
      const [squads, standings, events, goalTiming] = await Promise.all([
        fetchSquads(id, signal).catch(() => [] as SquadPlayer[]),
        detail.season_id
          ? fetchSeasonStandings(detail.season_id, signal).catch(() => [] as StandingRow[])
          : Promise.resolve([] as StandingRow[]),
        fetchMatchEvents(detail, signal).catch(() => ({
          goals: [] as MatchGoalEvent[],
          timeline: [] as MatchTimelineEvent[],
          configured: false,
          matched: false,
        })),
        fetchFixtureGoalTiming(detail, signal),
      ]);
      return { detail, squads, standings, events, goalTiming };
    },
    staleTime: clientStaleTime(`fixtures/${id}`),
    placeholderData: keepPreviousData,
    refetchInterval: (current) => (isLiveStatus(current.state.data?.detail?.status) ? LIVE_POLL_MS : false),
  });

  useEffect(() => {
    const fixtureId = Number(id);
    pressureHistoryRef.current = Number.isFinite(fixtureId) ? loadStoredPressureHistory(fixtureId) : [];
    setPressureHistory([...pressureHistoryRef.current]);
  }, [id]);

  useEffect(() => {
    const detail = query.data?.detail;
    if (!detail || String(detail.id) !== String(id) || query.isPlaceholderData) {
      setPressureReading(null);
      return;
    }
    const reading = readPressureReading(detail);
    setPressureReading(reading);
    if (!reading) return;
    pressureHistoryRef.current = appendPressureSnapshot(pressureHistoryRef.current, reading.current);
    saveStoredPressureHistory(detail.id, pressureHistoryRef.current);
    setPressureHistory([...pressureHistoryRef.current]);
  }, [id, query.data, query.dataUpdatedAt, query.isPlaceholderData]);

  const refresh = useCallback(() => {
    setForcing(true);
    void query.refetch().finally(() => setForcing(false));
  }, [query]);

  const payload = query.data;
  const missing = query.isSuccess && payload == null && !query.isPlaceholderData;
  const fetching = query.isFetching || forcing;

  return {
    detail: payload?.detail ?? null,
    squads: payload?.squads ?? [],
    standings: payload?.standings ?? [],
    goals: payload?.events.goals ?? [],
    timeline: payload?.events.timeline ?? [],
    goalsConfigured: payload?.events.configured ?? false,
    goalsMatched: payload?.events.matched ?? false,
    goalsLoading: fetching,
    goalTiming: payload?.goalTiming ?? EMPTY_TIMING,
    timingLoading: fetching,
    pressureHistory,
    pressureReading,
    loading: query.isPending || query.isPlaceholderData || forcing,
    error: missing
      ? 'Fixture not found.'
      : query.error instanceof Error
        ? query.error.message
        : query.error
          ? 'Failed to load match.'
          : null,
    refresh,
  };
}
