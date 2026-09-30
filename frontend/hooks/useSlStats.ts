import { useEffect, useState } from 'react';

import {
  ALL_LEAGUE_CAP,
  aggregateBoxScores,
  asPercentProgress,
  readBoxScore,
  sampleMatchStats,
  type BoxScore,
  type CompetitionKind,
  type DisciplineFeed,
  type FootyFixture,
} from '@/services/footyMarketStats';
import {
  fetchAllCompetitions,
  fetchAllFixturesBetween,
  fetchAllUpcomingFixtures,
  fetchFixtureMatchStats,
  seasonWindowUnix,
  type Competition,
} from '@/services/oddAlerts';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { oddAlertsKeys } from '@/services/oddAlertsKeys';
import { queryClient } from '@/services/queryClient';

export type SlCatalogComp = {
  id: number;
  name: string;
  country: string;
  isCup: boolean;
  progress: number | null;
  seasonId: number | null;
  seasonName: string | null;
};

export type SlStatsData = {
  loading: boolean;
  statsLoading: boolean;
  error: string | null;
  finished: FootyFixture[];
  upcoming: FootyFixture[];
  discipline: DisciplineFeed | null;
  catalog: SlCatalogComp[];
  loadedLeagues: number;
  capped: boolean;
};

const FINISHED = new Set(['FT', 'AET', 'PEN', 'FT_PEN', 'AWD', 'AWARDED', 'WO', 'AWAITING_UPDATES']);

function isNoise(comp: Competition): boolean {
  return /friendl|reserve|\bu1\d\b|\bu2\d\b|youth/i.test(`${comp.type} ${comp.name}`);
}

function currentSeason(comp: Competition) {
  return comp.seasons.find((s) => s.isCurrent) ?? comp.seasons[0] ?? null;
}

function toCatalog(comp: Competition): SlCatalogComp {
  const season = currentSeason(comp);
  return {
    id: comp.id,
    name: comp.name,
    country: comp.country,
    isCup: comp.isCup,
    progress: asPercentProgress(season?.progress),
    seasonId: season?.seasonId ?? null,
    seasonName: season?.seasonName ?? null,
  };
}

function parseHt(ht: string | null | undefined): [number, number] | null {
  if (!ht) return null;
  const parts = ht.split('-').map((part) => Number.parseInt(part.trim(), 10));
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return null;
  return [parts[0], parts[1]];
}

