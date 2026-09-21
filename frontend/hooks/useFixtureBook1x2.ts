import { useEffect, useState } from 'react';

import { BET_TYPE, decimal1x2, fetchEvents, fetchSoccerCategories, fetchTournaments } from '@/services/hollywoodbets';
import { matchFixtureToEvent, nameSimilarity, normalizeTeam } from '@/services/hollywoodMatch';

export type Book1x2 = { home: number; away: number; draw: number };

type State = {
  prices: Book1x2 | null;
  loading: boolean;
  error: string | null;
};

const EMPTY: State = { prices: null, loading: false, error: null };

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

/**
 * Bookmaker 1X2 for one fixture from Hollywoodbets, used when OddAlerts
 * `include=odds` comes back empty (common on upcoming EPL games).
 */
export function useFixtureBook1x2(opts: {
  homeName: string;
  awayName: string;
  country?: string;
  competition?: string;
  kickoffUnix?: number;
  enabled?: boolean;
}): State {
  const { homeName, awayName, country, competition, kickoffUnix, enabled = true } = opts;
  const [state, setState] = useState<State>(EMPTY);

  useEffect(() => {
    if (!enabled || !homeName || !awayName) {
      setState(EMPTY);
      return;
    }
    const controller = new AbortController();
    setState({ ...EMPTY, loading: true });

    (async () => {
      try {
        const categories = await fetchSoccerCategories(controller.signal);
        const category =
          (country ? bestByName(categories, country) : null) ??
          categories.find((c) => /england|united kingdom|uk/i.test(c.name)) ??
          null;
        if (!category) {
          if (!controller.signal.aborted) setState({ ...EMPTY, error: 'No Hollywoodbets country for this league.' });
          return;
        }
        const { tournaments } = await fetchTournaments(category.id, controller.signal);
        const tournament =
          (competition ? bestByName(tournaments, competition) : null) ??
          tournaments.find((t) => /premier league/i.test(t.name)) ??
          tournaments[0];
        if (!tournament) {
          if (!controller.signal.aborted) setState({ ...EMPTY, error: 'No Hollywoodbets tournament for this league.' });
          return;
        }
        const events = await fetchEvents(category.id, tournament.id, BET_TYPE.FULL_TIME, controller.signal);
        const hit = matchFixtureToEvent(
          { homeName, awayName, kickoffUnix },
          events,
        );
        const decimal = hit ? decimal1x2(hit.event) : null;
        if (!decimal) {
          if (!controller.signal.aborted) setState({ ...EMPTY, error: 'No Hollywoodbets 1X2 for this fixture.' });
          return;
        }
        if (!controller.signal.aborted) {
          setState({
            prices: { home: decimal.home, away: decimal.away, draw: decimal.draw },
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({
          ...EMPTY,
          error: err instanceof Error ? err.message : 'Failed to load bookmaker 1X2 odds.',
        });
      }
    })();

    return () => controller.abort();
  }, [enabled, homeName, awayName, country, competition, kickoffUnix]);

  return state;
}
