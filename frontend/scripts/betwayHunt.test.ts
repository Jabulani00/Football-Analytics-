import assert from 'node:assert/strict';

import {
  BetwayHuntError,
  fetchBetwayHunt,
  latestSuccessfulBetwayRun,
  type BetwayHuntSnapshot,
} from '../services/betwayHunt';

const snapshot: BetwayHuntSnapshot = {
  bookmaker: 'Betway',
  historyAvailable: true,
  runs: [
    {
      run_id: 'run-1',
      captured_at: '2026-10-24T10:00:00.000Z',
      completed_at: '2026-10-24T10:00:02.000Z',
      status: 'complete',
      pages_captured: 2,
      source_event_count: 1,
      excluded_event_count: 0,
      fixture_count: 1,
    },
  ],
  currentEvents: [],
  verifiedRemovals: [],
  pendingRemovals: [],
  changes: [],
};

async function main() {
  let requested = '';
  const fetched = await fetchBetwayHunt('https://example.test/betway-hunt', (async (input) => {
    requested = String(input);
    return Response.json(snapshot);
  }) as typeof fetch);
  assert.equal(requested, 'https://example.test/betway-hunt');
  assert.equal(fetched.bookmaker, 'Betway');
  assert.equal(latestSuccessfulBetwayRun(fetched.runs)?.run_id, 'run-1');

  await assert.rejects(
    fetchBetwayHunt('https://example.test/invalid', (async () =>
      Response.json({ bookmaker: 'Betway' })) as typeof fetch),
    (error: unknown) => error instanceof BetwayHuntError && /invalid snapshot/.test(error.message),
  );

  await assert.rejects(
    fetchBetwayHunt('https://example.test/failure', (async () =>
      new Response('upstream failed', { status: 502 })) as typeof fetch),
    (error: unknown) => error instanceof BetwayHuntError && error.status === 502,
  );

  console.log('Betway Hunt frontend contract tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

