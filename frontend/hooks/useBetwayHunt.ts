import { useEffect, useMemo, useState } from 'react';

import {
  fetchBetwayHunt,
  latestSuccessfulBetwayRun,
  type BetwayHuntSnapshot,
} from '@/services/betwayHunt';

type BetwayHuntState = {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  snapshot: BetwayHuntSnapshot | null;
};

export function useBetwayHunt() {
  const [state, setState] = useState<BetwayHuntState>({
    loading: true,
    refreshing: false,
    error: null,
    snapshot: null,
  });

  useEffect(() => {
    let active = true;
    let firstLoad = true;

    const refresh = async () => {
      if (active) {
        setState((current) => ({
          ...current,
          loading: firstLoad,
          refreshing: !firstLoad,
          error: null,
        }));
      }
      try {
        const snapshot = await fetchBetwayHunt();
        if (active) setState({ loading: false, refreshing: false, error: null, snapshot });
      } catch (error) {
        if (active) {
          setState((current) => ({
            ...current,
            loading: false,
            refreshing: false,
            error: error instanceof Error ? error.message : 'Could not read Betway hunt status.',
          }));
        }
      } finally {
        firstLoad = false;
      }
    };

    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const metrics = useMemo(() => {
    const snapshot = state.snapshot;
    const latestRun = snapshot ? latestSuccessfulBetwayRun(snapshot.runs) : null;
    const lastCapture = latestRun ? Date.parse(latestRun.captured_at) : NaN;
    return {
      latestRun,
      stale: !Number.isFinite(lastCapture) || Date.now() - lastCapture > 20 * 60 * 1000,
      suspended: snapshot?.currentEvents.filter((event) =>
        event.fixture_status === 'suspended' || event.market_suspended
      ).length ?? 0,
      openMarkets: snapshot?.currentEvents.filter((event) => event.market_open).length ?? 0,
    };
  }, [state.snapshot]);

  return { ...state, metrics };
}

