/**
 * Adapts the OddAlerts fixture-detail model probabilities + bookmaker odds into
 * the shapes the recommendation engine consumes. Lets match detail feed the
 * engine REAL odds and probabilities (already live-aware for in-play games)
 * rather than a re-derived model.
 *
 * Pure — no network, no React.
 */
import type { OddsByMarket, Probability } from '@/services/oddAlerts';
import type { FixturePrediction } from '@/services/predictionEngine';
import type { OddsInput } from '@/utils/fixtureRecommendation';

/** Build a FixturePrediction from the API's 0–100 model probabilities. */
export function predictionFromApiProbability(prob: Probability): FixturePrediction {
  // Read a key as a 0–1 fraction, or undefined when absent/NaN.
  const g = (k: string): number | undefined => {
    const v = (prob as Record<string, number | undefined>)[k];
    return typeof v === 'number' && !Number.isNaN(v) ? v / 100 : undefined;
  };

  const over25 = g('o25') ?? 0.5;
  // Over/Under 1.5 and 3.5 aren't always published — bracket them off 2.5.
  const over15 = g('o15') ?? Math.min(0.99, over25 + 0.22);
  const over35 = g('o35') ?? Math.max(0.02, over25 - 0.22);
  const homeWin = g('home_win') ?? 0.34;
  const draw = g('draw') ?? 0.33;
  const awayWin = g('away_win') ?? 0.33;

  return {
    homeWin,
    draw,
    awayWin,
    btts: g('btts') ?? 0.5,
    over15,
    over25,
    over35,
    // Expected goals are only used for the engine's live Poisson, which match
    // detail doesn't invoke (the API probabilities are already live-aware).
    expectedHome: 1.4,
    expectedAway: 1.1,
    topScore: '',
    correctScores: [],
    pick: homeWin >= draw && homeWin >= awayWin ? '1' : awayWin >= draw ? '2' : 'X',
    confidence: 0,
    lowData: false,
  };
}

/** Pull the recommendation-relevant prices out of the bookmaker odds board. */
export function oddsInputFromApi(odds: OddsByMarket | undefined): OddsInput | null {
  if (!odds) return null;
  const ft = odds.ft_result;
  const tg = odds.total_goals;
  const btts = odds.btts;
  return {
    home: ft?.home,
    draw: ft?.draw,
    away: ft?.away,
    over25: tg?.over_25,
    under25: tg?.under_25,
    over15: tg?.over_15,
    bttsYes: btts?.yes,
    bttsNo: btts?.no,
  };
}
