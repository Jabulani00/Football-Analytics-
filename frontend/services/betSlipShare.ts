import type { BetSlipLeg } from '@/types/analytics';
import { reviewBetSlip, ticketReference, type BetSlipMode } from '@/services/betSlipReview';

export type { BetSlipMode } from '@/services/betSlipReview';

/** Build the portable text artifact used by Web Share, native Share and copy. */
export function buildBetSlipSummary(
  legs: BetSlipLeg[],
  options: { mode: BetSlipMode; stake: number; assumeIndependence?: boolean },
): string {
  const review = reviewBetSlip(legs, options.mode, options.stake);
  const amount = (value: number | null) => value == null ? 'unavailable' : `R ${value.toFixed(2)}`;

  return [
    `Scoreline Bet Slip — ${options.mode === 'accumulator' ? 'Accumulator' : 'Singles'}`,
    ...legs.map(
      (leg, index) =>
        `${index + 1}. ${leg.fixture} | ${leg.market} — ${leg.selection} @ ${leg.odds.toFixed(2)}${leg.bookmaker ? ` (${leg.bookmaker})` : ''}`,
    ),
    ...review.tickets.flatMap((ticket) => {
      const references = (['pinnacle', 'machine'] as const).flatMap((source) => {
        const result = ticketReference(ticket, source, options.assumeIndependence === true);
        return result.status === 'available' ? [
          `${source === 'pinnacle' ? 'Pinnacle' : 'MM'} benchmark: ${result.metrics.valuePp.toFixed(4)} pp value, ${result.metrics.shortfallPp.toFixed(4)} pp shortfall, ${result.metrics.benchmarkEvPct.toFixed(2)}% EV, ${result.metrics.shortfallUnitsPerUnit.toFixed(4)} units shortfall per unit staked`,
        ] : [];
      });
      return [
        `${ticket.bookmaker ?? 'Unassigned'} ticket (${ticket.legs.length} leg${ticket.legs.length === 1 ? '' : 's'}${ticket.group ? `, group ${ticket.group}` : ', outside requested groups'}): ${
          ticket.combinedOdds == null ? 'odds unavailable' : `combined odds ${ticket.combinedOdds.toFixed(2)}`
        }; potential return ${amount(ticket.potentialReturn)}${ticket.issue ? ` — ${ticket.issue}` : ''}`,
        ...references,
      ];
    }),
    ...(options.assumeIndependence ? ['Multi-leg reference calculations assume independent outcomes.'] : []),
    `Total stake: ${amount(review.totalStake)}`,
    `Potential return: ${amount(review.potentialReturn)}`,
    ...(review.issue ? [review.issue] : []),
    'Benchmark shortfall is hypothetical, not a realized loss.',
    'Prices can change. Review every selection with the bookmaker before placing a bet.',
  ].join('\n');
}
