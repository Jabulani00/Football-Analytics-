import { useEffect, useMemo, useState } from 'react';

import { cachedFetch } from '@/services/fixtureCache';
import {
  fetchAllFixturesBetween,
  seasonWindowUnix,
  type RawFixture,
} from '@/services/oddAlerts';
import { excludeFixture, teamResultsFromFixtures, type TeamResult } from '@/utils/teamResults';

/** Used when the fixture carries no season name to derive a window from. */
const FALLBACK_LOOKBACK_DAYS = 300;

/** Re-selecting the same fixture inside this window reuses the fetch. */
const CACHE_TTL_MS = 10 * 60 * 1000;

type State = {
  loading: boolean;
  error: string | null;
  homeResults: TeamResult[];
  awayResults: TeamResult[];
};

/**
 * Season- and competition-scoped finished results for both sides of a fixture,
 * for the Series panel.
 *
 * Deliberately separate from `useFixtureFormAnalysis`, which uses a 120-day
 * rolling window across all competitions and is shared by the Summary form
 * panel, Core comparison and Power dynamics. Series need a full-season,
 * league-only feed so a long run is not truncated by the lookback.
 */
export function useFixtureSeries(opts: {
  homeId: number | null | undefined;
  awayId: number | null | undefined;
  competitionId: number | null | undefined;
  seasonId: number | null | undefined;
  seasonName: string | null | undefined;
  isCup?: boolean;
  /**
   * The fixture being viewed. A finished match falls inside its own season
   * window, so it must be dropped for the run to describe form going INTO it.
   */
  excludeFixtureId?: number | null;
  enabled?: boolean;
}): State {
  const {
    homeId,
    awayId,
    competitionId,
    seasonId,
    seasonName,
    isCup,
    excludeFixtureId,
    enabled = true,
  } = opts;
  const [raw, setRaw] = useState<RawFixture[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canFetch = enabled && competitionId != null && (homeId != null || awayId != null);

  useEffect(() => {
    if (!canFetch) {
      setRaw([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const now = Math.floor(Date.now() / 1000);
    const window = seasonName
      ? seasonWindowUnix(seasonName)
      : { fromUnix: now - FALLBACK_LOOKBACK_DAYS * 86_400, toUnix: now };
    const fromUnix = window.fromUnix;
    const toUnix = Math.min(window.toUnix, now); // no point paging future fixtures
    const teams = [...new Set([homeId, awayId].filter((id): id is number => id != null))].join(',');
    const key = `series:${competitionId}:${seasonId ?? 'any'}:${teams}:${fromUnix}:${toUnix}`;

    cachedFetch(key, CACHE_TTL_MS, () =>
      fetchAllFixturesBetween({
        fromUnix,
        toUnix,
        teams,
        competitions: String(competitionId),
        // `teams` narrows the feed to two clubs, so a season fits in one page.
        maxPages: 2,
      }),
    )
      .then((rows) => {
        if (cancelled) return;
        setRaw(rows);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setRaw([]);
        setLoading(false);
        setError(err instanceof Error ? err.message : 'Could not load series history.');
      });

    return () => {
      cancelled = true;
    };
  }, [canFetch, homeId, awayId, competitionId, seasonId, seasonName]);

  return useMemo(() => {
    if (!canFetch) {
      return { loading: false, error: null, homeResults: [], awayResults: [] };
    }
    // Series are opponent-agnostic, so no standings ranks are needed.
    const resultOpts = { competitionId, seasonId: seasonId ?? null, includeCup: isCup };
    const resultsFor = (teamId: number | null | undefined) =>
      teamId != null
        ? excludeFixture(teamResultsFromFixtures(raw, teamId, null, resultOpts), excludeFixtureId)
        : [];
    return {
      loading,
      error,
      homeResults: resultsFor(homeId),
      awayResults: resultsFor(awayId),
    };
  }, [canFetch, raw, homeId, awayId, competitionId, seasonId, isCup, excludeFixtureId, loading, error]);
}
