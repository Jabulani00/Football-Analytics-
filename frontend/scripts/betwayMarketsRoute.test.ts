import assert from 'node:assert/strict';

import { GET } from '../app/betway-markets+api';

async function main() {
  const originalFetch = globalThis.fetch;
  let upstreamUrl = '';
  globalThis.fetch = (async (input) => {
    upstreamUrl = String(input);
    return Response.json({ marketGroupNames: ['Main'], marketsInGroup: [], outcomes: [], prices: [] });
  }) as typeof fetch;

  try {
    const invalid = await GET(new Request('https://example.test/betway-markets?eventId=not-a-number'));
    assert.equal(invalid.status, 400);

    const response = await GET(new Request(
      'https://example.test/betway-markets?eventId=74994250&group=Build+A+Bet&buildABet=true',
    ));
    assert.equal(response.status, 200);
    const parsed = new URL(upstreamUrl);
    assert.equal(parsed.hostname, 'www.betway.co.za');
    assert.equal(parsed.searchParams.get('eventId'), '74994250');
    assert.equal(parsed.searchParams.get('marketGroupId'), 'Build A Bet');
    assert.equal(parsed.searchParams.get('isBuildABetOnly'), 'true');
    assert.equal(parsed.searchParams.get('take'), '500');
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('Betway full-market API route tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
