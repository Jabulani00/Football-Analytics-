import { betwayFixture } from '@/services/bookmakerFixtures';
import { websitePriceFromNet } from '@/services/bookmakerClassification';
import { supportedSelection } from '@/services/bookmakerValue';
import { normalizeTeam, splitEventName } from '@/services/hollywoodMatch';
import { BET_TYPE, toShareLeg, type HbEvent } from '@/services/hollywoodTypes';
import type { BetwayEvent } from '@/services/betwayHunt';
import type { BetSlipLeg } from '@/types/analytics';

export type ReviewOffer = {
  id: string;
  eventId: number;
  fixture: string;
  kickoff: string;
  marketName: string;
  selection: string;
  decimal: number;
  bookmaker: 'Hollywoodbets' | 'Betway';
  capturedAt: string | null;
  betSlipLeg: BetSlipLeg | null;
};

const open = (status: string) => /^(active|open)$/i.test(status.trim());

export function hollywoodReviewOffers(
  events: readonly HbEvent[],
  capturedAt: string | null,
  context?: { tournamentId: number; tournamentName: string; countryId: number },
): ReviewOffer[] {
  const offers: ReviewOffer[] = [];
  for (const event of events) {
    for (const group of event.betTypes) {
      if (!open(group.status) ||
        ![BET_TYPE.FULL_TIME, BET_TYPE.BTTS, BET_TYPE.TOTALS].some((id) => id === group.id)) continue;
      for (const selection of group.markets) {
        const decimal = websitePriceFromNet(selection.odds);
        if (!open(selection.status) || decimal == null) continue;
        const choice = group.id === BET_TYPE.FULL_TIME
          ? [undefined, 'Home', 'Draw', 'Away'][selection.number]
          : selection.name;
        const marketName = group.id === BET_TYPE.FULL_TIME ? 'Full Time'
          : group.id === BET_TYPE.BTTS ? 'Both Teams to Score' : 'Additional Totals';
        if (!choice || !supportedSelection(marketName, choice)) continue;
        const id = `hollywood-${event.id}-${group.eventBetTypeMapID}-${selection.eventDetailId}`;
        offers.push({
          id, eventId: event.id, fixture: event.name, kickoff: event.startTime,
          marketName, selection: choice, decimal, bookmaker: 'Hollywoodbets', capturedAt,
          betSlipLeg: context ? {
            id, fixture: event.name, kickoff: event.startTime, market: marketName,
            selection: choice, odds: decimal, bookmaker: 'Hollywoodbets',
            hbLeg: toShareLeg(event, group, selection, context),
          } : null,
        });
      }
    }
  }
  return offers;
}

export type BetwayReviewSource = { event: BetwayEvent; marketsCapturedAt: string | null };
export type MatchedBetwayEvent = { hollywood: HbEvent; betway: BetwayEvent };

/** Exact team names and a unique close kickoff are required; squad names are not stripped. */
export function matchBetwayEvents(
  hollywoodEvents: readonly HbEvent[],
  betwayEvents: readonly BetwayEvent[],
): MatchedBetwayEvent[] {
  const candidates = hollywoodEvents.flatMap((hollywood) => {
    const teams = splitEventName(hollywood.name);
    const kickoff = Date.parse(hollywood.startTime);
    if (!teams || !Number.isFinite(kickoff)) return [];
    const matches = betwayEvents.filter((betway) => {
      const betwayKickoff = Date.parse(betway.start_time);
      return Number.isFinite(betwayKickoff) && Math.abs(kickoff - betwayKickoff) <= 5 * 60_000
        && teams.home === normalizeTeam(betway.home_team)
        && teams.away === normalizeTeam(betway.away_team);
    });
    return matches.length === 1 ? [{ hollywood, betway: matches[0] }] : [];
  });
  return candidates.filter(({ betway }) =>
    candidates.filter((candidate) => candidate.betway.provider_event_id === betway.provider_event_id).length === 1);
}

export function betwayReviewOffers(
  hollywoodEvents: readonly HbEvent[],
  sources: readonly BetwayReviewSource[],
): ReviewOffer[] {
  const pairs = matchBetwayEvents(hollywoodEvents, sources.map((source) => source.event));
  const offers: ReviewOffer[] = [];
  for (const { hollywood, betway } of pairs) {
    const source = sources.find((item) => item.event.provider_event_id === betway.provider_event_id);
    const fixture = betwayFixture(betway);
    for (const [side, selection] of [['home', 'Home'], ['draw', 'Draw'], ['away', 'Away']] as const) {
      const price = fixture[side];
      if (!price.open) continue;
      const decimal = price.betSlipLeg?.odds ?? price.odds;
      if (decimal == null || !Number.isFinite(decimal) || decimal < 1) continue;
      offers.push({
        id: `betway-${betway.provider_event_id}-result-${side}`,
        eventId: hollywood.id, fixture: hollywood.name, kickoff: betway.start_time,
        marketName: 'Full Time', selection, decimal, bookmaker: 'Betway',
        capturedAt: price.betSlipLeg ? source?.marketsCapturedAt ?? betway.last_seen_at : betway.last_seen_at,
        betSlipLeg: price.betSlipLeg ?? null,
      });
    }
    for (let index = 0; index < betway.markets.length; index += 1) {
      const rawMarket = betway.markets[index];
      if (rawMarket.market_type.trim().toLowerCase() === 'win-draw-win') continue;
      const market = fixture.markets[index];
      const lines = rawMarket.name.match(/\d+(?:\.\d+)?/g) ?? [];
      const marketName = rawMarket.line != null && !lines.some((line) => Number(line) === rawMarket.line)
        ? `${rawMarket.name} ${rawMarket.line}` : rawMarket.name;
      for (const selection of market.selections) {
        if (!selection.open || selection.odds == null || !Number.isFinite(selection.odds) ||
          selection.odds < 1 || !supportedSelection(marketName, selection.name)) continue;
        offers.push({
          id: selection.betSlipLeg?.id ?? `betway-${betway.provider_event_id}-${market.id}-${selection.name}`,
          eventId: hollywood.id, fixture: hollywood.name, kickoff: betway.start_time,
          marketName, selection: selection.name, decimal: selection.odds, bookmaker: 'Betway',
          capturedAt: source?.marketsCapturedAt ?? betway.last_seen_at,
          betSlipLeg: selection.betSlipLeg ?? null,
        });
      }
    }
  }
  return offers;
}
