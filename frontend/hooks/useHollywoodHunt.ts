import { useEffect, useMemo, useState } from 'react';

import {
  coverageReport,
  snapshotFromEventRows,
  type CoverageReport,
  type HwChangeKind,
  type HwChangeRow,
  type HwEventRow,
} from '@/services/hollywoodHunt';
import { huntStoreFromEnv, type CrawlStateRow } from '@/services/huntStore';
import { fetchAllUpcomingFixtures } from '@/services/oddAlerts';

type HuntState = {
  configured: boolean;
  loading: boolean;
  error: string | null;
  changes: HwChangeRow[];
  crawlState: CrawlStateRow[];
  currentEvents: HwEventRow[];
  removedEvents: HwEventRow[];
  coverage: CoverageReport | null;
  coverageError: string | null;
};

const EMPTY: HuntState = {
  configured: false,
  loading: false,
  error: null,
  changes: [],
  crawlState: [],
  currentEvents: [],
  removedEvents: [],
  coverage: null,
  coverageError: null,
};

/** Read the crawler's public, RLS-protected status without exposing a writer key. */
export function useHollywoodHunt(): HuntState & {
  riskByEvent: Record<number, HwChangeKind>;
  lastCrawled: string | null;
} {
  const [state, setState] = useState<HuntState>(EMPTY);

  useEffect(() => {
    const store = huntStoreFromEnv();
    if (!store) {
      setState(EMPTY);
      return;
    }

    let active = true;
    let firstLoad = true;

    const refresh = async () => {
      if (firstLoad) {
        setState((current) => ({ ...current, configured: true, loading: true, error: null }));
      }
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      try {
        const [changes, crawlState, currentEvents, removedEvents] = await Promise.all([
          store.recentChanges(since),
          store.crawlState(),
          store.currentListing({ limit: 1000 }),
          store.removedEvents(100),
        ]);

        let coverage: CoverageReport | null = null;
        let coverageError: string | null = null;
        try {
          const fixtures = await fetchAllUpcomingFixtures({ days: 3, maxPages: 5 });
          coverage = coverageReport(
            fixtures.map((fixture) => ({
              homeName: fixture.home_name,
              awayName: fixture.away_name,
              kickoffUnix: fixture.unix,
              country: fixture.competition_country,
              league: fixture.competition_name,
              fixtureId: fixture.id,
            })),
            snapshotFromEventRows(currentEvents),
          );
        } catch (error) {
          coverageError = error instanceof Error ? error.message : 'Coverage comparison is unavailable.';
        }

        if (active) {
          setState({
            configured: true,
            loading: false,
            error: null,
            changes,
            crawlState,
            currentEvents,
            removedEvents,
            coverage,
            coverageError,
          });
        }
      } catch (error) {
        if (active) {
          setState((current) => ({
            ...current,
            configured: true,
            loading: false,
            error: error instanceof Error ? error.message : 'Could not read Hollywood hunt status.',
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

  const riskByEvent = useMemo(() => {
    const result: Record<number, HwChangeKind> = {};
    for (const change of state.changes) {
      // API order is newest-first, so keep the first signal per event.
      if (!(change.event_id in result)) result[change.event_id] = change.kind;
    }
    return result;
  }, [state.changes]);

  const lastCrawled = useMemo(() => {
    const values = state.crawlState
      .map((row) => row.last_succeeded ?? row.last_crawled)
      .filter((value): value is string => value != null)
      .sort();
    return values.at(-1) ?? null;
  }, [state.crawlState]);

  return { ...state, riskByEvent, lastCrawled };
}
