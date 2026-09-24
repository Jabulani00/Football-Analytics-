import type { BetSlipLeg } from '@/types/analytics';

export type BetSlipMode = 'accumulator' | 'singles';

/** Build the portable text artifact used by Web Share, native Share and copy. */
export function buildBetSlipSummary(
  legs: BetSlipLeg[],
  options: { mode: BetSlipMode; stake: number },
): string {
  const safeStake = Number.isFinite(options.stake) ? Math.max(0, options.stake) : 0;
  const combinedOdds = legs.reduce((total, leg) => total * leg.odds, 1);
  const totalStake = options.mode === 'accumulator' ? safeStake : safeStake * legs.length;
  const potentialReturn =
    options.mode === 'accumulator'
      ? (legs.length > 0 ? safeStake * combinedOdds : 0)
      : legs.reduce((total, leg) => total + safeStake * leg.odds, 0);

  return [
    `Scoreline Bet Slip — ${options.mode === 'accumulator' ? 'Accumulator' : 'Singles'}`,
    ...legs.map(
      (leg, index) =>
        `${index + 1}. ${leg.fixture} | ${leg.market} — ${leg.selection} @ ${leg.odds.toFixed(2)}${leg.bookmaker ? ` (${leg.bookmaker})` : ''}`,
    ),
    options.mode === 'accumulator' && legs.length > 0
      ? `Combined odds: ${combinedOdds.toFixed(2)}`
      : `Selections: ${legs.length}`,
    `Total stake: R ${totalStake.toFixed(2)}`,
    `Potential return: R ${potentialReturn.toFixed(2)}`,
    'Prices can change. Review every selection with the bookmaker before placing a bet.',
  ].join('\n');
}
