import { POST } from '../app/betway-status+api';

const originalToken = process.env.BETWAY_STATUS_PROXY_TOKEN;
const originalApiKey = process.env.API_FOOTBALL_KEY;
const originalFetch = globalThis.fetch;
const token = 'test-proxy-token-with-at-least-thirty-two-chars';

function check(name: string, condition: boolean): void {
  if (!condition) throw new Error(`Failed: ${name}`);
  console.log(`  ✓ ${name}`);
}

const candidate = {
  episode_id: 'episode-1',
  provider_event_id: 'betway-1',
  home_team: 'Alpha FC',
  away_team: 'Bravo United',
  competition: 'Premier League, South Africa',
  kickoff_utc: '2026-10-12T20:00:00.000Z',
};
const allowedDates = ['2026-10-11', '2026-10-12', '2026-10-13'];

async function run(): Promise<void> {
  process.env.BETWAY_STATUS_PROXY_TOKEN = token;
  process.env.API_FOOTBALL_KEY = 'test-api-key';

  console.log('\nProtected Betway status route');

  let upstreamCalls = 0;
  globalThis.fetch = (async () => {
    upstreamCalls += 1;
    return Response.json({ response: [], errors: {} });
  }) as typeof fetch;
  const unauthorized = await POST(new Request('https://local/betway-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidates: [candidate], allowed_dates: allowedDates }),
  }));
  check('unauthorized requests are rejected before API-Football calls', unauthorized.status === 401 && upstreamCalls === 0);

  const requestedDates: string[] = [];
  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    const date = url.searchParams.get('date') ?? '';
    requestedDates.push(date);
    return Response.json({
      response: date === '2026-10-12'
        ? [{
            fixture: {
              id: 101,
              date: '2026-10-12T20:00:00+00:00',
              status: { short: 'NS' },
            },
            teams: { home: { name: 'Alpha' }, away: { name: 'Bravo United' } },
            league: { name: 'Premier League', country: 'South Africa' },
          }]
        : [],
      errors: {},
    });
  }) as typeof fetch;
  const verifiedResponse = await POST(new Request('https://local/betway-status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ candidates: [candidate], allowed_dates: allowedDates }),
  }));
  const verifiedBody = await verifiedResponse.json() as {
    results: Array<{ decision: string; source_fixture_id: string | null }>;
  };
  check(
    'authorized lookup fetches the candidate date window and verifies a unique upcoming match',
    verifiedResponse.status === 200 &&
      verifiedBody.results[0]?.decision === 'verified' &&
      verifiedBody.results[0]?.source_fixture_id === '101' &&
      requestedDates.length === 3 &&
      allowedDates.every((date) => requestedDates.includes(date)),
  );

  let failedDateCalls = 0;
  globalThis.fetch = (async () => {
    failedDateCalls += 1;
    return failedDateCalls === 1
      ? new Response('upstream unavailable', { status: 503 })
      : Response.json({ response: [], errors: {} });
  }) as typeof fetch;
  const incompleteResponse = await POST(new Request('https://local/betway-status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ candidates: [candidate], allowed_dates: allowedDates }),
  }));
  const incompleteBody = await incompleteResponse.json() as {
    results: Array<{ decision: string; reason: string | null }>;
  };
  check(
    'a failed upstream date lookup stays unverified',
    incompleteResponse.status === 200 &&
      incompleteBody.results[0]?.decision === 'unverified' &&
      incompleteBody.results[0]?.reason === 'upstream_http_503',
  );

  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.BETWAY_STATUS_PROXY_TOKEN;
  else process.env.BETWAY_STATUS_PROXY_TOKEN = originalToken;
  if (originalApiKey === undefined) delete process.env.API_FOOTBALL_KEY;
  else process.env.API_FOOTBALL_KEY = originalApiKey;
}

run().catch((error: unknown) => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.BETWAY_STATUS_PROXY_TOKEN;
  else process.env.BETWAY_STATUS_PROXY_TOKEN = originalToken;
  if (originalApiKey === undefined) delete process.env.API_FOOTBALL_KEY;
  else process.env.API_FOOTBALL_KEY = originalApiKey;
  console.error(error);
  process.exitCode = 1;
});
