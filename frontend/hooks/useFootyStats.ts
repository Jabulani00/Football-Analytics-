import { useEffect, useState } from 'react';

import { cachedFetch } from '@/services/fixtureCache';
import {
  ALL_LEAGUE_CAP,
  aggregateBoxScores,
  asPercentProgress,
  extractDiscipline,
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
  fetchRawSeasonStats,
  seasonWindowUnix,
  type Competition,
  type RawFixture,
} from '@/services/oddAlerts';

export type FootyCatalogComp = {
  id: number;
  name: string;
  country: string;
  isCup: boolean;
  progress: number | null;
  seasonId: number | null;
  seasonName: string | null;
};

export type FootyStatsData = {
  loading: boolean;
  error: string | null;
  finished: FootyFixture[];
  upcoming: FootyFixture[];
  catalog: FootyCatalogComp[];
  discipline: DisciplineFeed | null;
  statsLoading: boolean;
  loadedLeagues: number;
  capped: boolean;
};

const RESULTS_TTL_MS = 5 * 60_000;
const FINISHED = new Set(['FT', 'AET', 'PEN', 'FT_PEN', 'AWD', 'AWARDED', 'WO', 'AWAITING_UPDATES']);

function isNoise(comp: Competition): boolean {
  return /friendl|reserve|\bu1\d\b|\bu2\d\b|youth/i.test(`${comp.type} ${comp.name}`);
}

function currentSeason(comp: Competition) {
  return comp.seasons.find((s) => s.isCurrent) ?? comp.seasons[0] ?? null;
}

function toCatalog(comp: Competition): FootyCatalogComp {
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

function toFootyFixture(raw: RawFixture, progress: number | null): FootyFixture {
  const ht = parseHt(raw.ht_score);
  const extra = raw as RawFixture & { season_progress?: number | null };
  const finished =
    FINISHED.has(raw.status) && raw.home_goals != null && raw.away_goals != null;
  return {
    id: raw.id,
    unix: raw.unix,
    finished,
    competitionId: raw.competition_id,
    competitionName: raw.competition_name,
    country: raw.competition_country,
    isCup: raw.is_cup,
    isFriendly: raw.is_friendly,
    progress: progress ?? asPercentProgress(extra.season_progress),
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
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

async function loadResults(comp: FootyCatalogComp): Promise<FootyFixture[]> {
  if (comp.seasonId == null || !comp.seasonName) return [];
  const key = `footy:results:${comp.id}:${comp.seasonId}`;
  try {
    return await cachedFetch(key, RESULTS_TTL_MS, async () => {
      const { fromUnix, toUnix } = seasonWindowUnix(comp.seasonName as string);
      const raw = await fetchAllFixturesBetween({
        fromUnix,
        toUnix,
        competitions: String(comp.id),
        maxPages: 6,
      });
      return raw.map((fx) => toFootyFixture(fx, comp.progress));
    });
  } catch {
    return [];
  }
}

const EMPTY: FootyStatsData = {
  loading: true,
  error: null,
  finished: [],
  upcoming: [],
  catalog: [],
  discipline: null,
  statsLoading: false,
  loadedLeagues: 0,
  capped: false,
};

export function useFootyStats(filter: {
  country: string | null;
  competitionId: number | null;
  kind: CompetitionKind;
}): FootyStatsData {
  const { country, competitionId, kind } = filter;
  const [data, setData] = useState<FootyStatsData>(EMPTY);

  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    setData((prev) => ({
      ...prev,
      loading: true,
      error: null,
      finished: [],
      upcoming: [],
      discipline: null,
      statsLoading: false,
    }));

    (async () => {
      try {
        const comps = await fetchAllCompetitions();
        if (!alive) return;
        const catalog = comps.filter((comp) => !isNoise(comp)).map(toCatalog);
        const progressOf = new Map(catalog.map((comp) => [comp.id, comp.progress]));
        if (alive) {
          setData((prev) => ({ ...prev, catalog, loading: true, error: null }));
        }

        const upcomingRaw = await fetchAllUpcomingFixtures({ days: 7, maxPages: 5 }, ctrl.signal);
        if (!alive) return;
        const activity = new Map<number, number>();
        for (const fx of upcomingRaw) {
          if (!fx.competition_id) continue;
          activity.set(fx.competition_id, (activity.get(fx.competition_id) ?? 0) + 1);
        }

        const matchesKind = (comp: FootyCatalogComp) => {
          if (kind === 'domestic' && comp.isCup) return false;
          if (kind === 'cup' && !comp.isCup) return false;
          return true;
        };

        let targets = catalog.filter((comp) => {
          if (competitionId != null) return comp.id === competitionId;
          if (country && comp.country !== country) return false;
          if (!matchesKind(comp)) return false;
          return activity.has(comp.id);
        });

        let capped = false;
        if (competitionId == null && country == null && targets.length > ALL_LEAGUE_CAP) {
          targets = [...targets]
            .sort((a, b) => (activity.get(b.id) ?? 0) - (activity.get(a.id) ?? 0) || a.name.localeCompare(b.name))
            .slice(0, ALL_LEAGUE_CAP);
          capped = true;
        }

        const batches = await mapPool(targets, 4, loadResults);
        if (!alive) return;
        const finished = batches.flat();

        const horizon = Math.floor(Date.now() / 1000) + 48 * 3600;
        const upcoming = upcomingRaw
          .filter((fx) => fx.unix <= horizon)
          .map((fx) => toFootyFixture(fx, progressOf.get(fx.competition_id) ?? null));

        if (!alive) return;
        setData({
          loading: false,
          error: null,
          finished,
          upcoming,
          catalog,
          discipline: null,
          statsLoading: true,
          loadedLeagues: targets.length,
          capped,
        });

        let seasonFeed: DisciplineFeed | null = null;
        if (competitionId != null) {
          const selected = catalog.find((comp) => comp.id === competitionId);
          if (selected?.seasonId != null) {
            try {
              const raw = await cachedFetch(
                `footy:season-raw:${selected.seasonId}`,
                RESULTS_TTL_MS,
                () => fetchRawSeasonStats(selected.seasonId as number),
              );
              seasonFeed = extractDiscipline(raw);
            } catch {
              seasonFeed = extractDiscipline([]);
            }
          }
        }
        const sample = sampleMatchStats(finished, competitionId);
        const boxes = await mapPool(sample, 6, async (fx) => {
          try {
            const detail = await cachedFetch(`footy:box:${fx.id}`, RESULTS_TTL_MS, () =>
              fetchFixtureMatchStats(fx.id),
            );
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
        const matchFeed = aggregateBoxScores(counted);
        const matchHasFigures = matchFeed.hasCorners || matchFeed.hasCards || matchFeed.hasOffsides;
        const discipline = matchHasFigures ? matchFeed : seasonFeed;
        setData((prev) => ({
          ...prev,
          discipline,
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
  }, [country, competitionId, kind]);

  return data;
}
