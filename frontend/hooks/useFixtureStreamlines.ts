import { useEffect, useMemo, useState } from 'react';

import { cachedFetch } from '@/services/fixtureCache';
import { fetchSeasonStandings, type Fixture, type StandingRow } from '@/services/oddAlerts';
import {
  h2hFromFinishedFixtures,
  standingRowsToLike,
  streamForFixture,
} from '@/utils/fixtureStreamline';
import type { StreamName } from '@/utils/powerDynamicsEngine';
import type { StandingLike } from '@/utils/motivationEngine';

const STANDINGS_TTL_MS = 10 * 60_000;
const MAX_SEASONS = 16;

type Tables = Map<number, StandingLike[]>;

function uniqueSeasonIds(fixtures: Fixture[]): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const f of fixtures) {
    if (f.competition.isCup || f.competition.isFriendly) continue;
    const id = f.seasonId;
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_SEASONS) break;
  }
  return ids;
}

/**
 * Primary Streamline per upcoming fixture, from each season's league table
 * (cached) plus any finished fixtures in the same batch as same-season H2H.
 */
export function useFixtureStreamlines(
  fixtures: Fixture[],
  opts?: { enabled?: boolean; standings?: StandingRow[]; seasonId?: number | null },
): Map<number, StreamName | null> {
  const enabled = opts?.enabled !== false;
  const givenSeasonId = opts?.seasonId ?? null;
  const givenStandings = opts?.standings;
  const [fetched, setFetched] = useState<Tables>(new Map());

  const seasonIds = useMemo(() => {
    if (!enabled) return [];
    if (givenStandings && givenStandings.length > 0) return [];
    return uniqueSeasonIds(fixtures);
  }, [enabled, fixtures, givenStandings, givenSeasonId]);

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

  return useMemo(() => {
    const out = new Map<number, StreamName | null>();
    if (!enabled) return out;
    const h2h = h2hFromFinishedFixtures(fixtures);
    const givenTable =
      givenStandings && givenStandings.length > 0 ? standingRowsToLike(givenStandings) : null;

    for (const f of fixtures) {
      if (f.status === 'FT') {
        out.set(f.id, null);
        continue;
      }
      const table =
        givenTable && (givenSeasonId == null || f.seasonId == null || f.seasonId === givenSeasonId)
          ? givenTable
          : f.seasonId != null
            ? (fetched.get(f.seasonId) ?? [])
            : [];
      out.set(f.id, streamForFixture(f, table, h2h));
    }
    return out;
  }, [enabled, fixtures, fetched, givenStandings, givenSeasonId]);
}
