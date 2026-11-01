import assert from 'node:assert/strict';
import { mergeCompetitionEvents, paginateFusionRows } from '../services/hollywoodFusionView';

const initialEvents = [{ id: 7, betTypes: [{ eventBetTypeMapID: 15, price: 2 }] },
  { id: 3, betTypes: [{ eventBetTypeMapID: 15, price: 3 }] }];
const expandedEvents = [{ id: 7, betTypes: [{ eventBetTypeMapID: 22, price: 1.5 }] },
  { id: 3, betTypes: [{ eventBetTypeMapID: 15, price: 3.2 }] },
  { id: 9, betTypes: [{ eventBetTypeMapID: 60, price: 1.8 }] }];
const merged = mergeCompetitionEvents(initialEvents, expandedEvents);
assert.deepEqual(merged.map((event) => event.id), [7, 3, 9]);
assert.equal(merged[0].betTypes.length, 2, 'A failed second 1X2 fetch must not discard the first prices');
assert.equal(merged[1].betTypes[0].price, 3.2, 'Latest prices replace the same market group');
assert.equal(initialEvents[0].betTypes.length, 1, 'Keep the initial response unmodified');

// A competition containing more than a page of fixtures, with several selections per fixture.
const rows = Array.from({ length: 23 }, (_, index) => ['Home', 'Draw', 'Away'].map((selection) => ({
  eventId: index + 1, fixture: `Club ${index + 1} vs Visitors`, marketName: 'Full Time', selection,
}))).flat();
rows.push({ eventId: 1, fixture: 'Club 1 vs Visitors', marketName: 'Both Teams to Score', selection: 'Yes' });

const first = paginateFusionRows(rows, '', '', 0);
assert.equal(first.fixtureCount, 23);
assert.equal(first.pageCount, 3);
assert.equal(first.visibleFixtureCount, 10);
assert.equal(first.rows.filter((row) => row.eventId === 1).length, 4, 'All fixture selections stay together');
const second = paginateFusionRows(rows, '', '', 1);
assert.equal(second.rows[0].eventId, 11, 'Paging follows provider fixture order');
assert.ok(second.rows.every((row) => !first.rows.some((previous) => previous.eventId === row.eventId)));
const last = paginateFusionRows(rows, '', '', 99);
assert.equal(last.page, 2, 'Clamp the page after the result set shrinks');
assert.equal(last.visibleFixtureCount, 3);
const search = paginateFusionRows(rows, '  CLUB 1 VS  ', '', 2);
assert.equal(search.fixtureCount, 1);
assert.equal(search.rows.length, 4);
assert.equal(search.page, 0);
const market = paginateFusionRows(rows, '', 'Both Teams to Score', 0);
assert.equal(market.rows.length, 1);
assert.equal(market.fixtureCount, 1);
const empty = paginateFusionRows([], '', '', 0);
assert.equal(empty.rows.length, 0, 'Empty live results remain empty, with no sample substitution');
assert.equal(empty.fixtureCount, 0);
assert.equal(paginateFusionRows(rows, 'not a club', '', 0).fixtureCount, 0);
console.log('Hollywood fixture search, market filters, order and pagination passed');
