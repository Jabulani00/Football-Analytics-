import { BET_TYPE, toShareLeg, type HbEvent } from '@/services/hollywoodTypes';
import { websitePriceFromNet } from '@/services/bookmakerClassification';
import type { BetwayEvent, BetwayMarket } from '@/services/betwayHunt';
import type { BookFixture, BookMarket, Price } from '@/services/bookmakerClassification';

// Unknown provider statuses cannot establish that a price is currently open.
const openStatus = (status: string) => /^(active|open)$/i.test(status.trim());

export function hollywoodFixture(event: HbEvent, observedAt: string | null = null,
  context?: { tournamentId: number; tournamentName: string; countryId: number },
): BookFixture {
  const markets = event.betTypes.map((group): BookMarket => ({
    id: String(group.eventBetTypeMapID), name: group.name,
    selections: group.markets.map((selection) => ({ name: selection.name,
      odds: websitePriceFromNet(selection.odds),
      open: openStatus(group.status) && openStatus(selection.status),
      betSlipLeg: context ? {
        id: `hollywood-${event.id}-${group.eventBetTypeMapID}-${selection.eventDetailId}`,
        fixture: event.name, market: group.name, selection: selection.name,
        odds: websitePriceFromNet(selection.odds) ?? 0, bookmaker: 'Hollywoodbets', kickoff: event.startTime,
        hbLeg: toShareLeg(event, group, selection, context),
      } : undefined,
    })),
  }));
  const fullTime = event.betTypes.filter((group) => group.id === BET_TYPE.FULL_TIME);
  const price = (number: number, fallback: string): Price => {
    const matches = fullTime.flatMap((group) => group.markets.filter((selection) => selection.number === number)
      .map((selection) => ({ group, selection })));
    if (matches.length !== 1) return { name: fallback, odds: null, open: false };
    const { group, selection } = matches[0];
    return { name: selection.name, odds: websitePriceFromNet(selection.odds),
      open: openStatus(group.status) && openStatus(selection.status),
      betSlipLeg: markets.find((market) => market.id === String(group.eventBetTypeMapID))?.selections
        .find((item) => item.betSlipLeg?.hbLeg?.eventDetailId === selection.eventDetailId)?.betSlipLeg };
  };
  return { id: String(event.id), bookmaker: 'Hollywoodbets', name: event.name,
    country: event.category, competition: event.tournament, kickoff: event.startTime, observedAt,
    home: price(1, 'Home'), draw: price(2, 'Draw'), away: price(3, 'Away'), markets };
}
export function betwayBookMarkets(markets: BetwayMarket[]): BookMarket[] {
  return markets.map((market) => ({ id: market.market_id, name: market.name, line: market.line,
    selections: market.selections.map((selection) => ({ name: selection.name, odds: selection.odds,
      open: market.open && !market.suspended && selection.available })),
  }));
}
export function betwayFixture(event: BetwayEvent): BookFixture {
  const fixtureOpen = event.fixture_status === 'active' &&
    ['active', 'reopened', 'rescheduled'].includes(event.lifecycle_state);
  const open = fixtureOpen && event.market_open && !event.market_suspended;
  const fixture: BookFixture = { id: event.provider_event_id, bookmaker: 'Betway', name: `${event.home_team} vs ${event.away_team}`,
    country: '', competition: event.competition ?? '', kickoff: event.start_time, observedAt: event.last_seen_at,
    home: { name: event.home_team, odds: event.odds_home, open },
    draw: { name: 'Draw', odds: event.odds_draw, open },
    away: { name: event.away_team, odds: event.odds_away, open }, markets: event.markets.map((source) => {
      const market = betwayBookMarkets([source])[0];
      return { ...market, selections: market.selections.map((selection, index) => ({ ...selection, open: fixtureOpen && selection.open,
        betSlipLeg: {
          id: `betway-${event.provider_event_id}-${market.id}-${source.selections[index].outcome_id}`,
          fixture: `${event.home_team} vs ${event.away_team}`, market: market.name, selection: selection.name,
          odds: selection.odds ?? 0, bookmaker: 'Betway' as const, kickoff: event.start_time,
          betwayLeg: { eventId: event.provider_event_id, marketId: market.id,
            outcomeId: source.selections[index].outcome_id,
            group: 'All', fixture: `${event.home_team} vs ${event.away_team}`, marketName: market.name,
            selectionName: selection.name, offeredOdds: selection.odds ?? 0, kickoff: event.start_time },
        },
      })) };
    }) };
  const fullTime = event.markets.filter((market) => market.market_type.trim().toLowerCase() === 'win-draw-win');
  if (fullTime.length === 1) {
    const market = fixture.markets.find((item) => item.id === fullTime[0].market_id);
    for (const side of ['home', 'draw', 'away'] as const) {
      const selections = market?.selections.filter((selection) => selection.name.trim().toLowerCase() === fixture[side].name.trim().toLowerCase()) ?? [];
      if (selections.length === 1) {
        fixture[side].betSlipLeg = selections[0].betSlipLeg;
        fixture[side].open = fixture[side].open && selections[0].open;
      }
    }
  }
  return fixture;
}
