import { useEffect, useState } from 'react';

import { fetchSoccerCategories, fetchTournaments, type HbCategory, type HbTournament } from '@/services/hollywoodbets';

type State = {
  categories: HbCategory[];
  tournaments: HbTournament[];
  loadingCategories: boolean;
  loadingTournaments: boolean;
  error: string | null;
};

const INITIAL: State = {
  categories: [],
  tournaments: [],
  loadingCategories: false,
  loadingTournaments: false,
  error: null,
};

/**
 * Loads the Hollywoodbets soccer navigation: all countries/categories, then the
 * tournaments for whichever `categoryId` is selected.
 */
export function useHollywoodNav(categoryId: number | null): State {
  const [state, setState] = useState<State>(INITIAL);

  // Categories (once).
  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loadingCategories: true, error: null }));
    fetchSoccerCategories(controller.signal)
      .then((categories) => {
        if (!controller.signal.aborted) setState((s) => ({ ...s, categories, loadingCategories: false }));
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setState((s) => ({
            ...s,
            loadingCategories: false,
            error: err instanceof Error ? err.message : 'Failed to load countries.',
          }));
        }
      });
    return () => controller.abort();
  }, []);

  // Tournaments for the selected category.
  useEffect(() => {
    if (categoryId == null) {
      setState((s) => ({ ...s, tournaments: [] }));
      return;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, loadingTournaments: true, tournaments: [] }));
    fetchTournaments(categoryId, controller.signal)
      .then(({ tournaments }) => {
        if (!controller.signal.aborted) setState((s) => ({ ...s, tournaments, loadingTournaments: false }));
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setState((s) => ({
            ...s,
            loadingTournaments: false,
            error: err instanceof Error ? err.message : 'Failed to load leagues.',
          }));
        }
      });
    return () => controller.abort();
  }, [categoryId]);

  return state;
}
