/**
 * Last-game result filters for the Strategy Builder's Single · Last-game-results
 * call. Each is a per-game predicate over a TeamResult (the same result shape the
 * grading/RFS engines use), so "filter by BTTS / draws / Over 1.5 / clean sheet /
 * …" reads consistently with the rest of the app. Pure — no React, no network.
 */
import type { TeamResult } from '@/utils/teamResults';

export type ResultFilter = { key: string; label: string; hit: (r: TeamResult) => boolean };

export const RESULT_FILTERS: ResultFilter[] = [
  { key: 'btts', label: 'BTTS · both scored', hit: (r) => r.gf > 0 && r.ga > 0 },
  { key: 'btts_no', label: 'BTTS No', hit: (r) => !(r.gf > 0 && r.ga > 0) },
  { key: 'win', label: 'Win', hit: (r) => r.outcome === 'W' },
  { key: 'draw', label: 'Draw', hit: (r) => r.outcome === 'D' },
  { key: 'loss', label: 'Loss', hit: (r) => r.outcome === 'L' },
  { key: 'over15', label: 'Over 1.5 goals', hit: (r) => r.gf + r.ga >= 2 },
  { key: 'over25', label: 'Over 2.5 goals', hit: (r) => r.gf + r.ga >= 3 },
  { key: 'over35', label: 'Over 3.5 goals', hit: (r) => r.gf + r.ga >= 4 },
  { key: 'under25', label: 'Under 2.5 goals', hit: (r) => r.gf + r.ga <= 2 },
  { key: 'under15', label: 'Under 1.5 goals', hit: (r) => r.gf + r.ga <= 1 },
  { key: 'scored', label: 'Scored', hit: (r) => r.gf > 0 },
  { key: 'fts', label: 'Failed to score', hit: (r) => r.gf === 0 },
  { key: 'cs', label: 'Clean sheet', hit: (r) => r.ga === 0 },
  { key: 'conceded', label: 'Conceded', hit: (r) => r.ga > 0 },
];

/** The last-N windows offered by the Last-game-results filter. */
export const LAST_RESULT_WINDOWS = [3, 5, 8, 10, 15, 20];

export function resultFilter(key: string): ResultFilter {
  return RESULT_FILTERS.find((f) => f.key === key) ?? RESULT_FILTERS[0];
}

/** How often a result landed in a team's most-recent `windowN` games (newest-first input). */
export function recentResultStat(
  results: TeamResult[],
  key: string,
  windowN: number,
): { hits: number; games: number; rate: number } {
  const def = resultFilter(key);
  const slice = results.slice(0, windowN);
  const hits = slice.filter(def.hit).length;
  return { hits, games: slice.length, rate: slice.length ? Math.round((100 * hits) / slice.length) : 0 };
}
