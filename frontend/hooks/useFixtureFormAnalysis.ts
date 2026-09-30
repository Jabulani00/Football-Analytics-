import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { fetchAllFixturesBetween, type RawFixture } from '@/services/oddAlerts';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { oddAlertsKeys } from '@/services/oddAlertsKeys';
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
const EMPTY_RAW: RawFixture[] = [];

type State = {
  loading: boolean;
  error: string | null;
  homeResults: TeamResult[];
  awayResults: TeamResult[];
  separators: FixtureSeparators | null;
  last5: FixtureLast5 | null;
  hidden: FixtureHiddenLayers | null;
};

const idle: State = {
  loading: false,
  error: null,
  homeResults: [],
  awayResults: [],
  separators: null,
  last5: null,
  hidden: null,
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
  /** When set, only this league — cups and friendlies are dropped. */
  competitionId?: number | string | null;
  /** When set, last-season games in the same league are dropped. */
  seasonId?: number | string | null;
  enabled?: boolean;
}): State {
  const { homeId, awayId, standings, seasonProgress, competitionId, seasonId, enabled = true } = opts;
  const canFetch = enabled && (homeId != null || awayId != null);
  const teams = [...new Set([homeId, awayId].filter((id): id is number => id != null))].join(',');
  const competition =
    competitionId != null && competitionId !== '' ? String(competitionId) : undefined;

  const query = useQuery({
    queryKey: oddAlertsKeys.between({
      teams,
      competitions: competition ?? '',
      lookbackDays: FORM_LOOKBACK_DAYS,
      maxPages: 4,
    }),
    queryFn: ({ signal }) => {
      const now = Math.floor(Date.now() / 1000);
      const fromUnix = now - FORM_LOOKBACK_DAYS * 86_400;
      return fetchAllFixturesBetween(
        {
          fromUnix,
          toUnix: now,
          teams,
          competitions: competition,
          maxPages: 4,
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

    const ranks = ranksFromStandings(standings);
    const leagueId =
      competitionId != null && competitionId !== '' ? Number(competitionId) : null;
    const season =
      seasonId != null && seasonId !== '' ? Number(seasonId) : null;
    const leagueOpts =
      Number.isFinite(leagueId) || Number.isFinite(season)
        ? {
            competitionId: Number.isFinite(leagueId) ? leagueId : null,
            seasonId: Number.isFinite(season) ? season : null,
          }
        : undefined;
    const homeResults = homeId != null ? teamResultsFromFixtures(raw, homeId, ranks, leagueOpts) : [];
    const awayResults = awayId != null ? teamResultsFromFixtures(raw, awayId, ranks, leagueOpts) : [];

    return {
      loading: query.isPending || query.isPlaceholderData,
      error:
        query.error instanceof Error
          ? query.error.message
          : query.error
            ? 'Could not load recent form.'
            : null,
      homeResults,
      awayResults,
      separators: evaluateFixtureSeparators({
        table: standings,
        homeId,
        awayId,
        homeResults,
        awayResults,
        seasonProgress,
      }),
      last5: analyseFixtureLast5(homeId, awayId, homeResults, awayResults),
      hidden: evaluateHiddenLayers({
        table: standings,
        homeId,
        awayId,
        homeResults,
        awayResults,
      }),
    };
  }, [
    canFetch,
    raw,
    homeId,
    awayId,
    standings,
    seasonProgress,
    competitionId,
    seasonId,
    query.isPending,
    query.isPlaceholderData,
    query.error,
  ]);
}
