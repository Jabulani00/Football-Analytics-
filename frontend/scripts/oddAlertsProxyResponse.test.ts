import { sanitizeOddAlertsResponseBody } from '../services/oddAlertsProxyResponse';

function check(name: string, value: boolean): void {
  if (!value) throw new Error(`Failed: ${name}`);
  console.log(`✓ ${name}`);
}

const providerToken = 'test-token-never-exposed';
const upstreamUrl = `https://data.oddalerts.com/api/fixtures/upcoming?api_token=${providerToken}&days=11&page=2`;
const body = JSON.stringify({
  info: {
    next_page_url: upstreamUrl,
    prev_page_url: false,
  },
  data: [],
});
const sanitized = sanitizeOddAlertsResponseBody(body, providerToken);
const parsed = JSON.parse(sanitized) as {
  info: { next_page_url: string; prev_page_url: boolean };
};

check('upstream pagination links are rewritten through the same-origin proxy',
  parsed.info.next_page_url.startsWith('/oddalerts?path=fixtures%2Fupcoming&'));
check('rewritten links preserve paging filters and omit the API token',
  parsed.info.next_page_url.includes('days=11')
    && parsed.info.next_page_url.includes('page=2')
    && !sanitized.includes(providerToken)
    && !sanitized.includes('api_token='));
check('non-string pagination metadata remains unchanged', parsed.info.prev_page_url === false);

const nested = sanitizeOddAlertsResponseBody(JSON.stringify({
  detail: `Request failed: https://example.test/?api_token=${providerToken}`,
  api_token: providerToken,
}), providerToken);
check('tokens in arbitrary provider fields are redacted', !nested.includes(providerToken));
