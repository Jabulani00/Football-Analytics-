import { useEffect, useMemo, useState } from 'react';

import { fetchAllFixturesBetween, type RawFixture } from '@/services/oddAlerts';
import { analyseFixtureLast5, type FixtureLast5 } from '@/utils/last5Analysis';
import { evaluateHiddenLayers, type FixtureHiddenLayers } from '@/utils/hiddenLayers';
import {
  evaluateFixtureSeparators,
  type FixtureSeparators,
} from '@/utils/separatorTools';
import type { StandingLike } from '@/utils/motivationEngine';
import {
  ranksFromStandings,
  teamResultsFromFixtures,
  type TeamResult,
} from '@/utils/teamResults';

const FORM_LOOKBACK_DAYS = 120;

type State = {
  loading: boolean;
  error: string | null;
  homeResults: TeamResult[];
  awayResults: TeamResult[];
  separators: FixtureSeparators | null;
  last5: FixtureLast5 | null;
  hidden: FixtureHiddenLayers | null;
};

/**
 * Loads recent finished matches for both sides and runs Sections 4–6 engines.
 * Additive — failures leave analysis null without breaking the page.
 */
export function useFixtureFormAnalysis(opts: {
  homeId: number | null | undefined;
  awayId: number | null | undefined;
  standings: StandingLike[];
  seasonProgress?: number | null;
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
        homeResults: [],
        awayResults: [],
        separators: null,
        last5: null,
        hidden: null,
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

    const hidden = evaluateHiddenLayers({
      table: standings,
      homeId,
      awayId,
      homeResults,
      awayResults,
    });

    return {
      loading,
      error,
      homeResults,
      awayResults,
      separators,
      last5,
      hidden,
    };
  }, [canFetch, raw, homeId, awayId, standings, seasonProgress, loading, error]);
}
