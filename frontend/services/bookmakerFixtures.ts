import { BET_TYPE, type HbEvent } from '@/services/hollywoodTypes';
import { websitePriceFromNet } from '@/services/bookmakerClassification';
import type { BetwayEvent, BetwayMarket } from '@/services/betwayHunt';
import type { BookFixture, BookMarket, Price } from '@/services/bookmakerClassification';

// Unknown provider statuses cannot establish that a price is currently open.
const openStatus = (status: string) => /^(active|open)$/i.test(status.trim());

export function hollywoodFixture(event: HbEvent, observedAt: string | null = null): BookFixture {
  const markets = event.betTypes.map((group): BookMarket => ({
    id: String(group.eventBetTypeMapID), name: group.name,
    selections: group.markets.map((selection) => ({ name: selection.name,
      odds: websitePriceFromNet(selection.odds),
      open: openStatus(group.status) && openStatus(selection.status),
    })),
  }));
  const fullTime = event.betTypes.filter((group) => group.id === BET_TYPE.FULL_TIME);
  const price = (number: number, fallback: string): Price => {
    const matches = fullTime.flatMap((group) => group.markets.filter((selection) => selection.number === number)
      .map((selection) => ({ group, selection })));
    if (matches.length !== 1) return { name: fallback, odds: null, open: false };
    const { group, selection } = matches[0];
    return { name: selection.name, odds: websitePriceFromNet(selection.odds),
      open: openStatus(group.status) && openStatus(selection.status) };
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
  return { id: event.provider_event_id, bookmaker: 'Betway', name: `${event.home_team} vs ${event.away_team}`,
    country: '', competition: event.competition ?? '', kickoff: event.start_time, observedAt: event.last_seen_at,
    home: { name: event.home_team, odds: event.odds_home, open },
    draw: { name: 'Draw', odds: event.odds_draw, open },
    away: { name: event.away_team, odds: event.odds_away, open }, markets: betwayBookMarkets(event.markets).map((market) => ({
      ...market, selections: market.selections.map((selection) => ({ ...selection, open: fixtureOpen && selection.open })),
    })) };
}
