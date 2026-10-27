import assert from 'node:assert/strict';

import { GET } from '../app/hollywood+api';

const originalFetch = globalThis.fetch;

async function main(): Promise<void> {
  try {
    let upstreamUrl = '';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      upstreamUrl = String(input);
      return Response.json({ event: { id: 9505210, betTypes: [] } });
    }) as typeof fetch;

    const response = await GET(new Request(
      'https://scoreline.test/hollywood?host=events&path=api%2Fv2%2Fevents%2Feps%2Fevents%2F9505210&lang=en',
    ));

    assert.equal(response.status, 200);
    assert.equal(
      upstreamUrl,
      'https://sport-events-api.hollywoodbets.net/api/v2/events/eps/events/9505210?lang=en',
    );

    const rejected = await GET(new Request(
      'https://scoreline.test/hollywood?host=events&path=api%2Fv3%2Fprivate%2F9505210',
    ));
    assert.equal(rejected.status, 400);

    console.log('Hollywood proxy route tests passed');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void main();
