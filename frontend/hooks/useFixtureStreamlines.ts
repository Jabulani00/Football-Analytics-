import { useEffect, useMemo, useState } from 'react';

import { cachedFetch } from '@/services/fixtureCache';
import { fetchBook1x2ForFixtures, type Book1x2 } from '@/services/hollywood1x2Board';
import {
  fetchFixtureDetail,
  fetchSeasonStandings,
  type Fixture,
  type RawFixtureDetail,
  type StandingRow,
} from '@/services/oddAlerts';
import { standingRowsToLike, streamForFixture } from '@/utils/fixtureStreamline';
import type { StreamName } from '@/utils/powerDynamicsEngine';
import type { StandingLike } from '@/utils/motivationEngine';

const STANDINGS_TTL_MS = 10 * 60_000;
const DETAIL_TTL_MS = 5 * 60_000;
const MAX_SEASONS = 16;
const MAX_DETAILS = 80;
const DETAIL_CONCURRENCY = 4;

type Tables = Map<number, StandingLike[]>;
type Details = Map<number, RawFixtureDetail | null>;
type Books = Map<number, Book1x2>;

function uniqueSeasonIds(fixtures: Fixture[]): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const f of fixtures) {
    const id = f.seasonId;
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_SEASONS) break;
  }
  return ids;
}

function upcomingForStream(fixtures: Fixture[]): Fixture[] {
  return fixtures.filter((f) => f.status !== 'FT').slice(0, MAX_DETAILS);
}

/**
 * Streamline chips from the same Power Dynamics evaluation as the match screen:
 * league table + fixture-detail H2H/odds/probability + Hollywood 1X2 when OA is empty.
 */
export function useFixtureStreamlines(
  fixtures: Fixture[],
  opts?: { enabled?: boolean; standings?: StandingRow[]; seasonId?: number | null },
): Map<number, StreamName[]> {
  const enabled = opts?.enabled !== false;
  const givenSeasonId = opts?.seasonId ?? null;
  const givenStandings = opts?.standings;
  const [fetched, setFetched] = useState<Tables>(new Map());
  const [details, setDetails] = useState<Details>(new Map());
  const [books, setBooks] = useState<Books>(new Map());
  const [booksReady, setBooksReady] = useState(false);

  const upcoming = useMemo(() => (enabled ? upcomingForStream(fixtures) : []), [enabled, fixtures]);
  const upcomingIds = useMemo(() => upcoming.map((f) => f.id).join(','), [upcoming]);

  const seasonIds = useMemo(() => {
    if (!enabled) return [];
    if (givenStandings && givenStandings.length > 0) return [];
    return uniqueSeasonIds(upcoming);
  }, [enabled, upcoming, givenStandings]);

  const seasonKey = seasonIds.join(',');

  useEffect(() => {
    if (!enabled || seasonIds.length === 0) {
      setFetched(new Map());
      return;
    }
    let active = true;
    Promise.all(
      seasonIds.map(async (id) => {
        try {
          const rows = await cachedFetch(`standings:${id}`, STANDINGS_TTL_MS, () =>
            fetchSeasonStandings(id),
          );
          return [id, standingRowsToLike(rows)] as const;
        } catch {
          return [id, [] as StandingLike[]] as const;
        }
      }),
    ).then((entries) => {
      if (!active) return;
      setFetched(new Map(entries));
    });
    return () => {
      active = false;
    };
  }, [enabled, seasonKey]);

  useEffect(() => {
    if (!enabled || upcoming.length === 0) {
      setDetails(new Map());
      return;
    }
    const controller = new AbortController();
    setDetails(new Map());
    const ids = upcoming.map((f) => f.id);
    let cursor = 0;
    const worker = async () => {
      while (cursor < ids.length && !controller.signal.aborted) {
        const id = ids[cursor++];
        try {
          const detail = await cachedFetch(`pd-detail:${id}`, DETAIL_TTL_MS, () =>
            fetchFixtureDetail(id, controller.signal),
          );
          if (controller.signal.aborted) return;
          setDetails((prev) => {
            const next = new Map(prev);
            next.set(id, detail);
            return next;
          });
        } catch {
          if (controller.signal.aborted) return;
          setDetails((prev) => {
            const next = new Map(prev);
            next.set(id, null);
            return next;
          });
        }
      }
    };
    void Promise.all(
      Array.from({ length: Math.min(DETAIL_CONCURRENCY, ids.length) }, () => worker()),
    );
    return () => controller.abort();
  }, [enabled, upcomingIds]);

  useEffect(() => {
    if (!enabled || upcoming.length === 0) {
      setBooks(new Map());
      setBooksReady(true);
      return;
    }
    const controller = new AbortController();
    setBooksReady(false);
    fetchBook1x2ForFixtures(
      upcoming.map((f) => ({
        id: f.id,
        homeName: f.home.name,
        awayName: f.away.name,
        country: f.competition.country,
        competition: f.competition.name,
        kickoffUnix: f.kickoffUnix,
      })),
      controller.signal,
    )
      .then((next) => {
        if (controller.signal.aborted) return;
        setBooks(next);
        setBooksReady(true);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setBooks(new Map());
        setBooksReady(true);
      });
    return () => controller.abort();
  }, [enabled, upcomingIds]);

  return useMemo(() => {
    const out = new Map<number, StreamName[]>();
    if (!enabled) return out;
    const givenTable =
      givenStandings && givenStandings.length > 0 ? standingRowsToLike(givenStandings) : null;

    for (const f of fixtures) {
      if (f.status === 'FT') {
        out.set(f.id, []);
        continue;
      }
      const tableReady =
        givenTable != null &&
        (givenSeasonId == null || f.seasonId == null || f.seasonId === givenSeasonId);
      const fetchedTable =
        f.seasonId != null && fetched.has(f.seasonId) ? fetched.get(f.seasonId)! : null;
      const table = tableReady ? givenTable! : fetchedTable;
      if (table == null || table.length === 0) {
        out.set(f.id, []);
        continue;
      }
      if (!details.has(f.id) || !booksReady) {
        out.set(f.id, []);
        continue;
      }
      const d = details.get(f.id);
      out.set(
        f.id,
        streamForFixture(f, table, {
          h2hMatches: d?.h2h ?? [],
          odds: d?.odds,
          probability: d?.probability,
          book1x2: books.get(f.id) ?? null,
        }),
      );
    }
    return out;
  }, [enabled, fixtures, fetched, givenStandings, givenSeasonId, details, books, booksReady]);
}
