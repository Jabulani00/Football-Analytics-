import assert from 'node:assert/strict';
import { assessTeams, assessPair, opposingPairs, filterBookFixtures, websitePriceFromNet, type Price, type FixtureFilters } from '../services/bookmakerClassification';
import { hollywoodFixture, betwayFixture } from '../services/bookmakerFixtures';
import type { HbEvent } from '../services/hollywoodTypes';
import type { BetwayEvent } from '../services/betwayHunt';
const p = (odds: number | null, open = true): Price => ({ name: 'Outcome', odds, open });
for (const [name, selections, line] of [
  ['Odd/Even Goals', ['Odd', 'Even'], undefined],
  ['1st Half - Odd / Even', ['Even', 'Odd'], undefined],
  ['Draw No Bet', ['Alpha', 'Beta'], undefined],
  ['2nd Half - Draw No Bet', ['Home', 'Away'], undefined],
  ['Home No Bet', ['Draw', 'Away'], undefined],
  ['Away No Bet', ['Home', 'Draw'], undefined],
  ['Asian Handicap', ['Alpha -0.5', 'Beta +0.5'], undefined],
  ['Asian Handicap', ['Alpha', 'Beta'], -0.25],
  ['To Qualify', ['Alpha', 'Beta'], undefined],
  ['To Advance', ['Alpha', 'Beta'], undefined],
  ['To Lift the Trophy', ['Alpha', 'Beta'], undefined],
] as const) {
  const pairs = opposingPairs({ id: 'test', name, line, selections: selections.map((name, index) => ({ name, odds: index === 0 ? 1.1 : 1.4, open: true })) });
  assert.equal(pairs.length, 1, `${name} recognised`);
  assert.equal(assessPair(pairs[0].first, pairs[0].second!)?.preference, 'first', `${name} uses exact 0.30 threshold`);
  assert.equal(assessPair(pairs[0].first, { ...pairs[0].second!, odds: 1.39 })?.preference, 'none');
  assert.equal(assessPair(pairs[0].first, { ...pairs[0].second!, open: false }), null);
}
for (const [name, names] of [
  ['Full Time', ['Home', 'Away']],
  ['Double Chance', ['Home / Draw', 'Draw / Away']],
  ['Highest Scoring Half', ['First Half', 'Second Half']],
  ['First Team to Score', ['Home', 'Away']],
  ['European Handicap', ['Home -1', 'Away +1']],
  ['Asian Handicap', ['Home -1', 'Away +2']],
  ['Asian Handicap', ['Home', 'Away']],
  ['Home No Bet', ['Draw', 'Draw']],
  ['Draw No Bet', ['Draw', 'Away']],
  ['To Qualify', ['Unknown selection', 'Beta']],
] as const) {
  assert.equal(opposingPairs({ id: 'test', name, selections: names.map((name) => ({ ...p(2), name })) }).length, 0, `${name}: invalid/unsupported pair excluded`);
}
assert.equal(opposingPairs({ id: 'three', name: 'Asian Handicap', selections: ['Home', 'Draw', 'Away'].map((name) => ({ ...p(2), name })) }).length, 0);
assert.equal(websitePriceFromNet(0.14), 1.14, 'Website price has no binary addition artefact');
assert.equal(websitePriceFromNet(-1), null);
for (const [home, away, category] of [[10, 2, '1A'], [2, 10, '1B'], [4, 2, '2A'], [2, 4, '2B'], [2.6, 2.5, '3A'], [2.5, 2.6, '3B']] as const) {
  assert.equal(assessTeams(p(home), p(away))?.category, category);
}
assert.equal(assessTeams(p(2.1), p(6))?.group, 2, 'Exact 0.35 is inside');
assert.equal(assessTeams(p(1.3), p(2))?.group, 2, 'Exact 0.65 is inside');
assert.equal(assessTeams(p(2.099999), p(6))?.group, 1, 'Do not classify the rounded display ratio');
assert.equal(assessTeams(p(1.300001), p(2))?.group, 3);
assert.equal(assessPair(p(1.1), p(1.4))?.preference, 'first', 'Exact 0.30 gap is clear despite float subtraction');
assert.equal(assessPair(p(1.4), p(1.1))?.preference, 'second');
assert.equal(assessPair(p(1.1), p(1.399999))?.preference, 'none');
assert.equal(assessPair(p(1.1), p(1.39))?.preference, 'none');
for (const odds of [1.8, 2.6, 3]) {
  const equal = assessTeams(p(odds), p(odds))!;
  assert.equal(equal.group, 3); assert.equal(equal.ratio, 1); assert.equal(equal.gap, 0);
  assert.equal(equal.orientation, 'equal'); assert.equal(equal.category, null); assert.equal(equal.preference, 'none');
}
for (const invalid of [null, NaN, Infinity, -1, 0]) assert.equal(assessTeams(p(invalid), p(2)), null);
assert.equal(assessTeams(p(2, false), p(4)), null);
assert.equal(assessPair(p(2), p(4, false)), null);
const markets = opposingPairs({ id: 'totals', name: 'First half goals', selections: [
  { ...p(1.4), name: 'Over 0.5' }, { ...p(2), name: 'Under 0.5' },
  { ...p(2), name: 'Over 1.5' }, { ...p(1.4), name: 'Under 1.5' },
] });
assert.equal(markets.length, 2); assert.equal(markets[0].second?.name, 'Under 0.5');
assert.equal(opposingPairs({ id: 'x', name: 'Unknown', selections: [{ ...p(2), name: 'Over' }, { ...p(3), name: 'Under' }] }).length, 0);
assert.equal(opposingPairs({ id: 'x', name: 'BTTS', selections: [{ ...p(2), name: 'Yes' }] })[0].second, null);
assert.equal(opposingPairs({ id: 'x', name: 'BTTS', selections: [{ ...p(2), name: 'Yes' }, { ...p(2), name: 'Yes' }, { ...p(3), name: 'No' }] }).length, 0, 'Ambiguous selections are not paired');
const event: HbEvent = { id: 1, name: 'Alpha vs Beta', startTime: '2030-01-01T12:00:00Z', categoryId: 1,
  category: 'Country', tournament: 'League', isOutright: false, betTypes: [{ id: 15, name: 'Full Time', status: 'Active', eventBetTypeMapID: 1,
    markets: [1, 2, 3].map((number) => ({ id: number, eventId: 1, eventBetTypeMapId: 1, eventDetailId: number,
      status: 'Active', number, name: ['Alpha', 'Draw', 'Beta'][number - 1], odds: [3, 0.1, 1][number - 1], ratio: '' })) }] };
