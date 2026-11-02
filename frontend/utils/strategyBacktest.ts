/**
 * Strategy backtest — the historical success rate for a chosen outcome.
 *
 * Deliberately NOT a point-in-time walk-forward backtest: for a qualifying team
 * it measures how often a user-picked market actually happened across that team's
 * completed matches this season (current-season form), with the sample size. It
 * invents nothing — every number comes from real finished fixtures via
 * teamResultsFromFixtures — and returns null (→ "Insufficient data") below a
 * minimum sample so a percentage is never shown without support.
 *
 * Pure: no network, no React.
 */
import type { RawFixture } from '@/services/oddAlerts';
import { filterScope, teamResultsFromFixtures, type TeamResult } from '@/utils/teamResults';

export type BacktestScope = 'overall' | 'home' | 'away';

/** A market to score the strategy against — a predicate over one finished match. */
export type TargetMarket = { key: string; label: string; group: string; hit: (r: TeamResult) => boolean };

const totalGoals = (r: TeamResult) => r.gf + r.ga;

export const TARGET_MARKETS: TargetMarket[] = [
  { key: 'btts_yes', label: 'BTTS — Yes', group: 'Goals', hit: (r) => r.gf > 0 && r.ga > 0 },
  { key: 'btts_no', label: 'BTTS — No', group: 'Goals', hit: (r) => !(r.gf > 0 && r.ga > 0) },
  { key: 'over05', label: 'Over 0.5', group: 'Totals', hit: (r) => totalGoals(r) > 0.5 },
  { key: 'over15', label: 'Over 1.5', group: 'Totals', hit: (r) => totalGoals(r) > 1.5 },
  { key: 'over25', label: 'Over 2.5', group: 'Totals', hit: (r) => totalGoals(r) > 2.5 },
  { key: 'over35', label: 'Over 3.5', group: 'Totals', hit: (r) => totalGoals(r) > 3.5 },
  { key: 'under15', label: 'Under 1.5', group: 'Totals', hit: (r) => totalGoals(r) < 1.5 },
  { key: 'under25', label: 'Under 2.5', group: 'Totals', hit: (r) => totalGoals(r) < 2.5 },
  { key: 'under35', label: 'Under 3.5', group: 'Totals', hit: (r) => totalGoals(r) < 3.5 },
  { key: 'win', label: 'Team win', group: 'Result', hit: (r) => r.outcome === 'W' },
  { key: 'draw', label: 'Draw', group: 'Result', hit: (r) => r.outcome === 'D' },
  { key: 'loss', label: 'Team loss', group: 'Result', hit: (r) => r.outcome === 'L' },
  { key: 'win_draw', label: 'Team win or draw (DNB/X2)', group: 'Result', hit: (r) => r.outcome !== 'L' },
  { key: 'clean_sheet', label: 'Clean sheet', group: 'Defence', hit: (r) => r.ga === 0 },
  { key: 'fts', label: 'Failed to score', group: 'Defence', hit: (r) => r.gf === 0 },
  { key: 'scored', label: 'Team scored', group: 'Scoring', hit: (r) => r.gf > 0 },
  { key: 'scored_15', label: 'Team scored 2+', group: 'Scoring', hit: (r) => r.gf >= 2 },
  { key: 'conceded', label: 'Team conceded', group: 'Scoring', hit: (r) => r.ga > 0 },
  { key: 'win_to_nil', label: 'Win to nil', group: 'Result', hit: (r) => r.outcome === 'W' && r.ga === 0 },
];

export function targetMarket(key: string): TargetMarket | undefined {
  return TARGET_MARKETS.find((m) => m.key === key);
}

export const MIN_BACKTEST = 5;

export type BacktestResult = {
  sample: number;
  hits: number;
  misses: number;
  rate: number;
  scope: BacktestScope;
  /** The matches scored, newest first — for the expandable "why this %" detail. */
  matches: { result: TeamResult; hit: boolean }[];
};

/**
 * Season-form success rate for one team: of its completed matches (in `scope`),
 * how often `target` hit. Null when the team id is unknown or the sample is too
 * small. `fixtures` is the team's league season set the panel already fetched.
 */
export function backtestTeam(
  fixtures: RawFixture[],
  teamId: number | null,
  scope: BacktestScope,
  target: TargetMarket,
  competitionId?: number | null,
): BacktestResult | null {
  if (teamId == null) return null;
  const all = teamResultsFromFixtures(fixtures, teamId, null, { competitionId: competitionId ?? null });
  const results = filterScope(all, scope);
  if (results.length < MIN_BACKTEST) return null;
  const scored = results.map((result) => ({ result, hit: target.hit(result) }));
  const hits = scored.filter((s) => s.hit).length;
  return {
    sample: results.length,
    hits,
    misses: results.length - hits,
    rate: (hits / results.length) * 100,
    scope,
    matches: scored,
  };
}
