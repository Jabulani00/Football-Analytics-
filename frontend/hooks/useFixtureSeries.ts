import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
  fetchAllFixturesBetween,
  seasonWindowUnix,
  type RawFixture,
} from '@/services/oddAlerts';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { oddAlertsKeys } from '@/services/oddAlertsKeys';
import { excludeFixture, teamResultsFromFixtures, type TeamResult } from '@/utils/teamResults';

/** Used when the fixture carries no season name to derive a window from. */
const FALLBACK_LOOKBACK_DAYS = 300;
const EMPTY_RAW: RawFixture[] = [];

type State = {
  loading: boolean;
  error: string | null;
  homeResults: TeamResult[];
  awayResults: TeamResult[];
};

const idle: State = { loading: false, error: null, homeResults: [], awayResults: [] };

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
  const canFetch = enabled && competitionId != null && (homeId != null || awayId != null);
  const teams = [...new Set([homeId, awayId].filter((id): id is number => id != null))].join(',');

  const query = useQuery({
    queryKey: oddAlertsKeys.between({
      competitions: competitionId ?? '',
      seasonId: seasonId ?? 'any',
      seasonName: seasonName ?? '',
      teams,
      maxPages: 2,
      lookbackDays: seasonName ? 0 : FALLBACK_LOOKBACK_DAYS,
    }),
    queryFn: ({ signal }) => {
      const now = Math.floor(Date.now() / 1000);
      const window = seasonName
        ? seasonWindowUnix(seasonName)
        : { fromUnix: now - FALLBACK_LOOKBACK_DAYS * 86_400, toUnix: now };
      return fetchAllFixturesBetween(
        {
          fromUnix: window.fromUnix,
          toUnix: Math.min(window.toUnix, now),
          teams,
          competitions: String(competitionId),
          maxPages: 2,
        },
        signal,
      );
    },
    enabled: canFetch,
    staleTime: clientStaleTime('fixtures/between'),
    placeholderData: keepPreviousData,
  });

  const raw = query.data ?? EMPTY_RAW;

  return useMemo(() => {
    if (!canFetch) return idle;
    const resultOpts = { competitionId, seasonId: seasonId ?? null, includeCup: isCup };
    const resultsFor = (teamId: number | null | undefined) =>
      teamId != null
        ? excludeFixture(teamResultsFromFixtures(raw, teamId, null, resultOpts), excludeFixtureId)
        : [];
    return {
      loading: query.isPending || query.isPlaceholderData,
      error:
        query.error instanceof Error
          ? query.error.message
          : query.error
            ? 'Could not load series history.'
            : null,
      homeResults: resultsFor(homeId),
      awayResults: resultsFor(awayId),
    };
  }, [
    canFetch,
    raw,
    homeId,
    awayId,
    competitionId,
    seasonId,
    isCup,
    excludeFixtureId,
    query.isPending,
    query.isPlaceholderData,
    query.error,
  ]);
}
