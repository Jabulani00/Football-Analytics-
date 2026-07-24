/**
 * Odds ↔ probability helpers for odds fusion (TypeScript port of the de-vig
 * logic in backend/prediction/ensemble.py).
 *
 * All inputs are DECIMAL odds (≥ 1.0). Hollywoodbets returns fractional net
 * odds — convert with `toDecimal()` (services/hollywoodbets.ts) first.
 *
 * Pure (no network, no React) → unit-testable.
 */

/** Implied probability of a single decimal price (includes the bookmaker margin). */
export function impliedProb(decimalOdds: number): number {
  return decimalOdds > 0 ? 1 / decimalOdds : 0;
}

/** Remove the overround from a 1X2 market → probabilities summing to 1. */
export function devig1x2(
  home: number,
  draw: number,
  away: number,
): { home: number; draw: number; away: number } | null {
  if (home <= 0 || draw <= 0 || away <= 0) return null;
  const raw = [1 / home, 1 / draw, 1 / away];
  const total = raw[0] + raw[1] + raw[2];
  if (total <= 0) return null;
  return { home: raw[0] / total, draw: raw[1] / total, away: raw[2] / total };
}

/** De-vig a two-way (yes/no) market to the 'yes' probability. */
export function devigBinary(oddsYes: number, oddsNo?: number): number | null {
  if (!oddsYes || oddsYes <= 0) return null;
  const pYes = 1 / oddsYes;
  if (oddsNo && oddsNo > 0) {
    const total = pYes + 1 / oddsNo;
    return total > 0 ? pYes / total : null;
  }
  return Math.min(1, pYes);
}

/**
 * Expected value (as a %) of backing a selection at `decimalOdds` when your
 * model puts the true probability at `modelProb` (0–1). Positive = value.
 *   EV% = (modelProb × decimalOdds − 1) × 100
 */
export function evPct(modelProb: number, decimalOdds: number): number {
  return (modelProb * decimalOdds - 1) * 100;
}

/**
 * Simpler "edge" for a stat signal already expressed as a percentage: the gap
 * between the model's probability and the bookmaker's implied probability, in
 * percentage points. Positive = the book is offering more than the stat implies.
 */
export function edgePctFromCompliance(compliancePct: number, decimalOdds: number): number {
  return compliancePct - impliedProb(decimalOdds) * 100;
}
