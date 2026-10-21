import assert from 'node:assert/strict';
import {
  BETWAY_UPCOMING_API_URL,
  IncompleteSnapshotError,
  captureBetwaySnapshot,
  captureBetwaySnapshotWithRetries,
} from '../../supabase/functions/_shared/betwaySnapshot';

const capturedAt = new Date('2026-10-11T20:00:00Z');

function event(id: number, overrides: Record<string, unknown> = {}) {
  return {
    eventId: id, isActive: true, isFinished: false, isLive: false, shouldDisplay: true,
    isOutright: false, name: 'Alpha FC vs. Bravo United', displayName: 'Alpha FC vs. Bravo United',
    expectedStartEpoch: new Date('2026-10-12T20:00:00Z').getTime() / 1_000,
    homeTeam: 'Alpha FC', awayTeam: 'Bravo United', league: 'Premier League',
    region: 'South Africa', ...overrides,
  };
}

function page(events: ReturnType<typeof event>[], final: boolean) {
  const markets: Record<string, unknown>[] = [];
  const outcomes: Record<string, unknown>[] = [];
  const prices: Record<string, unknown>[] = [];
  for (const fixture of events) {
    const marketId = `market-${fixture.eventId}`;
    markets.push({ marketId, eventId: fixture.eventId, marketTypeCName: 'win-draw-win',
      isActive: true, isSuspended: false, shouldDisplay: true });
    [['Alpha FC', 2.1], ['Draw', 3.2], ['Bravo United', 3.4]].forEach(([name, price], offset) => {
      const outcomeId = `${fixture.eventId}-${offset}`;
      outcomes.push({ outcomeId, eventId: fixture.eventId, marketId, name, displayName: name,
        index: offset + 6, isTradingActive: true, shouldDisplay: true });
      prices.push({ outcomeId, priceDecimal: price });
    });
  }
  return { events, markets, outcomes, prices, isFinalPage: final };
}

function fetchPages(pages: unknown[]) {
  const urls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    urls.push(String(input));
    const body = pages.shift();
    return new Response(JSON.stringify(body), { status: body ? 200 : 503,
      headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, urls };
}

async function main() {
const complete = fetchPages([page([event(1), event(2)], false), page([event(3)], true)]);
const snapshot = await captureBetwaySnapshot({ capturedAt, pageSize: 2, fetchImpl: complete.fetchImpl });
assert.equal(snapshot.complete, true);
assert.equal(snapshot.pages_captured, 2);
assert.equal(snapshot.source_event_count, 3);
assert.equal(snapshot.fixtures[0].kickoff_label, '2026-10-12 22:00');
assert.deepEqual(
  [snapshot.fixtures[0].odds_home, snapshot.fixtures[0].odds_draw, snapshot.fixtures[0].odds_away],
  [2.1, 3.2, 3.4],
);
assert.equal(new URL(complete.urls[1]).searchParams.get('Skip'), '2');
assert.ok(complete.urls[0].startsWith(BETWAY_UPCOMING_API_URL));

const preferredMarketPage = page([event(4)], true);
preferredMarketPage.markets.unshift({
  marketId: 'market-4-inactive', eventId: 4, marketTypeCName: 'win-draw-win',
  isActive: false, isSuspended: true, shouldDisplay: false,
});
const preferred = await captureBetwaySnapshot({
  capturedAt,
  fetchImpl: fetchPages([preferredMarketPage]).fetchImpl,
});
assert.deepEqual(
  [preferred.fixtures[0].odds_home, preferred.fixtures[0].odds_draw, preferred.fixtures[0].odds_away],
  [2.1, 3.2, 3.4],
);

await assert.rejects(
  captureBetwaySnapshot({ capturedAt, pageSize: 1, pageLimit: 1,
    fetchImpl: fetchPages([page([event(1)], false)]).fetchImpl }),
  (error: unknown) => error instanceof IncompleteSnapshotError && /page limit/.test(error.message),
);

const overlap = await captureBetwaySnapshot({ capturedAt, pageSize: 1,
  fetchImpl: fetchPages([page([event(1)], false), page([event(1)], true)]).fetchImpl });
assert.equal(overlap.fixtures.length, 1);

const stabilized = await captureBetwaySnapshotWithRetries({ capturedAt, maxAttempts: 2,
  fetchImpl: fetchPages([page([event(1)], true), page([event(2)], true)]).fetchImpl });
assert.deepEqual(stabilized.fixtures.map((fixture) => fixture.provider_event_id).sort(), ['1', '2']);

const empty = await captureBetwaySnapshot({ capturedAt, fetchImpl: fetchPages([page([], true)]).fetchImpl });
assert.equal(empty.fixtures.length, 0);

console.log('Betway Edge snapshot tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
