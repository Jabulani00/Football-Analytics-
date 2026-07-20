import { useEffect, useState } from 'react';

import { fetchAllFixturesBetween, fetchUpcomingFixtures, type RawFixture } from '@/services/oddAlerts';
import { predictFromStats, type FixturePrediction } from '@/services/predictionEngine';
import {
  awayVenue,
  baselineFromResults,
  chunk,
  computeTeamStrengths,
  homeVenue,
} from '@/services/teamForm';

export type PredictedFixture = { fixture: RawFixture; prediction: FixturePrediction | null };

const FINISHED = new Set(['FT', 'AET', 'PEN', 'FT_PEN']);
const DEFAULT_POLL_MS = 5 * 60_000; // keep predictions running on live data
const FORM_LOOKBACK_DAYS = 250; // recent cross-competition form window
const MAX_FIXTURES = 30; // cap fixtures predicted per competition
const TEAMS_PER_REQUEST = 25; // batch team ids into one /fixtures/between call

/**
 * Predicts a competition's upcoming fixtures using each team's CROSS-COMPETITION
 * form (recent matches across all competitions), so cup / international fixtures
 * predict as well as league games. Refreshes on an interval so it keeps
 * generating fresh predictions from live data.
 */
export function useLiveFixturePredictions(opts: {
  competitionId?: number | null;
  seasonName?: string;
  days?: number;
  pollMs?: number;
}): { items: PredictedFixture[]; loading: boolean; error: string | null } {
  const { competitionId, days = 10, pollMs = DEFAULT_POLL_MS } = opts;
  const [items, setItems] = useState<PredictedFixture[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (competitionId == null) return;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const upcomingEnv = await fetchUpcomingFixtures({ days }, ctrl.signal);
        const upcoming = upcomingEnv.data
          .filter((f) => f.competition_id === competitionId && f.home_id && f.away_id)
          .sort((a, b) => a.unix - b.unix)
          .slice(0, MAX_FIXTURES);

        if (upcoming.length === 0) {
          if (!ctrl.signal.aborted) setItems([]);
          return;
        }

        // Distinct team ids across the fixtures we're predicting.
        const teamIds = Array.from(
          new Set(upcoming.flatMap((f) => [f.home_id as number, f.away_id as number])),
        );

        // Batch-fetch each team's cross-competition results.
        const now = Math.floor(Date.now() / 1000);
        const fromUnix = now - FORM_LOOKBACK_DAYS * 86_400;
        const byId = new Map<number, RawFixture>();
        for (const ids of chunk(teamIds, TEAMS_PER_REQUEST)) {
          const rows = await fetchAllFixturesBetween(
            { fromUnix, toUnix: now, teams: ids.join(','), maxPages: 5 },
            ctrl.signal,
          );
          for (const f of rows) byId.set(f.id, f); // dedupe by fixture id
        }
        const results = Array.from(byId.values());

        // Index each team's own finished matches once.
        const teamMatches = new Map<number, RawFixture[]>();
        for (const f of results) {
          if (!FINISHED.has(f.status) || f.home_goals == null || f.away_goals == null) continue;
          for (const id of [f.home_id, f.away_id]) {
            if (id == null) continue;
            const list = teamMatches.get(id) ?? [];
            list.push(f);
            teamMatches.set(id, list);
          }
        }

        const baseline = baselineFromResults(results);
        const strengthOf = (id: number) => computeTeamStrengths(teamMatches.get(id) ?? [], id);

        const predicted: PredictedFixture[] = upcoming.map((fx) => {
          const home = strengthOf(fx.home_id as number);
          const away = strengthOf(fx.away_id as number);
          const prediction =
            home.sample > 0 && away.sample > 0
              ? predictFromStats(homeVenue(home), awayVenue(away), baseline)
              : null;
          return { fixture: fx, prediction };
        });

        if (!ctrl.signal.aborted) setItems(predicted);
      } catch (e: unknown) {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    };

    run();
    if (pollMs > 0) timer = setInterval(run, pollMs);
    return () => {
      ctrl.abort();
      if (timer) clearInterval(timer);
    };
  }, [competitionId, days, pollMs]);

  return { items, loading, error };
}
