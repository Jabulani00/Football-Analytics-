import type { BetSlipLeg } from '@/types/analytics';

/** Provider IDs identify an outcome across screens, refreshes and price movements. */
export function bookmakerSelectionKey(leg: BetSlipLeg): string {
  if (leg.hbLeg) return `hollywood:${leg.hbLeg.eventID}:${leg.hbLeg.eventBetTypeMapID}:${leg.hbLeg.eventDetailId}`;
  if (leg.betwayLeg) return `betway:${leg.betwayLeg.eventId}:${leg.betwayLeg.marketId}:${leg.betwayLeg.outcomeId}`;
  return `${leg.bookmaker ?? ''}:${leg.fixture}:${leg.market}:${leg.selection}`;
}
export function isBookmakerSelected(legs: readonly BetSlipLeg[], leg: BetSlipLeg): boolean {
  const key = bookmakerSelectionKey(leg);
  return legs.some((item) => bookmakerSelectionKey(item) === key);
}
/** Ordinary accumulator selections remain limited to one outcome per event. */
export function toggleBookmakerSelection(legs: readonly BetSlipLeg[], leg: BetSlipLeg): BetSlipLeg[] {
  if (isBookmakerSelected(legs, leg)) {
    const key = bookmakerSelectionKey(leg);
    return legs.filter((item) => bookmakerSelectionKey(item) !== key);
  }
  if (!Number.isFinite(leg.odds) || leg.odds < 1) return [...legs];
  return [...legs.filter((item) => item.fixture !== leg.fixture &&
    !(item.hbLeg && leg.hbLeg && item.hbLeg.eventID === leg.hbLeg.eventID) &&
    !(item.betwayLeg && leg.betwayLeg && item.betwayLeg.eventId === leg.betwayLeg.eventId)), leg];
}

/** Same-match combinations require a bookmaker builder quote, not multiplied prices. */
export function hasRepeatedEvent<T>(legs: readonly T[], key: (leg: T) => string | number): boolean {
  return new Set(legs.map(key)).size !== legs.length;
}
