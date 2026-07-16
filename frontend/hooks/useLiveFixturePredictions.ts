import { useEffect, useState } from 'react';

import {
  fetchAllFixturesBetween,
  fetchUpcomingFixtures,
  seasonWindowUnix,
  type RawFixture,
} from '@/services/oddAlerts';
import { buildStatsTables } from '@/services/statsBuilder';
import {
  predictFromStats,
  type FixturePrediction,
  type LeagueBaseline,
} from '@/services/predictionEngine';
import type { TeamStatRow } from '@/types/data';

export type PredictedFixture = { fixture: RawFixture; prediction: FixturePrediction | null };

const FINISHED = new Set(['FT', 'AET', 'PEN', 'FT_PEN']);
const DEFAULT_POLL_MS = 5 * 60_000; // keep predictions running on live data

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** League home/away goal averages from finished results. */
function computeBaseline(results: RawFixture[]): LeagueBaseline {
  let home = 0, away = 0, n = 0;
  for (const f of results) {
    if (!FINISHED.has(f.status) || f.home_goals == null || f.away_goals == null) continue;
    home += f.home_goals; away += f.away_goals; n += 1;
  }
  if (n >= 20) return { homeAvg: home / n, awayAvg: away / n, measured: true };
  return { homeAvg: 1.45, awayAvg: 1.15, measured: false };
}

function indexByTeam(rows: TeamStatRow[] | undefined): Map<string, TeamStatRow> {
  const map = new Map<string, TeamStatRow>();
  for (const r of rows ?? []) map.set(String(r.team_name), r);
  return map;
}

/**
 * Runs the prediction engine over a competition's upcoming fixtures, using stat
 * tables built live from the API. Refreshes on an interval so it keeps
 * generating fresh predictions from live data.
 */
export function useLiveFixturePredictions(opts: {
  competitionId?: number | null;
  seasonName?: string;
  days?: number;
  pollMs?: number;
}): { items: PredictedFixture[]; loading: boolean; error: string | null } {
  const { competitionId, seasonName, days = 10, pollMs = DEFAULT_POLL_MS } = opts;
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
        const { fromUnix, toUnix } = seasonWindowUnix(seasonName ?? '');
        const [results, upcomingEnv] = await Promise.all([
          fetchAllFixturesBetween(
            { fromUnix, toUnix, competitions: String(competitionId), maxPages: 6 },
            ctrl.signal,
          ),
          fetchUpcomingFixtures({ days }, ctrl.signal),
        ]);

        const tables = buildStatsTables({ fixtures: results, season: seasonName });
        const baseline = computeBaseline(results);
        const homeRows = indexByTeam(tables.tables['ordinary_ft_home']);
        const awayRows = indexByTeam(tables.tables['ordinary_ft_away']);

        const upcoming = upcomingEnv.data
          .filter((f) => f.competition_id === competitionId)
          .sort((a, b) => a.unix - b.unix);

        const predicted: PredictedFixture[] = upcoming.map((fx) => {
          const h = homeRows.get(fx.home_name);
          const a = awayRows.get(fx.away_name);
          const prediction =
            h && a
              ? predictFromStats(
                  { scAvg: num(h.sc_avg), concAvg: num(h.conc_avg), sample: num((h as Record<string, unknown>).sample_size) },
                  { scAvg: num(a.sc_avg), concAvg: num(a.conc_avg), sample: num((a as Record<string, unknown>).sample_size) },
                  baseline,
                )
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
  }, [competitionId, seasonName, days, pollMs]);

  return { items, loading, error };
}
