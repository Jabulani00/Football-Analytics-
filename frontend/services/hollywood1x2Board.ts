import { cachedFetch } from '@/services/fixtureCache';
import {
  BET_TYPE,
  decimal1x2,
  fetchEvents,
  fetchSoccerCategories,
  fetchTournaments,
  type HbEvent,
} from '@/services/hollywoodbets';
import { matchFixtureToEvent, nameSimilarity, normalizeTeam } from '@/services/hollywoodMatch';

const BOARD_TTL_MS = 5 * 60_000;

export type Book1x2 = { home: number; away: number; draw: number };

export type Book1x2Fixture = {
  id: number;
  homeName: string;
  awayName: string;
  country: string;
  competition: string;
  kickoffUnix: number;
};

function bestByName<T extends { name: string }>(rows: T[], target: string): T | null {
  const want = normalizeTeam(target);
  if (!want) return null;
  let best: { row: T; score: number } | null = null;
  for (const row of rows) {
    const score = nameSimilarity(want, normalizeTeam(row.name));
    if (score < 0.4) continue;
    if (!best || score > best.score) best = { row, score };
  }
  return best?.row ?? null;
}

async function eventsForLeague(
  country: string,
  competition: string,
  signal?: AbortSignal,
): Promise<HbEvent[]> {
  const key = `hb:events:${country.toLowerCase()}|${competition.toLowerCase()}`;
  return cachedFetch(key, BOARD_TTL_MS, async () => {
    const categories = await cachedFetch('hb:categories', BOARD_TTL_MS, () =>
      fetchSoccerCategories(signal),
    );
    const category =
      (country ? bestByName(categories, country) : null) ??
      categories.find((c) => /england|united kingdom|uk/i.test(c.name)) ??
      null;
    if (!category) return [];
    const { tournaments } = await fetchTournaments(category.id, signal);
    const tournament =
      (competition ? bestByName(tournaments, competition) : null) ??
      tournaments.find((t) => /premier league/i.test(t.name)) ??
      tournaments[0];
    if (!tournament) return [];
    return fetchEvents(category.id, tournament.id, BET_TYPE.FULL_TIME, signal);
  });
}

/**
 * Hollywoodbets 1X2 for a list of fixtures, one events fetch per league.
 * Same matching rules as the match-screen Power Dynamics fallback.
 */
export async function fetchBook1x2ForFixtures(
  fixtures: Book1x2Fixture[],
  signal?: AbortSignal,
): Promise<Map<number, Book1x2>> {
  const out = new Map<number, Book1x2>();
  if (fixtures.length === 0) return out;

  const groups = new Map<string, Book1x2Fixture[]>();
  for (const f of fixtures) {
    const key = `${f.country.toLowerCase()}|${f.competition.toLowerCase()}`;
    const list = groups.get(key) ?? [];
    list.push(f);
    groups.set(key, list);
  }

  await Promise.all(
    [...groups.values()].map(async (group) => {
      const first = group[0];
      try {
        const events = await eventsForLeague(first.country, first.competition, signal);
        for (const f of group) {
          const hit = matchFixtureToEvent(
            { homeName: f.homeName, awayName: f.awayName, kickoffUnix: f.kickoffUnix },
            events,
          );
          const decimal = hit ? decimal1x2(hit.event) : null;
          if (decimal) out.set(f.id, decimal);
        }
      } catch {
        // Leave unmatched fixtures without a board — PD will use model 1X2 if present.
      }
    }),
  );
  return out;
}
