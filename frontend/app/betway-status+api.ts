import {
  decideBetwayRemoval,
  verificationDates,
  type ApiFootballFixture,
  type BetwayVerificationCandidate,
} from '@/services/betwayStatusVerification';

const API_FOOTBALL_URL = 'https://v3.football.api-sports.io/fixtures';
const MAX_CANDIDATES = 5;

type ApiFootballEnvelope = {
  response?: unknown;
  errors?: Record<string, unknown> | string[];
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function isBearerValid(header: string | null, expected: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const supplied = new TextEncoder().encode(header.slice('Bearer '.length));
  const secret = new TextEncoder().encode(expected);
  if (supplied.length !== secret.length) return false;
  let difference = 0;
  for (let index = 0; index < supplied.length; index += 1) {
    difference |= supplied[index] ^ secret[index];
  }
  return difference === 0;
}

function isCandidate(value: unknown): value is BetwayVerificationCandidate {
  if (value == null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.episode_id === 'string' &&
    typeof candidate.provider_event_id === 'string' &&
    typeof candidate.home_team === 'string' &&
    typeof candidate.away_team === 'string' &&
    (typeof candidate.competition === 'string' || candidate.competition === null) &&
    typeof candidate.kickoff_utc === 'string' &&
    Number.isFinite(Date.parse(candidate.kickoff_utc))
  );
}

function isFixture(value: unknown): value is ApiFootballFixture {
  if (value == null || typeof value !== 'object') return false;
  const fixture = value as Record<string, unknown>;
  const event = fixture.fixture as Record<string, unknown> | undefined;
  const teams = fixture.teams as Record<string, unknown> | undefined;
  const league = fixture.league as Record<string, unknown> | undefined;
  const home = teams?.home as Record<string, unknown> | undefined;
  const away = teams?.away as Record<string, unknown> | undefined;
  const status = event?.status as Record<string, unknown> | undefined;
  return (
    typeof event?.id === 'number' &&
    typeof event.date === 'string' &&
    typeof status?.short === 'string' &&
    typeof home?.name === 'string' &&
    typeof away?.name === 'string' &&
    typeof league?.name === 'string' &&
    (typeof league.country === 'string' || league.country === null)
  );
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function POST(request: Request): Promise<Response> {
  const proxyToken = process.env.BETWAY_STATUS_PROXY_TOKEN?.trim();
  const apiKey = process.env.API_FOOTBALL_KEY?.trim();
  if (!proxyToken || proxyToken.length < 32 || !apiKey) {
    return json({ error: 'Betway status verifier is not configured for production.' }, 503);
  }
  if (!isBearerValid(request.headers.get('authorization'), proxyToken)) {
    return json({ error: 'Unauthorized.' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }
  if (body == null || typeof body !== 'object') {
    return json({ error: 'Request body must be an object.' }, 400);
  }

  const input = body as Record<string, unknown>;
  const candidates = input.candidates;
  const allowedDates = input.allowed_dates;
  if (
    !Array.isArray(candidates) ||
    candidates.length > MAX_CANDIDATES ||
    candidates.some((candidate) => !isCandidate(candidate))
  ) {
    return json({ error: `candidates must contain at most ${MAX_CANDIDATES} valid items.` }, 400);
  }
  if (
    !Array.isArray(allowedDates) ||
    allowedDates.length > MAX_CANDIDATES * 3 ||
    allowedDates.some((date) => !validDate(date))
  ) {
    return json({ error: 'allowed_dates must contain valid UTC dates.' }, 400);
  }

  const candidatesTyped = candidates as BetwayVerificationCandidate[];
  const allowedDateSet = new Set(allowedDates as string[]);
  const requiredDates = new Set(candidatesTyped.flatMap((candidate) => verificationDates(candidate.kickoff_utc)));
  const fixtureByDate = new Map<string, ApiFootballFixture[]>();
  const failedDates = new Map<string, string>();

  for (const date of [...requiredDates].filter((value) => allowedDateSet.has(value)).sort()) {
    const query = new URLSearchParams({ date, timezone: 'UTC' });
    try {
      const response = await fetch(`${API_FOOTBALL_URL}?${query}`, {
        headers: { Accept: 'application/json', 'x-apisports-key': apiKey },
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        failedDates.set(date, `upstream_http_${response.status}`);
        continue;
      }

      const envelope = (await response.json()) as ApiFootballEnvelope;
      const errors = envelope.errors;
      if (errors != null && Object.keys(errors).length > 0) {
        failedDates.set(date, 'provider_api_error');
        continue;
      }
      if (
        !Array.isArray(envelope.response) ||
        envelope.response.some((fixture) => !isFixture(fixture))
      ) {
        failedDates.set(date, 'invalid_provider_response');
        continue;
      }
      fixtureByDate.set(date, envelope.response as ApiFootballFixture[]);
    } catch (error) {
      if (error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name)) {
        failedDates.set(date, 'provider_timeout');
      } else if (error instanceof TypeError) {
        failedDates.set(date, 'provider_network_error');
      } else if (error instanceof SyntaxError) {
        failedDates.set(date, 'invalid_provider_json');
      } else {
        throw error;
      }
    }
  }

  const results = candidatesTyped.map((candidate) => {
    const dates = verificationDates(candidate.kickoff_utc);
    if (dates.length !== 3 || dates.some((date) => !allowedDateSet.has(date))) {
      return decideBetwayRemoval(candidate, [], true);
    }
    const failedDate = dates.find((date) => failedDates.has(date));
    if (failedDate) {
      return decideBetwayRemoval(
        candidate,
        [],
        true,
        failedDates.get(failedDate) ?? 'lookup_incomplete',
      );
    }
    const fixtures = dates.flatMap((date) => fixtureByDate.get(date) ?? []);
    return decideBetwayRemoval(candidate, fixtures);
  });

  return json({ results });
}
