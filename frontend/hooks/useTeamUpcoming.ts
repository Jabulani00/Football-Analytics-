import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchTeamUpcoming, type Fixture } from '@/services/oddAlerts';

type State = {
  fixtures: Fixture[];
  loading: boolean;
  error: string | null;
};

export function useTeamUpcoming(teamId: string | number): State & { refresh: () => void } {
  const [state, setState] = useState<State>({ fixtures: [], loading: true, error: null });
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const fixtures = await fetchTeamUpcoming(teamId, controller.signal);
      fixtures.sort((a, b) => a.kickoffUnix - b.kickoffUnix);
      setState({ fixtures, loading: false, error: null });
    } catch (err) {
      if (controller.signal.aborted) return;
      setState({
        fixtures: [],
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load fixtures.',
      });
    }
  }, [teamId]);

  useEffect(() => {
    run();
    return () => abortRef.current?.abort();
  }, [run]);

  return { ...state, refresh: run };
}