const hb = hollywoodFixture(event);
assert.equal(hb.home.odds, 4); assert.equal(hb.away.odds, 2);
assert.equal(hb.markets[0].name, 'Full Time'); assert.equal(hb.markets[0].selections.length, 3);
assert.equal(assessTeams(hb.home, hb.away)?.category, '2A', 'Draw price is ignored even when it is smallest');
const closed = hollywoodFixture({ ...event, betTypes: [{ ...event.betTypes[0], status: 'Suspended' }] });
assert.equal(assessTeams(closed.home, closed.away), null);
const unknown = hollywoodFixture({ ...event, betTypes: [{ ...event.betTypes[0], status: '' }] });
assert.equal(assessTeams(unknown.home, unknown.away), null, 'Unknown statuses do not establish open prices');
const bw = betwayFixture({ provider_event_id: '2', home_team: 'Alpha', away_team: 'Beta', competition: 'League', start_time: event.startTime,
  fixture_status: 'active', lifecycle_state: 'active', market_open: true, market_suspended: false,
  odds_home: 4, odds_draw: 1.1, odds_away: 2, last_seen_at: '2030-01-01T10:00:00Z', markets: [] } as unknown as BetwayEvent);
assert.equal(assessTeams(bw.home, bw.away)?.category, '2A', 'Both sources use the same website decimal rules');
const filters: FixtureFilters = { query: '', country: '', competition: '', group: '', orientation: '', category: '', preference: '', side: '' };
assert.equal(filterBookFixtures([hb, closed], { ...filters, category: '2A' }).length, 1);
assert.equal(filterBookFixtures([hb, closed], { ...filters, preference: 'unavailable' }).length, 1);
assert.equal(filterBookFixtures([hb], { ...filters, side: 'second', preference: 'clear' }).length, 1);
assert.equal(filterBookFixtures([hb], { ...filters, orientation: 'B' }).length, 0);
assert.equal(filterBookFixtures([hb], { ...filters, query: ' alpha ', country: 'Country', competition: 'League' }).length, 1);
// Independent oracle: integer-cent subtraction/cross-multiplication, not production helpers.
let verified = 0;
for (let homeCents = 100; homeCents <= 1500; homeCents += 7) {
  for (let awayCents = 100; awayCents <= 1500; awayCents += 11) {
    const small = Math.min(homeCents, awayCents); const big = Math.max(homeCents, awayCents);
    const expectedGroup = small * 100 < big * 35 ? 1 : small * 100 <= big * 65 ? 2 : 3;
    const expectedPreference = big - small < 30 ? 'none' : homeCents < awayCents ? 'first' : 'second';
    const result = assessTeams(p(homeCents / 100), p(awayCents / 100))!;
    assert.equal(result.group, expectedGroup);
    assert.equal(result.preference, expectedPreference);
    assert.equal(result.gap, (big - small) / 100);
    assert.ok(Math.abs(result.ratio - small / big) < 1e-14);
    const reversed = assessTeams(p(awayCents / 100), p(homeCents / 100))!;
    assert.equal(reversed.group, result.group); assert.equal(reversed.gap, result.gap);
    if (homeCents !== awayCents) assert.notEqual(reversed.orientation, result.orientation);
    verified++;
  }
}
for (let netCents = 0; netCents <= 10000; netCents++) {
  assert.equal(websitePriceFromNet(netCents / 100), (netCents + 100) / 100);
}
// A known market name must not legitimise invalid participants or an extra third outcome.
for (const [name, names] of [
  ['BTTS', ['Yes', 'No', 'Draw']],
  ['Total Goals', ['Over 2.5', 'Under 2.5', 'Exactly 2.5']],
  ['Home No Bet', ['Home', 'Draw']],
  ['Away No Bet', ['Away', 'Draw']],
] as const) {
  assert.equal(opposingPairs({ id: 'invalid', name, selections: names.map((name) => ({ ...p(2), name })) }).length, 0, `${name} must reject invalid opposition`);
}
console.log(`Bookmaker classification passed: ${verified} independently checked price pairs, 10001 conversions, boundary/adapter/filter/market safeguards`);
