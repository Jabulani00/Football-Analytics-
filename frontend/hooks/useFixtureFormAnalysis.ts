import { useEffect, useMemo, useState } from 'react';

import { fetchAllFixturesBetween, type RawFixture } from '@/services/oddAlerts';
import { analyseFixtureLast5, type FixtureLast5 } from '@/utils/last5Analysis';
import {
  evaluateFixtureSeparators,
  type FixtureSeparators,
} from '@/utils/separatorTools';
import type { StandingLike } from '@/utils/motivationEngine';
import { ranksFromStandings, teamResultsFromFixtures } from '@/utils/teamResults';

const FORM_LOOKBACK_DAYS = 120;

type State = {
  loading: boolean;
  error: string | null;
  homeResultsCount: number;
  awayResultsCount: number;
  separators: FixtureSeparators | null;
  last5: FixtureLast5 | null;
};

/**
 * Loads recent finished matches for both sides and runs Section 4 + 5 engines.
 * Additive — failures leave separators/last5 null without breaking the page.
 */
export function useFixtureFormAnalysis(opts: {
  homeId: number | null | undefined;
  awayId: number | null | undefined;
  standings: StandingLike[];
  seasonProgress?: number | null;
  /** Skip fetch when standings empty / cup with no table. */
  enabled?: boolean;
}): State {
  const { homeId, awayId, standings, seasonProgress, enabled = true } = opts;
  const [raw, setRaw] = useState<RawFixture[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canFetch = enabled && (homeId != null || awayId != null);

  useEffect(() => {
    if (!canFetch) {
      setRaw([]);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    const now = Math.floor(Date.now() / 1000);
    const fromUnix = now - FORM_LOOKBACK_DAYS * 86_400;
    const ids = [homeId, awayId].filter((id): id is number => id != null);
    const teams = [...new Set(ids)].join(',');

    fetchAllFixturesBetween({ fromUnix, toUnix: now, teams, maxPages: 4 }, ctrl.signal)
      .then((rows) => {
        if (!ctrl.signal.aborted) {
          setRaw(rows);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setRaw([]);
        setLoading(false);
        setError(err instanceof Error ? err.message : 'Could not load recent form.');
      });

    return () => ctrl.abort();
  }, [canFetch, homeId, awayId]);

  return useMemo(() => {
    if (!canFetch) {
      return {
        loading: false,
        error: null,
        homeResultsCount: 0,
        awayResultsCount: 0,
        separators: null,
        last5: null,
      };
    }

    const ranks = ranksFromStandings(standings);
    const homeResults = homeId != null ? teamResultsFromFixtures(raw, homeId, ranks) : [];
    const awayResults = awayId != null ? teamResultsFromFixtures(raw, awayId, ranks) : [];

    const separators = evaluateFixtureSeparators({
      table: standings,
      homeId,
      awayId,
      homeResults,
      awayResults,
      seasonProgress,
    });

    const last5 = analyseFixtureLast5(homeId, awayId, homeResults, awayResults);

    return {
      loading,
      error,
      homeResultsCount: homeResults.length,
      awayResultsCount: awayResults.length,
      separators,
      last5,
    };
  }, [canFetch, raw, homeId, awayId, standings, seasonProgress, loading, error]);
}
