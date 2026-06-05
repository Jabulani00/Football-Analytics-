import type { FixtureWithLeague } from '@/mock/fixturesData';
import type { League } from '@/mock/leaguesData';
import type { StatusFilter } from '@/components/layout/ScoresFilterContext';

export type LeagueFixtureGroup = {
  league: League;
  fixtures: FixtureWithLeague[];
};

export function filterFixturesByStatus(
  fixtures: FixtureWithLeague[],
  filter: StatusFilter,
): FixtureWithLeague[] {
  if (filter === 'all') return fixtures;
  if (filter === 'live') return fixtures.filter((f) => f.status === 'LIVE' || f.status === 'HT');
  if (filter === 'ft') return fixtures.filter((f) => f.status === 'FT');
  return fixtures.filter((f) => f.status === 'NS');
}

export function groupFixturesByLeague(
  fixtures: FixtureWithLeague[],
  leagues: League[],
): LeagueFixtureGroup[] {
  const byLeague = new Map<string, FixtureWithLeague[]>();
  for (const f of fixtures) {
    const list = byLeague.get(f.leagueId) ?? [];
    list.push(f);
    byLeague.set(f.leagueId, list);
  }

  return leagues
    .filter((l) => byLeague.has(l.id))
    .map((league) => ({
      league,
      fixtures: sortFixturesInGroup(byLeague.get(league.id)!),
    }));
}

function sortFixturesInGroup(fixtures: FixtureWithLeague[]): FixtureWithLeague[] {
  const order = { LIVE: 0, HT: 1, FT: 2, NS: 3 };
  return [...fixtures].sort((a, b) => {
    const sa = order[a.status];
    const sb = order[b.status];
    if (sa !== sb) return sa - sb;
    return a.kickoff.localeCompare(b.kickoff);
  });
}
