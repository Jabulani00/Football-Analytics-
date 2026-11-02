import assert from 'node:assert/strict';
import { bookmakerSelectionKey, isBookmakerSelected, toggleBookmakerSelection } from '../services/bookmakerSelection';
import { hollywoodFixture, betwayFixture } from '../services/bookmakerFixtures';
import type { HbEvent } from '../services/hollywoodTypes';
import type { BetwayEvent } from '../services/betwayHunt';
import type { BetSlipLeg } from '../types/analytics';
const context = { tournamentId: 5, tournamentName: 'League', countryId: 1 };
const hb: HbEvent = { id: 7, name: 'Alpha vs Beta', startTime: '2030-01-01T12:00:00Z', categoryId: 1,
  category: 'Country', tournament: 'League', isOutright: false,
  betTypes: [15, 22, 60, 60].map((type, groupIndex) => ({ id: type, name: `Market ${type}`, status: 'Active', eventBetTypeMapID: 100 + groupIndex,
    markets: Array.from({ length: type === 15 ? 3 : 2 }, (_, index) => ({ id: groupIndex * 10 + index,
      eventId: 7, eventBetTypeMapId: 100 + groupIndex, eventDetailId: 1000 + groupIndex * 10 + index,
      status: 'Active', number: index + 1, name: type === 15 ? ['Alpha', 'Draw', 'Beta'][index] : ['Yes', 'No'][index], odds: 0.14 + index, ratio: '' })),
  })) };
const hollywood = hollywoodFixture(hb, null, context);
const hollywoodLegs = hollywood.markets.flatMap((market) => market.selections.map((selection) => selection.betSlipLeg!));
assert.equal(new Set(hollywoodLegs.map(bookmakerSelectionKey)).size, 9, 'Every market/group/outcome has its own identity');
assert.equal(bookmakerSelectionKey(hollywood.home.betSlipLeg!), bookmakerSelectionKey(hollywoodLegs[0]), '1X2 shortcut and full market share identity');
assert.equal(hollywood.home.betSlipLeg?.odds, 1.14);
assert.equal(hollywood.home.betSlipLeg?.hbLeg?.eventDetailOfferedOdd, 0.14, 'Booking metadata retains the exact raw provider price');
for (const leg of hollywoodLegs) {
  let slip = toggleBookmakerSelection([], leg);
  assert.equal(slip.length, 1); assert.ok(isBookmakerSelected(slip, leg));
  assert.ok(isBookmakerSelected(JSON.parse(JSON.stringify(slip)), leg), 'Restored browser storage keeps selection');
  const refreshed = { ...leg, id: `other-screen-${leg.id}`, odds: leg.odds + 0.1 };
  assert.ok(isBookmakerSelected(slip, refreshed), 'Price change or another screen does not change identity');
  slip = toggleBookmakerSelection(slip, refreshed);
  assert.equal(slip.length, 0, 'Second click deselects rather than duplicating');
}
const replacement = toggleBookmakerSelection([hollywoodLegs[0]], hollywoodLegs[3]);
assert.equal(replacement.length, 1); assert.ok(isBookmakerSelected(replacement, hollywoodLegs[3]));
assert.ok(!isBookmakerSelected(replacement, hollywoodLegs[0]), 'Changing a market clears the previous highlight');
assert.equal(toggleBookmakerSelection([hollywoodLegs[0]], { ...hollywoodLegs[3], fixture: 'Updated fixture spelling' }).length, 1,
  'Provider event identity preserves the replacement rule after a name update');
assert.notEqual(bookmakerSelectionKey(hollywoodLegs[5]), bookmakerSelectionKey(hollywoodLegs[7]), 'Same selection numbers in split groups do not collide');
const bw = { provider_event_id: '77', home_team: 'Gamma', away_team: 'Delta', competition: 'League', start_time: hb.startTime,
  fixture_status: 'active', lifecycle_state: 'active', market_open: true, market_suspended: false,
  odds_home: 2, odds_draw: 3, odds_away: 4, last_seen_at: '2030-01-01T10:00:00Z',
  markets: [{ market_id: 'result', market_type: 'win-draw-win', name: 'Result', line: null, open: true, suspended: false,
    selections: ['Gamma', 'Draw', 'Delta'].map((name, index) => ({ outcome_id: `r${index}`, name, odds: index + 2, available: true })) },
    { market_id: 'goals', market_type: 'total', name: 'Goals 2.5', line: 2.5, open: true, suspended: false,
      selections: ['Over (2.5)', 'Under (2.5)'].map((name, index) => ({ outcome_id: `g${index}`, name, odds: 1.5 + index, available: true })) }],
} as unknown as BetwayEvent;
const betway = betwayFixture(bw);
const betwayLegs = betway.markets.flatMap((market) => market.selections.map((selection) => selection.betSlipLeg!));
assert.equal(bookmakerSelectionKey(betway.home.betSlipLeg!), bookmakerSelectionKey(betwayLegs[0]));
for (const leg of betwayLegs) {
  assert.ok(leg.betwayLeg?.outcomeId); assert.equal(leg.betwayLeg?.group, 'All');
  const slip = toggleBookmakerSelection([hollywoodLegs[0]], leg);
  assert.equal(slip.length, 2, 'Other fixtures stay in the slip'); assert.ok(isBookmakerSelected(slip, leg));
  assert.equal(toggleBookmakerSelection(slip, leg).length, 1);
}
const closed = betwayFixture({ ...bw, markets: bw.markets.map((market) => ({ ...market, suspended: true })) });
assert.equal(closed.home.open, false);
assert.ok(closed.markets.every((market) => market.selections.every((selection) => !selection.open)));
const invalid = { ...hollywoodLegs[0], odds: NaN };
assert.deepEqual(toggleBookmakerSelection([], invalid), []);
const removed: BetSlipLeg[] = [];
assert.ok(!isBookmakerSelected(removed, hollywoodLegs[0]), 'Removing or clearing the slip clears highlighting');
console.log('Bookmaker selection tests passed: every imported outcome, toggle/replacement, persistence, cross-screen identity, split groups and exact booking metadata');