function toFootyFixture(raw: {
  id: number;
  unix: number;
  status: string;
  competition_id: number;
  competition_name: string;
  competition_country: string;
  is_cup: boolean;
  is_friendly: boolean;
  home_name: string;
  away_name: string;
  home_goals: number | null;
  away_goals: number | null;
  ht_score: string | null;
  season_progress?: number | null;
}, progress: number | null): FootyFixture {
  const ht = parseHt(raw.ht_score);
  const finished = FINISHED.has(raw.status) && raw.home_goals != null && raw.away_goals != null;
  return {
    id: raw.id,
    unix: raw.unix,
    finished,
    competitionId: raw.competition_id,
    competitionName: raw.competition_name,
    country: raw.competition_country,
    isCup: raw.is_cup,
    isFriendly: raw.is_friendly,
    progress: progress ?? asPercentProgress(raw.season_progress),
    homeName: raw.home_name,
    awayName: raw.away_name,
    homeGoals: raw.home_goals,
    awayGoals: raw.away_goals,
    htHome: ht ? ht[0] : null,
    htAway: ht ? ht[1] : null,
  };
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function loadResults(comp: SlCatalogComp): Promise<FootyFixture[]> {
  if (comp.seasonId == null || !comp.seasonName) return [];
  try {
    return await queryClient.fetchQuery({
      queryKey: oddAlertsKeys.between({
        competitions: String(comp.id),
        seasonId: comp.seasonId,
        maxPages: 6,
      }),
      staleTime: clientStaleTime('fixtures/between'),
      queryFn: async () => {
        const { fromUnix, toUnix } = seasonWindowUnix(comp.seasonName as string);
        const raw = await fetchAllFixturesBetween({
          fromUnix,
          toUnix,
          competitions: String(comp.id),
          maxPages: 6,
        });
        return raw.map((fx) => toFootyFixture(fx, comp.progress));
      },
    });
  } catch {
    return [];
  }
}

const EMPTY: SlStatsData = {
  loading: true,
  statsLoading: false,
  error: null,
  finished: [],
  upcoming: [],
  discipline: null,
  catalog: [],
  loadedLeagues: 0,
  capped: false,
};

/** Finished results and corner samples for SL-STATS. Separate from the Footy Stats hook. */
export function useSlStats(filter: {
  country: string | null;
  competitionId: number | null;
  kind: CompetitionKind;
  leagueCap?: number;
}): SlStatsData {
  const { country, competitionId, kind } = filter;
  const leagueCap = filter.leagueCap ?? ALL_LEAGUE_CAP;
  const [data, setData] = useState<SlStatsData>(EMPTY);

  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    setData((prev) => ({ ...EMPTY, catalog: prev.catalog, loading: true }));

    (async () => {
      try {
        const comps = await queryClient.fetchQuery({
          queryKey: oddAlertsKeys.competitions(),
          queryFn: () => fetchAllCompetitions(),
          staleTime: clientStaleTime('competitions'),
        });
        if (!alive) return;
        const catalog = comps.filter((comp) => !isNoise(comp)).map(toCatalog);
        const progressOf = new Map(catalog.map((comp) => [comp.id, comp.progress]));
        const upcomingRaw = await queryClient.fetchQuery({
          queryKey: oddAlertsKeys.upcomingAll({ days: 7, maxPages: 5 }),
          queryFn: () => fetchAllUpcomingFixtures({ days: 7, maxPages: 5 }),
          staleTime: clientStaleTime('fixtures/upcoming'),
        });
        if (!alive) return;
        const activity = new Map<number, number>();
        for (const fx of upcomingRaw) {
          if (!fx.competition_id) continue;
          activity.set(fx.competition_id, (activity.get(fx.competition_id) ?? 0) + 1);
        }
        let targets = catalog.filter((comp) => {
          if (competitionId != null) return comp.id === competitionId;
          if (country && comp.country !== country) return false;
          if (kind === 'domestic' && comp.isCup) return false;
          if (kind === 'cup' && !comp.isCup) return false;
          return activity.has(comp.id);
        });
        let capped = false;
        if (competitionId == null && country == null && kind === 'domestic' && targets.length > leagueCap) {
          targets = [...targets]
            .sort((a, b) => (activity.get(b.id) ?? 0) - (activity.get(a.id) ?? 0) || a.name.localeCompare(b.name))
            .slice(0, leagueCap);
          capped = true;
        }
        const finished = (await mapPool(targets, 4, loadResults)).flat();
        if (!alive) return;
        const horizon = Math.floor(Date.now() / 1000) + 48 * 3600;
        const upcoming = upcomingRaw
          .filter((fx) => fx.unix <= horizon)
          .map((fx) => toFootyFixture(fx, progressOf.get(fx.competition_id) ?? null));
        setData({
          loading: false,
          statsLoading: true,
          error: null,
          finished,
          upcoming,
          catalog,
          discipline: null,
          loadedLeagues: targets.length,
          capped,
        });

        const sample = sampleMatchStats(finished, competitionId);
        const boxes = await mapPool(sample, 6, async (fx) => {
          try {
            const detail = await queryClient.fetchQuery({
              queryKey: oddAlertsKeys.fixture(fx.id, 'stats'),
              queryFn: () => fetchFixtureMatchStats(fx.id),
              staleTime: clientStaleTime(`fixtures/${fx.id}`),
            });
            if (!detail?.stats) return null;
            return readBoxScore(detail.home_name, detail.away_name, detail.stats, {
              competitionId: fx.competitionId,
              competitionName: fx.competitionName,
              country: fx.country,
            });
          } catch {
            return null;
          }
        });
        if (!alive) return;
        const counted = boxes.filter((row): row is BoxScore => row != null);
        setData((prev) => ({
          ...prev,
          discipline: aggregateBoxScores(counted),
          statsLoading: false,
        }));
      } catch (err: unknown) {
        if (!alive || ctrl.signal.aborted) return;
        setData((prev) => ({
          ...prev,
          loading: false,
          statsLoading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    })();

    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [country, competitionId, kind, leagueCap]);

  return data;
}
